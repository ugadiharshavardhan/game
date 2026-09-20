"""
Shared pieces for build_characters.py: the human, the clothes cut from its body, cloth and skin
textures made in numpy, and the review renders. Runs inside Blender (bpy), headless.

Nothing here downloads anything. Every texture is generated, and the body, hair and eyes come from
MPFB's CC0 asset library, so the characters carry no licence.
"""
import math
import os
import shutil

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc

from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.locationservice import LocationService

DATA = LocationService.get_user_data("")


def asset(sub, name, ext):
    path = os.path.join(DATA, sub, name, f"{name}.{ext}")
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    return path


def world_coords(obj):
    return [obj.matrix_world @ v.co for v in obj.data.vertices]


def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- the human
def build_human(spec):
    """A bare human with the MPFB mixamo rig, skin, eyes, brows, lashes and (optionally) hair."""
    bpy.ops.wm.read_homefile(use_empty=True)
    macro = {"gender": spec["gender"], "age": spec["age"], "muscle": spec["muscle"], "weight": spec["weight"],
             "proportions": 0.65, "height": spec["height"], "cupsize": spec.get("cup", 0.5), "firmness": 0.5,
             "race": {"asian": 0.50, "caucasian": 0.20, "african": 0.30}}
    body = HumanService.create_human(macro_detail_dict=macro)
    rig = HumanService.add_builtin_rig(body, "mixamo_unity")
    HumanService.set_character_skin(asset("skins", spec["skin"], "mhmat"), body, skin_type="MAKESKIN")
    parts = {
        "Eyes": HumanService.add_mhclo_asset(os.path.join(DATA, "eyes", "low-poly", "low-poly.mhclo"), body, asset_type="Eyes"),
        "Eyebrows": HumanService.add_mhclo_asset(asset("eyebrows", spec["brows"], "mhclo"), body, asset_type="Eyebrows"),
        "Eyelashes": HumanService.add_mhclo_asset(asset("eyelashes", "eyelashes01", "mhclo"), body, asset_type="Eyelashes"),
    }
    if spec.get("hair"):
        parts["Hair"] = HumanService.add_mhclo_asset(asset("hair", spec["hair"], "mhclo"), body, asset_type="Hair")
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


def remove_helpers_from_body(body):
    bm = bmesh.new()
    bm.from_mesh(body.data)
    deform = bm.verts.layers.deform.active
    helper = {body.vertex_groups[n].index for n in ("HelperGeometry", "JointCubes") if n in body.vertex_groups}
    doomed = [v for v in bm.verts if any(g in v[deform] and v[deform][g] > 0.5 for g in helper)]
    bmesh.ops.delete(bm, geom=doomed, context="VERTS")
    bm.to_mesh(body.data)
    bm.free()


def bone_head(rig, name):
    return rig.matrix_world @ rig.data.bones[f"mixamorig:{name}"].head_local


def landmarks(body):
    rig = body.parent
    zs = [p.z for p in world_coords(body)]
    lm = {
        "hips": bone_head(rig, "Hips").z, "spine": bone_head(rig, "Spine").z, "spine1": bone_head(rig, "Spine1").z,
        "spine2": bone_head(rig, "Spine2").z, "knee": bone_head(rig, "LeftLeg").z, "ankle": bone_head(rig, "LeftFoot").z,
        "neck": bone_head(rig, "Neck").z, "head": bone_head(rig, "Head").z, "top": max(zs), "bottom": min(zs),
    }
    for side in ("Left", "Right"):
        lm[f"{side}_shoulder"] = bone_head(rig, f"{side}Arm")
        lm[f"{side}_elbow"] = bone_head(rig, f"{side}ForeArm")
        lm[f"{side}_wrist"] = bone_head(rig, f"{side}Hand")
    lm["hands"] = [lm["Left_wrist"], lm["Right_wrist"]]
    return lm


_TRUNK = {}


def trunk_points(body):
    """World-space points of the trunk and legs (arms left out), computed once per body."""
    key = (body.name, len(body.data.vertices))
    if key not in _TRUNK:
        keep = ["Hips", "Spine", "Spine1", "Spine2", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "Neck"]
        groups = {body.vertex_groups[f"mixamorig:{k}"].index for k in keep if f"mixamorig:{k}" in body.vertex_groups}
        mw = body.matrix_world
        _TRUNK[key] = [mw @ v.co for v in body.data.vertices
                       if sum(g.weight for g in v.groups if g.group in groups) > 0.5]
    return _TRUNK[key]


def torso_section(body, z, band=0.012):
    """Centre and half-extents (x, y) of the trunk and legs at height z, arms left out."""
    pts = [p for p in trunk_points(body) if abs(p.z - z) <= band]
    if not pts:
        raise RuntimeError(f"no trunk at z={z:.3f}")
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    return (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2


# ---------------------------------------------------------------- cutting clothes from the body
def split_faces(body, group, name, keep_face):
    """Copy the faces of `group` whose world-space centre passes `keep_face` into a new object."""
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


def offset_along_normals(obj, distance):
    obj.data.update()
    for v in obj.data.vertices:
        v.co += v.normal * distance


def fold_cloth(obj, amplitude, cycles, phase=0.0, up=0.9):
    """Soft vertical folds: a low ripple around the body axis that grows toward the hem, so cloth
    reads as cloth and not as a second skin. Deterministic."""
    obj.data.update()
    zs = [v.co.z for v in obj.data.vertices]
    lo, hi = min(zs), max(zs)
    for v in obj.data.vertices:
        t = 1.0 - (v.co.z - lo) / max(hi - lo, 1e-4)
        ang = math.atan2(v.co.x, v.co.y)
        ripple = math.sin(ang * cycles + phase + v.co.z * 5.0) * 0.6 + math.sin(ang * (cycles * 2 + 1) + v.co.z * 11.0) * 0.4
        v.co += v.normal * (amplitude * (0.25 + 0.75 * (t ** up)) * ripple)


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    objs[0].name = objs[0].data.name = name
    return objs[0]


def soften_weights_toward(obj, bone, keep=0.5):
    """Blend each vertex toward one bone, so a skirt swings with the hips instead of splitting."""
    grp = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
    for v in obj.data.vertices:
        for g in v.groups:
            g.weight *= keep
        grp.add([v.index], 1.0 - keep, "ADD")


def transfer_weights(source, target):
    bpy.context.view_layer.objects.active = target
    for g in source.vertex_groups:
        if g.name not in target.vertex_groups:
            target.vertex_groups.new(name=g.name)
    dt = target.modifiers.new("dt", "DATA_TRANSFER")
    dt.object = source
    dt.use_vert_data = True
    dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "POLYINTERP_NEAREST"
    bpy.ops.object.modifier_apply(modifier="dt")


def parent_to_rig(obj, rig):
    """Parent to the rig and deform with it. Safe to call on something that already does."""
    obj.parent = rig
    mod = next((m for m in obj.modifiers if m.type == "ARMATURE"), None) or obj.modifiers.new("Armature", "ARMATURE")
    mod.object = rig


def mesh_from(name, verts, faces, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    layer = me.uv_layers.new(name="UVMap")
    if uvs:
        for poly in me.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                layer.data[li].uv = uvs[vi]
    return obj


# ---------------------------------------------------------------- garments built from scratch
def wrap_skirt(name, body, z_top, z_hem, ease_top, flare_hem, folds, fold_amp, front_fold_amp=0.0,
               rings=30, segs=72, tile=0.25, span=1.0):
    """A skirt, a dhoti or a saree wrap: an elliptical tube hung from the waist to the ankle.

    Every ring is fitted to the body at its own height, and never narrower than the ring above it —
    hips are wider than a waist, and a skirt fitted to the waist alone lets the hips through. Beyond
    the body it stands off by `ease_top` metres at the waist, widening to `flare_hem` metres at the
    hem. Folds run down it; the ones on the front carry more, which is where a dhoti's pleats and a
    saree's fall are. UV: u runs round the tube in units of `tile` metres, v runs up from the hem in
    metres over `span`.
    """
    verts, faces = [], []
    ring_circ, ring_z = [], []
    height = z_top - z_hem
    # First, measure the body at every ring's height.
    zs = [z_top - height * i / rings for i in range(rings + 1)]
    sect = []
    for z in zs:
        try:
            sect.append(torso_section(body, z, band=0.02))
        except RuntimeError:
            sect.append(sect[-1] if sect else None)
    # A ring must clear the widest the body gets anywhere from the ring above to a few rings below:
    # the hips bulge between two rings, and a tube fitted only at the rings lets the bulge through.
    ahead = 3
    a_run = b_run = 0.0
    cx_run = cy_run = None
    for i, z in enumerate(zs):
        t = i / rings
        cx, cy, _, _ = sect[i]
        a_run = max(a_run, max(sect[k][2] for k in range(i, min(i + ahead + 1, len(sect)))))
        b_run = max(b_run, max(sect[k][3] for k in range(i, min(i + ahead + 1, len(sect)))))
        cx_run = cx if cx_run is None else cx_run * 0.7 + cx * 0.3
        cy_run = cy if cy_run is None else cy_run * 0.7 + cy * 0.3
        stand = ease_top + (flare_hem - ease_top) * (smooth(t) ** 1.15)
        ra, rb = a_run + stand, b_run + stand
        for j in range(segs):
            th = 2 * math.pi * j / segs
            front = max(0.0, -math.sin(th))  # y is negative at the front of the body
            fold = 1 + fold_amp * math.sin(th * folds + t * 3.1) + front_fold_amp * front * math.sin(th * (folds * 1.7) + t * 5.0)
            verts.append((cx_run + ra * math.cos(th) * fold, cy_run + rb * math.sin(th) * fold, z))
        ring_circ.append(2 * math.pi * (ra + rb) / 2)
        ring_z.append(z)
    for i in range(rings):
        for j in range(segs):
            a = i * segs + j
            b = i * segs + (j + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    obj = mesh_from(name, verts, faces)
    # Faces were made in (ring, column) order, so each polygon's corners are known: the corner on
    # the seam takes column `segs`, not column 0, which is what keeps the last column from being
    # stretched across the whole texture.
    layer = obj.data.uv_layers.active
    corners = lambda i, j: [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
    for k, poly in enumerate(obj.data.polygons):
        i, j = divmod(k, segs)
        for li, (ci, cj) in zip(poly.loop_indices, corners(i, j)):
            u = (cj / segs) * ring_circ[ci] / tile
            v = min((ring_z[ci] - z_hem) / span, 1.0)
            layer.data[li].uv = (u, v)
    return obj


def surface_object(objs, name="surface"):
    """One temporary mesh over several objects, for projecting cloth onto whatever is outermost."""
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    for o in objs:
        eval_o = o.evaluated_get(dg)
        me = eval_o.to_mesh()
        me.transform(o.matrix_world)
        bm.from_mesh(me)
        eval_o.to_mesh_clear()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def draped_band(surface_objs, waypoints, widths, lift, name, per_segment=16, cols=5, tile=0.25, span=1.0):
    """A strip of cloth laid over the body along a path: a saree's pallu, an angavastram.

    The path is projected onto the outermost surface and lifted off it; so is every point across
    the strip's width (`cols` of them), which is what makes it follow a shoulder or a chest rather
    than standing off it at the edges. `widths` is one value or one per waypoint. UV: u along the
    band in `tile` metres, v across it in metres over `span`, so the bottom edge of the band is the
    bottom of the texture — where the cloth's border is.
    """
    surf = surface_object(surface_objs)
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(surf, dg)
    pts, wid = [], []
    if not isinstance(widths, (list, tuple)):
        widths = [widths] * len(waypoints)
    for k in range(len(waypoints) - 1):
        for s_ in range(per_segment):
            f = s_ / per_segment
            pts.append(Vector(waypoints[k]).lerp(Vector(waypoints[k + 1]), f))
            wid.append(widths[k] * (1 - f) + widths[k + 1] * f)
    pts.append(Vector(waypoints[-1]))
    wid.append(widths[-1])

    # the centre line, on the surface — and smoothed, so a jump in the surface's normal from one
    # sample to the next cannot become a ruffle in the cloth
    centre, normals = [], []
    for p in pts:
        loc, n, _, _ = bvh.find_nearest(p)
        centre.append(loc)
        normals.append(n)
    for _ in range(3):
        centre = [centre[0]] + [(centre[i - 1] + centre[i] * 2 + centre[i + 1]) / 4 for i in range(1, len(centre) - 1)] + [centre[-1]]
        normals = [normals[0]] + [((normals[i - 1] + normals[i] * 2 + normals[i + 1]) / 4).normalized() for i in range(1, len(normals) - 1)] + [normals[-1]]

    verts, uvs, faces = [], [], []
    run = 0.0
    for i, (c, n, w) in enumerate(zip(centre, normals, wid)):
        tangent = (centre[min(i + 1, len(centre) - 1)] - centre[max(i - 1, 0)]).normalized()
        side = tangent.cross(n).normalized()
        if i:
            run += (c - centre[i - 1]).length
        for k in range(cols):
            off = (k / (cols - 1) - 0.5) * w
            # Down onto the surface along the band's own normal, not to whatever is nearest: at the
            # shoulder "nearest" jumps onto the arm, and the band ruffles over it.
            start = c + side * off + n * 0.10
            hit, hn, _, _ = bvh.ray_cast(start, -n, 0.30)
            verts.append((hit + hn * lift) if hit is not None else (c + side * off + n * lift))
            uvs.append((run / tile, min(k / (cols - 1) * w / span, 1.0)))
        if i:
            base = cols * (i - 1)
            for k in range(cols - 1):
                faces.append((base + k, base + k + 1, base + k + 1 + cols, base + k + cols))
    obj = mesh_from(name, verts, faces, uvs)
    bpy.data.objects.remove(surf)
    return obj


def bead_chain(name, points, radii, squash=1.0, u_seg=6, v_seg=4):
    """Beads (or marigolds) threaded along a path: one small sphere per point, in one mesh."""
    bm = bmesh.new()
    for p, r in zip(points, radii):
        m = Matrix.Translation(p) @ Matrix.Diagonal((1, 1, squash, 1))
        bmesh.ops.create_uvsphere(bm, u_segments=u_seg, v_segments=v_seg, radius=r, matrix=m, calc_uvs=True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return obj


def garland_path(lm, body, sag, count, rx=0.115, ry=0.095, z_offset=0.045):
    """Points on a garland hung round the neck: a loop that drops to `sag` metres at the front."""
    cx, cy, _, _ = torso_section(body, lm["spine2"])
    pts = []
    for k in range(count):
        phi = 2 * math.pi * k / count
        front = max(0.0, math.cos(phi)) ** 1.6
        x = cx + rx * math.sin(phi) * (1 - 0.2 * front)
        y = cy - ry * math.cos(phi) - 0.03 * front
        z = lm["neck"] - z_offset - sag * front
        pts.append(Vector((x, y, z)))
    return pts


def project_out(points, body, lift):
    """Each point moved onto the body's surface and lifted `lift` metres off it, along the normal."""
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    out = []
    for p in points:
        loc, n, _, _ = bvh.find_nearest(p)
        out.append(loc + n * lift)
    return out


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


# ---------------------------------------------------------------- UVs for cloth
def cylinder_uv(obj, z_hem, tile=0.25, span=1.0, ref_radius=0.19):
    """Wrap an object's UVs round the body axis: u in `tile`-metre steps, v up from the hem."""
    me = obj.data
    layer = me.uv_layers.active or me.uv_layers.new(name="UVMap")
    mw = obj.matrix_world
    for poly in me.polygons:
        angs = []
        for vi in poly.vertices:
            p = mw @ me.vertices[vi].co
            angs.append(math.atan2(p.x, p.y))
        # a face that straddles ±π must not span the whole texture
        if max(angs) - min(angs) > math.pi:
            angs = [a + 2 * math.pi if a < 0 else a for a in angs]
        for li, vi, a in zip(poly.loop_indices, poly.vertices, angs):
            p = mw @ me.vertices[vi].co
            layer.data[li].uv = (a * ref_radius / tile, min(max((p.z - z_hem) / span, 0.0), 1.0))


def box_uv(obj, tile=0.25):
    """Planar UVs by dominant axis, for small props (a bag): u,v in `tile`-metre steps."""
    me = obj.data
    layer = me.uv_layers.active or me.uv_layers.new(name="UVMap")
    me.update()
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li, vi in zip(poly.loop_indices, poly.vertices):
            p = me.vertices[vi].co
            u, v = [(p.y, p.z), (p.x, p.z), (p.x, p.y)][ax]
            layer.data[li].uv = ((u / tile) % 1.0 * 0.98 + 0.01, 0.3 + ((v / tile) % 1.0) * 0.25)


# ---------------------------------------------------------------- textures (numpy)
def _image(name, px, colour=True):
    h, w = px.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(px, 0, 1)
    img.pixels.foreach_set(rgba.ravel())
    return img


def _normal_from_height(height, strength):
    gy, gx = np.gradient(height)
    n = np.stack([-gx * strength, -gy * strength, np.ones_like(height)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def weave_field(w, h, seed, period=4):
    """A woven-thread height field, tileable: warp and weft, uneven thread thickness, slubs."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    warp = 0.5 + 0.5 * np.sin(2 * np.pi * xx / period)
    weft = 0.5 + 0.5 * np.sin(2 * np.pi * yy / period)
    over = (((xx // (period / 2)).astype(int) + (yy // (period / 2)).astype(int)) % 2).astype(np.float32)
    field = warp * over + weft * (1 - over)
    thread = rng.normal(0, 0.10, (h, 1)).astype(np.float32) + rng.normal(0, 0.10, (1, w)).astype(np.float32)
    grain = rng.normal(0, 0.05, (h, w)).astype(np.float32)
    return field * 0.55 + thread + grain


# A cloth texture covers 0.25 m across (u) and 1.0 m up (v): 1 mm to the pixel both ways, so the
# weave is the same size in both directions wherever it is used.
CLOTH_W, CLOTH_H, CLOTH_SPAN, CLOTH_TILE = 256, 1024, 1.0, 0.25


def cloth_textures(name, base, border=None, border_m=0.10, motif=None, seed=1, weave_amp=0.09, lines=None):
    """(colour, normal) for one cloth: a woven ground, and an optional woven border along the bottom.

    The border is the bottom `border_m` metres of the texture (v = 0, the hem). The ground fills the
    rest. `motif` picks the border pattern. Both images tile in u; only the border cares about v.
    """
    rng = np.random.default_rng(seed)
    w, h = CLOTH_W, CLOTH_H
    field = weave_field(w, h, seed)
    colour = np.tile(np.array(base, dtype=np.float32), (h, w, 1))
    colour *= (1 + weave_amp * (field - field.mean()))[..., None]
    # a slow, uneven fade across the cloth: cloth is never one flat tone
    slow = rng.normal(0, 1, (h // 32, w // 32)).astype(np.float32)
    slow = np.kron(slow, np.ones((32, 32), dtype=np.float32))
    for _ in range(3):
        slow = (slow + np.roll(slow, 9, 0) + np.roll(slow, -9, 1)) / 3
    colour *= (1 + 0.035 * slow)[..., None]

    rows = int(border_m / CLOTH_SPAN * h)
    if border is not None and rows > 0:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        # Blender image rows run from the bottom: v = 0 is row 0, so the hem's border is the FIRST rows
        band = yy < rows
        bc = np.array(border, dtype=np.float32)
        colour[band] = bc * (1 + weave_amp * 1.4 * (field[band] - field.mean()))[..., None]
        gold = np.array([0.95, 0.74, 0.28], dtype=np.float32)
        if motif == "zari":
            # a lattice of small diamonds, 12 mm to a cell: woven zari, not printed spots
            m = (np.abs((xx % 12) - 6) + np.abs((yy % 12) - 6)) < 3.2
            colour[band & m] = gold * (1 + weave_amp * (field[band & m] - field.mean()))[:, None]
            colour[4:9] = gold
            colour[max(rows - 9, 0):max(rows - 4, 0)] = gold
        elif motif == "kasavu":
            colour[0:9] = gold
            colour[max(rows - 9, 0):rows] = gold
            colour[9:max(rows - 9, 9)] = bc
        elif motif == "stripe":
            colour[0:5] *= 0.6
    for v_at, c in (lines or []):
        r = int(v_at * h)
        colour[r:r + 5] = np.array(c, dtype=np.float32)

    height = field.copy()
    if border is not None and rows > 0:
        height[:rows] *= 1.5
    return (_image(f"{name}_col", colour), _image(f"{name}_nrm", _normal_from_height(height, 2.0), colour=False))


def flat_texture(name, rgb, seed=3, size=128, grain=0.05):
    rng = np.random.default_rng(seed)
    px = np.tile(np.array(rgb, dtype=np.float32), (size, size, 1))
    px *= (1 + rng.normal(0, grain, (size, size, 1)).astype(np.float32))
    return _image(name, px)


def skin_detail(size=512, seed=5, strength=0.6):
    """Pores and fine skin texture, as a normal map on the skin atlas.

    The skin atlas holds the whole body, so a face is only a few hundred pixels of it, and the detail
    has to be very fine to come out at pore size. Rather than ship a 2048 px map in every character,
    this makes one 512 px texture that tiles (FFT noise is periodic by construction) and the game
    repeats it four times across each skin.
    """
    rng = np.random.default_rng(seed)
    n = rng.normal(0, 1, (size, size)).astype(np.float32)
    f = np.fft.fft2(n)
    fy = np.fft.fftfreq(size)[:, None]
    fx = np.fft.fftfreq(size)[None, :]
    r = np.sqrt(fx * fx + fy * fy)
    band = np.exp(-((r - 0.30) ** 2) / (2 * 0.09 ** 2))
    hf = np.real(np.fft.ifft2(f * band)).astype(np.float32)
    hf /= max(float(np.abs(hf).max()), 1e-6)
    return _image("Skin_nrm", _normal_from_height(hf, strength), colour=False)


# ---------------------------------------------------------------- skin painting
def image_pixels(img):
    w, h = img.size
    return np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)


def write_pixels(img, px):
    img.pixels.foreach_set(px.ravel())


def tint_image(img, rgb):
    """Multiply an image's colour in place (alpha untouched)."""
    px = image_pixels(img)
    px[..., :3] *= np.array(rgb, dtype=np.float32)
    write_pixels(img, px)


def uv_at(body, bvh, world_point):
    """The UV under a world-space point, interpolated across its polygon.

    Not the polygon's centre: a stroke of a thousand points would land on a few dozen polygon
    centres, and a line would come out as a row of dots.
    """
    loc, _, face_index, _ = bvh.find_nearest(world_point)
    poly = body.data.polygons[face_index]
    layer = body.data.uv_layers.active.data
    inv = body.matrix_world.inverted()
    local = inv @ loc
    corners = [body.data.vertices[i].co for i in poly.vertices]
    weights = poly_3d_calc(corners, local)
    uv = Vector((0.0, 0.0))
    for w_, li in zip(weights, poly.loop_indices):
        uv += layer[li].uv * w_
    return uv, loc


def paint_strokes(body, skin_img, points, radius_m, colour, opacity, pixels_per_metre=None):
    """Paint round dabs onto the skin texture at the UV positions of world-space points."""
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    px = image_pixels(skin_img)
    h, w = px.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    if pixels_per_metre is None:
        # Over a few centimetres, so the two ends are on different polygons — a polygon's centre
        # UV is the same for every point on it, which made a one-centimetre span read as zero.
        span = 0.04
        a, _ = uv_at(body, bvh, points[0] - Vector((span / 2, 0, 0)))
        b, _ = uv_at(body, bvh, points[0] + Vector((span / 2, 0, 0)))
        # the distance in UV space, not the change in u: the head's island may lie on its side
        pixels_per_metre = max((Vector((b.x * w, b.y * h)) - Vector((a.x * w, a.y * h))).length / span, 1.0)
    rad = radius_m * pixels_per_metre
    col = np.array(colour, dtype=np.float32)
    for p in points:
        uv, _ = uv_at(body, bvh, p)
        cx, cy = uv.x * w, uv.y * h
        x0, x1, y0, y1 = int(cx - rad * 2), int(cx + rad * 2), int(cy - rad * 2), int(cy + rad * 2)
        x0, y0 = max(x0, 0), max(y0, 0)
        sub = ((xx[y0:y1, x0:x1] - cx) / rad) ** 2 + ((yy[y0:y1, x0:x1] - cy) / rad) ** 2
        mask = np.clip(1.25 - sub, 0, 1)[..., None] * opacity
        px[y0:y1, x0:x1, :3] = px[y0:y1, x0:x1, :3] * (1 - mask) + col * mask
    write_pixels(skin_img, px)


def forehead_point(brows, body, up, across=0.0):
    """A point on the forehead: `up` metres above the brows, `across` to the side."""
    c = sum((brows.matrix_world @ v.co for v in brows.data.vertices), Vector()) / len(brows.data.vertices)
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    loc, _, _, _ = bvh.find_nearest(Vector((c.x + across, c.y - 0.03, c.z + up)))
    return loc


# ---------------------------------------------------------------- materials
def material(name, image=None, normal=None, alpha=False, roughness=None, normal_strength=1.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    if roughness is not None:
        bsdf.inputs["Roughness"].default_value = roughness
    if image is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.extension = "REPEAT"
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha:
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            mat.surface_render_method = "DITHERED"
    if normal is not None:
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = normal
        ntex.extension = "REPEAT"
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
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


def save_image(img, path_dir, name):
    os.makedirs(path_dir, exist_ok=True)
    path = os.path.join(path_dir, f"{name}.png")
    source = bpy.path.abspath(img.filepath) if img.filepath else ""
    if not img.is_dirty and source and os.path.exists(source):
        if source.lower().endswith(".png"):
            shutil.copyfile(source, path)
            return path
        img.reload()
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return path


# ---------------------------------------------------------------- renders and export
def render_views(render_dir, prefix, target_height, face_z=None):
    os.makedirs(render_dir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 900, 1200
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.24, 0.23, 0.27, 1)
    scene.world = world
    key = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    key.data.energy = 3.2
    key.rotation_euler = (math.radians(52), 0, math.radians(35))
    scene.collection.objects.link(key)
    fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
    fill.data.energy = 1.0
    fill.rotation_euler = (math.radians(70), 0, math.radians(-140))
    scene.collection.objects.link(fill)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    mid = target_height * 0.55
    fz = face_z if face_z is not None else target_height - 0.1
    views = {"front": (0, -3.4, mid, 50), "three_quarter": (2.3, -2.5, mid, 50), "back": (0, 3.4, mid, 50),
             "side": (3.4, 0, mid, 50), "face": (0.25, -0.8, fz, 85)}
    for name, (x, y, z, lens) in views.items():
        cam.location = (x, y, z)
        look = Vector((0, 0, z)) - cam.location
        cam.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = lens
        scene.render.filepath = os.path.join(render_dir, f"{prefix}_{name}.png")
        bpy.ops.render.render(write_still=True)


def export_glb(rig, meshes, path):
    """Character as a single binary glTF for Three.js: skin and materials, no animation."""
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                              export_skins=True, export_animations=False,
                              export_def_bones=True, export_image_format="WEBP", export_image_quality=82,
                              export_apply=False)
