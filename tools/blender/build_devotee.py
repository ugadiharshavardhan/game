"""
Builds the Moonlight Seva devotee from MPFB/MakeHuman (CC0 output) and exports it for Unity.

    blender -b -P tools/blender/build_devotee.py -- --project <game repo> [--skin young_asian_male] [--no-export]

Writes tools/blender/Devotee.blend (rig + meshes, input to retarget_mixamo.py) and
public/assets/models/devotee.glb (character only; retarget_mixamo.py re-exports it with animations).

Re-runnable: every run starts from an empty scene. Renders review images to Tools/Blender/renders.
"""
import argparse
import math
import os
import shutil
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.locationservice import LocationService

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--project", required=True)
ap.add_argument("--skin", default="young_asian_male")
ap.add_argument("--hair", default="short02")
ap.add_argument("--height-macro", type=float, default=0.64)
ap.add_argument("--no-export", action="store_true")
args = ap.parse_args(argv)

OUT_DIR = os.path.join(args.project, "public", "assets", "models")
TEX_DIR = os.path.join(args.project, "tools", "blender", "textures")
RENDER_DIR = os.path.join(args.project, "tools", "blender", "renders")
DATA = LocationService.get_user_data("")
TARGET_HEIGHT = 1.60

# Palette cells (4x4 grid on a 512 px texture) — (column, row)
CELL = {"kurta": (0, 0), "trim": (1, 0), "pyjama": (2, 0), "print": (3, 0), "strap": (0, 1), "bag_inner": (1, 1)}
COLORS = {"kurta": (0.96, 0.62, 0.13), "trim": (0.85, 0.66, 0.22), "pyjama": (0.93, 0.90, 0.82),
          "strap": (0.45, 0.10, 0.12), "bag_inner": (0.20, 0.15, 0.30)}


def asset(sub, name, ext):
    path = os.path.join(DATA, sub, name, f"{name}.{ext}")
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    return path


def world_coords(obj):
    return [obj.matrix_world @ v.co for v in obj.data.vertices]


# ---------------------------------------------------------------- human
def build_human():
    bpy.ops.wm.read_homefile(use_empty=True)
    macro = {"gender": 1.0, "age": 0.277, "muscle": 0.5, "weight": 0.42, "proportions": 0.65,
             "height": args.height_macro, "cupsize": 0.5, "firmness": 0.5,
             "race": {"asian": 0.50, "caucasian": 0.20, "african": 0.30}}
    body = HumanService.create_human(macro_detail_dict=macro)
    rig = HumanService.add_builtin_rig(body, "mixamo_unity")
    HumanService.set_character_skin(asset("skins", args.skin, "mhmat"), body, skin_type="MAKESKIN")
    parts = {
        "Eyes": HumanService.add_mhclo_asset(os.path.join(DATA, "eyes", "low-poly", "low-poly.mhclo"), body, asset_type="Eyes"),
        "Eyebrows": HumanService.add_mhclo_asset(asset("eyebrows", "eyebrow001", "mhclo"), body, asset_type="Eyebrows"),
        "Eyelashes": HumanService.add_mhclo_asset(asset("eyelashes", "eyelashes01", "mhclo"), body, asset_type="Eyelashes"),
        "Hair": HumanService.add_mhclo_asset(asset("hair", args.hair, "mhclo"), body, asset_type="Hair"),
    }
    return body, rig, parts


def bake_body(body):
    """Freeze macro shape keys and unmask helpers so they can be cut into clothing."""
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    if body.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(body.modifiers):
        if m.type == "MASK":
            body.modifiers.remove(m)


def split_by_group(body, group, name, keep_face):
    """Duplicate the faces of `group` for which keep_face(world_center) is True into a new object."""
    gi = body.vertex_groups[group].index
    new = body.copy()
    new.data = body.data.copy()
    new.name = new.data.name = name
    bpy.context.collection.objects.link(new)
    bm = bmesh.new()
    bm.from_mesh(new.data)
    deform = bm.verts.layers.deform.active
    mw = body.matrix_world
    doomed = [f for f in bm.faces
              if not all(gi in v[deform] and v[deform][gi] > 0.5 for v in f.verts)
              or not keep_face(mw @ f.calc_center_median())]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(new.data)
    bm.free()
    new.data.materials.clear()
    return new


def remove_helpers_from_body(body):
    bm = bmesh.new()
    bm.from_mesh(body.data)
    deform = bm.verts.layers.deform.active
    helper = {body.vertex_groups[n].index for n in ("HelperGeometry", "JointCubes") if n in body.vertex_groups}
    doomed = [v for v in bm.verts if any(g in v[deform] and v[deform][g] > 0.5 for g in helper)]
    bmesh.ops.delete(bm, geom=doomed, context="VERTS")
    bm.to_mesh(body.data)
    bm.free()


def landmarks(body):
    rig = body.parent
    def bone_z(n):
        return (rig.matrix_world @ rig.data.bones[f"mixamorig:{n}"].head_local).z
    return {"hips": bone_z("Hips"), "waist": bone_z("Spine"), "knee": bone_z("LeftLeg"),
            "ankle": bone_z("LeftFoot"), "neck": bone_z("Neck"), "top": max(p.z for p in world_coords(body)),
            "hands": [rig.matrix_world @ rig.data.bones[f"mixamorig:{s}Hand"].head_local for s in ("Left", "Right")]}


# ---------------------------------------------------------------- clothing
def offset_along_normals(obj, distance):
    obj.data.update()
    for v in obj.data.vertices:
        v.co += v.normal * distance


def flare_skirt(obj, lm):
    """Push skirt vertices out radially from the body axis, more toward the hem, for a kurta drape."""
    span = max(lm["hips"] - lm["knee"], 1e-3)
    for v in obj.data.vertices:
        z = (obj.matrix_world @ v.co).z
        t = min(max((lm["hips"] - z) / span, 0.0), 1.0)
        radial = Vector((v.co.x, v.co.y, 0.0))
        v.co += radial * (0.02 + 0.18 * t)


def soften_skirt_weights(obj):
    """Blend each skirt vertex 40% toward Hips so the kurta sways instead of splitting with the legs."""
    hips = obj.vertex_groups.get("mixamorig:Hips") or obj.vertex_groups.new(name="mixamorig:Hips")
    for v in obj.data.vertices:
        for g in v.groups:
            g.weight *= 0.6
        hips.add([v.index], 0.4, "ADD")


def add_collar(obj, lm):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    top = max(v.co.z for v in bm.verts)
    rim = [e for e in bm.edges if e.is_boundary and all(v.co.z > top - 0.03 for v in e.verts)]
    rim_verts = {v for e in rim for v in e.verts}
    level = sorted(v.co.z for v in rim_verts)[len(rim_verts) // 2]
    for v in rim_verts:
        v.co.z = level
    ret = bmesh.ops.extrude_edge_only(bm, edges=rim)
    new_verts = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=new_verts, vec=(0.0, 0.0, 0.032))
    bm.to_mesh(obj.data)
    bm.free()


def build_clothes(body, lm):
    kurta_top = split_by_group(body, "helper-tights", "Devotee_KurtaTop", lambda c: c.z >= lm["hips"] - 0.04)
    skirt = split_by_group(body, "helper-skirt", "Devotee_Skirt", lambda c: lm["knee"] + 0.03 <= c.z <= lm["hips"] + 0.01)
    pyjama = split_by_group(body, "helper-tights", "Devotee_Pyjama", lambda c: lm["ankle"] + 0.05 <= c.z <= lm["hips"] - 0.08)
    offset_along_normals(kurta_top, 0.012)
    offset_along_normals(pyjama, 0.010)
    flare_skirt(skirt, lm)
    soften_skirt_weights(skirt)
    add_collar(kurta_top, lm)
    kurta = join([kurta_top, skirt], "Devotee_Kurta")
    return kurta, pyjama


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = objs[0].data.name = name
    return objs[0]


def build_jhola(rig, kurta, lm):
    """Cloth bag on the left hip with a strap from the right shoulder, skinned to Hips/Spine."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.15, -0.13, lm["hips"] - 0.03))
    bag = bpy.context.active_object
    bag.name = bag.data.name = "Devotee_Jhola"
    bag.scale = (0.05, 0.22, 0.24)
    bag.rotation_euler = (0.0, 0.0, math.radians(-55))
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bev = bag.modifiers.new("bevel", "BEVEL")
    bev.width, bev.segments = 0.02, 3
    bpy.ops.object.modifier_apply(modifier="bevel")

    strap = strap_ribbon(kurta, start=Vector((-0.13, -0.02, lm["neck"] - 0.02)), end=Vector((0.15, -0.13, lm["hips"] + 0.09)))
    for o, weights in ((bag, {"mixamorig:Hips": 0.8, "mixamorig:Spine": 0.2}),):
        for n, w in weights.items():
            o.vertex_groups.new(name=n).add([v.index for v in o.data.vertices], w, "REPLACE")
    transfer_weights(kurta, strap)
    fit_uvs_to_cell(bag, "print")
    fit_uvs_to_cell(strap, "strap")
    jhola = join([bag, strap], "Devotee_Jhola")
    parent_to_rig(jhola, rig)
    return jhola


def strap_ribbon(surface, start, end, width=0.035, samples=40, lift=0.012):
    """A ribbon laid over `surface` from start to end, following its shape."""
    bvh = BVHTree.FromObject(surface, bpy.context.evaluated_depsgraph_get())
    center = Vector((0.0, 0.0, (start.z + end.z) / 2))
    pts, nrm = [], []
    for i in range(samples + 1):
        p = start.lerp(end, i / samples)
        p += (p - center).normalized() * 0.0  # straight line; projected below
        loc, n, _, _ = bvh.find_nearest(p)
        pts.append(loc + n * lift)
        nrm.append(n)
    verts, faces = [], []
    for i, (p, n) in enumerate(zip(pts, nrm)):
        tangent = (pts[min(i + 1, samples)] - pts[max(i - 1, 0)]).normalized()
        side = tangent.cross(n).normalized() * (width / 2)
        verts += [p - side, p + side]
        if i:
            a = 2 * (i - 1)
            faces.append((a, a + 1, a + 3, a + 2))
    me = bpy.data.meshes.new("strap")
    me.from_pydata([tuple(v) for v in verts], [], faces)
    obj = bpy.data.objects.new("strap", me)
    bpy.context.collection.objects.link(obj)
    obj.data.uv_layers.new(name="UVMap")
    return obj


def transfer_weights(source, target):
    bpy.context.view_layer.objects.active = target
    for g in source.vertex_groups:
        target.vertex_groups.new(name=g.name)
    dt = target.modifiers.new("dt", "DATA_TRANSFER")
    dt.object = source
    dt.use_vert_data = True
    dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "POLYINTERP_NEAREST"
    bpy.ops.object.modifier_apply(modifier="dt")


def parent_to_rig(obj, rig):
    obj.parent = rig
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = rig


def delete_covered_body(body, clothes, max_gap=0.03):
    """Delete body faces completely hidden under clothing (prevents poke-through, saves triangles)."""
    dg = bpy.context.evaluated_depsgraph_get()
    trees = [BVHTree.FromObject(c, dg) for c in clothes]
    mw = body.matrix_world
    body.data.update()
    covered = set()
    for v in body.data.vertices:
        origin = mw @ v.co
        direction = (mw.to_3x3() @ v.normal).normalized()
        if any(t.ray_cast(origin + direction * 0.001, direction, max_gap)[0] is not None for t in trees):
            covered.add(v.index)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    doomed = [f for f in bm.faces if all(v.index in covered for v in f.verts)]
    bmesh.ops.delete(bm, geom=doomed, context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(body.data)
    bm.free()
    return len(doomed)


# ---------------------------------------------------------------- materials & textures
def palette_image():
    size, cell = 512, 128
    px = np.ones((size, size, 4), dtype=np.float32)
    rng = np.random.default_rng(7)
    for key, (cx, cy) in CELL.items():
        y0, x0 = cy * cell, cx * cell
        if key == "print":  # indigo block print with cream motifs
            yy, xx = np.mgrid[0:cell, 0:cell]
            motif = ((np.sin(xx / 5.0) * np.sin(yy / 5.0)) > 0.55) | (((xx + yy) % 32) < 2)
            base = np.where(motif[..., None], [0.92, 0.88, 0.78], [0.12, 0.16, 0.38])
            px[y0:y0 + cell, x0:x0 + cell, :3] = base
        else:
            noise = rng.normal(0.0, 0.015, (cell, cell, 1))
            px[y0:y0 + cell, x0:x0 + cell, :3] = np.clip(np.array(COLORS[key]) + noise, 0, 1)
        if key == "trim":  # thin woven stripes
            px[y0:y0 + cell:12, x0:x0 + cell, :3] *= 0.75
    img = bpy.data.images.new("Devotee_Cloth", size, size, alpha=False)
    img.pixels.foreach_set(px.ravel())
    return img


def fit_uvs_to_cell(obj, cell_key, face_filter=None, margin=0.01):
    cx, cy = CELL[cell_key]
    lo = Vector((cx / 4 + margin, cy / 4 + margin))
    span = 0.25 - 2 * margin
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
    for poly in obj.data.polygons:
        if face_filter and not face_filter(obj, poly):
            continue
        for li in poly.loop_indices:
            u, v = uv.data[li].uv
            uv.data[li].uv = (lo.x + (u % 1.0) * span, lo.y + (v % 1.0) * span)


def is_trim(lm):
    def f(obj, poly):
        c = obj.matrix_world @ poly.center
        near_wrist = any((c - h).length < 0.075 for h in lm["hands"])
        return c.z < lm["knee"] + 0.07 or c.z > lm["neck"] - 0.005 or near_wrist
    return f


def material(name, image=None, alpha=False):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    if image is not None:
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha:
            mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            mat.surface_render_method = "DITHERED"
    return mat


def set_single_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def image_of(obj):
    for slot in obj.material_slots:
        if slot.material and slot.material.use_nodes:
            for n in slot.material.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image and "normal" not in n.image.name.lower():
                    return n.image
    return None


def paint_tilak(body, skin_image, brows):
    """Kumkum tilak: a small vertical red mark on the forehead, painted into the skin texture."""
    browc = sum((brows.matrix_world @ v.co for v in brows.data.vertices), Vector()) / len(brows.data.vertices)
    target = Vector((0.0, browc.y - 0.01, browc.z + 0.016))
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    loc, _, face_index, _ = bvh.find_nearest(target)
    poly = body.data.polygons[face_index]
    uv_layer = body.data.uv_layers.active.data
    uvc = sum((uv_layer[li].uv for li in poly.loop_indices), Vector((0, 0))) / len(poly.loop_indices)
    w, h = skin_image.size
    px = np.array(skin_image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    cx, cy = uvc.x * w, uvc.y * h
    yy, xx = np.mgrid[0:h, 0:w]
    rx, ry = w * 0.0032, h * 0.0032  # round kumkum dot, ~7 mm
    mask = np.clip(1.2 - (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2), 0, 1)[..., None]
    px[..., :3] = px[..., :3] * (1 - mask * 0.9) + np.array([0.72, 0.06, 0.05]) * mask * 0.9
    skin_image.pixels.foreach_set(px.ravel())


def tint_image(img, rgb):
    """Multiply an image's colour in place (alpha untouched)."""
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    px[..., :3] *= np.array(rgb, dtype=np.float32)
    img.pixels.foreach_set(px.ravel())


def save_image(img, name):
    os.makedirs(TEX_DIR, exist_ok=True)
    path = os.path.join(TEX_DIR, f"{name}.png")
    source = bpy.path.abspath(img.filepath) if img.filepath else ""
    if not img.is_dirty and source and os.path.exists(source):
        if source.lower().endswith(".png"):
            shutil.copyfile(source, path)
            return path
        img.reload()  # non-PNG source (e.g. jpg): load pixels, then re-encode as PNG below
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return path


# ---------------------------------------------------------------- review renders
def render_views(target_height):
    os.makedirs(RENDER_DIR, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 900, 1200
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.18, 0.17, 0.22, 1)
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    views = {"front": (0, -3.2, 0.95, 0), "side": (3.2, 0, 0.95, 90), "back": (0, 3.2, 0.95, 180),
             "three_quarter": (2.2, -2.3, 1.1, 45), "face": (0, -0.75, target_height - 0.1, 0)}
    for name, (x, y, z, yaw) in views.items():
        cam.location = (x, y, z)
        look = Vector((0, 0, z if name != "face" else z)) - cam.location
        cam.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 50 if name != "face" else 85
        scene.render.filepath = os.path.join(RENDER_DIR, f"{name}.png")
        bpy.ops.render.render(write_still=True)


def export_glb(rig, meshes, path, animations=False):
    """Character (+ optional NLA-stashed actions) as a single binary glTF for Three.js."""
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                              export_skins=True, export_animations=animations, export_animation_mode="ACTIONS",
                              export_def_bones=True, export_image_format="WEBP", export_image_quality=85,
                              export_apply=False)


# ---------------------------------------------------------------- main
def main():
    body, rig, parts = build_human()
    bake_body(body)
    lm = landmarks(body)
    kurta, pyjama = build_clothes(body, lm)
    remove_helpers_from_body(body)
    body.name = body.data.name = "Devotee_Body"
    for obj in (kurta, pyjama):
        obj.parent = rig
    jhola = build_jhola(rig, kurta, lm)
    removed = delete_covered_body(body, [kurta, pyjama])
    # Keep the face at full detail; thin out hands, feet and the remaining skin.
    protect = body.vertex_groups.new(name="DecimateProtect")
    neck_z = lm["neck"] + 0.03
    protect.add([v.index for v in body.data.vertices if (body.matrix_world @ v.co).z > neck_z], 1.0, "REPLACE")
    for o, ratio in ((pyjama, 0.5), (body, 0.45)):  # kurta keeps its edge loops so the hem band stays clean
        dec = o.modifiers.new("decimate", "DECIMATE")
        dec.ratio = ratio
        if o is body:
            dec.vertex_group = protect.name
            dec.invert_vertex_group = True
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_move_to_index(modifier="decimate", index=0)
        bpy.ops.object.modifier_apply(modifier="decimate")

    skin_img = image_of(body)
    tint_image(skin_img, (0.80, 0.64, 0.52))   # warm medium-brown South Asian skin
    paint_tilak(body, skin_img, parts["Eyebrows"])
    cloth_img = palette_image()
    fit_uvs_to_cell(kurta, "kurta")
    fit_uvs_to_cell(kurta, "trim", is_trim(lm))
    fit_uvs_to_cell(pyjama, "pyjama")
    cloth = material("Devotee_Cloth", cloth_img)
    for o in (kurta, pyjama, jhola):
        set_single_material(o, cloth)
    set_single_material(body, material("Devotee_Skin", skin_img))
    names = {"Eyes": "Devotee_Eyes", "Eyebrows": "Devotee_Brows", "Eyelashes": "Devotee_Lashes", "Hair": "Devotee_Hair"}
    for key, obj in parts.items():
        img = image_of(obj)
        if key == "Hair" and img is not None:
            tint_image(img, (0.30, 0.27, 0.25))  # near-black hair
        obj.name = obj.data.name = names[key]
        set_single_material(obj, material(names[key], img, alpha=key in ("Eyebrows", "Eyelashes", "Hair")))
        if img:
            save_image(img, names[key])
    save_image(skin_img, "Devotee_Skin")
    save_image(cloth_img, "Devotee_Cloth")

    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.parent == rig]
    for o in meshes:
        print(f"[devotee]   {o.name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    height = max(p.z for p in world_coords(body)) - min(p.z for p in world_coords(body))
    print(f"[devotee] body faces removed under clothes: {removed}")
    print(f"[devotee] meshes: {[o.name for o in meshes]}")
    print(f"[devotee] triangles: {tris}  height: {height:.3f} m  materials: {len({s.material.name for o in meshes for s in o.material_slots})}")

    render_views(height)
    if not args.no_export:
        bpy.ops.object.select_all(action="DESELECT")
        rig.select_set(True)
        for o in meshes:
            o.select_set(True)
        os.makedirs(OUT_DIR, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.project, "tools", "blender", "Devotee.blend"))
        export_glb(rig, meshes, os.path.join(OUT_DIR, "devotee.glb"))
        print("[devotee] exported")


main()
