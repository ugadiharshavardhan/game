"""
Builds Moonlight Seva's people from MPFB/MakeHuman (CC0 output) and exports each as a glTF.

    blender -b -P tools/blender/build_characters.py -- --project <game repo> [--role player|woman|pujari|all]
                                                       [--no-export] [--no-render]

    player   the devotee the player walks as     -> public/assets/models/devotee.glb
    woman    a woman of the village in a saree   -> public/assets/models/woman.glb
    pujari   the priest, in a dhoti and shawl    -> public/assets/models/pujari.glb

Every character has the same MPFB "mixamo_unity" skeleton (mixamorig* bones), so one set of animation
code drives all of them. Re-runnable: each role starts from an empty scene. Review renders go to
tools/blender/renders/<role>_*.png.

What makes them more than a mannequin: skin with pores (a normal map made here), cloth with a woven
ground, a woven border and its own normal map, folds in the drapery, a hem that hangs off the
hips rather than clinging to the legs, and the small things people wear — a garland, beads, bangles,
a tilak, a bindi.
"""
import argparse
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charlib as C  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--project", required=True)
ap.add_argument("--role", default="all", choices=["player", "woman", "pujari", "all"])
ap.add_argument("--no-export", action="store_true")
ap.add_argument("--no-render", action="store_true")
args = ap.parse_args(argv)

OUT_DIR = os.path.join(args.project, "public", "assets", "models")
TEX_DIR = os.path.join(args.project, "tools", "blender", "textures")
RENDER_DIR = os.path.join(args.project, "tools", "blender", "renders")

# name, prefix, macro settings, skin/hair/brows, skin tint, hair tint, and the glb it becomes
ROLES = {
    "player": dict(prefix="Devotee", glb="devotee.glb", gender=1.0, age=0.28, muscle=0.5, weight=0.42, height=0.64,
                   skin="young_asian_male", hair="short01", brows="eyebrow001",
                   skin_tint=(0.80, 0.64, 0.52), hair_tint=(0.22, 0.20, 0.19)),
    "woman": dict(prefix="Woman", glb="woman.glb", gender=0.0, age=0.32, muscle=0.35, weight=0.42, height=0.63,
                  skin="young_asian_female", hair="braid01", brows="eyebrow004",
                  skin_tint=(0.83, 0.66, 0.54), hair_tint=(0.16, 0.15, 0.15), cup=0.55),
    "pujari": dict(prefix="Pujari", glb="pujari.glb", gender=1.0, age=0.62, muscle=0.40, weight=0.64, height=0.47,
                   skin="middleage_asian_male", hair="short04", brows="eyebrow006",
                   skin_tint=(0.78, 0.60, 0.47), hair_tint=(2.7, 2.7, 2.7)),
}

DEG = math.pi / 180


# ---------------------------------------------------------------- garments per role
def kurta_and_pyjama(body, lm):
    """The devotee's kurta and pyjama.

    The top is cut from the body's own surface. The skirt is not MPFB's helper skirt — that hull is
    already standing off the body at the hip, which left a shelf where the two met — but a tube
    fitted to the body ring by ring, starting a centimetre inside the top's lower edge so the seam
    is closed.
    """
    z_seam = lm["hips"] - 0.04
    top = C.split_faces(body, "helper-tights", "K_top", lambda c: c.z >= z_seam)
    pyjama = C.split_faces(body, "helper-tights", "Pyjama", lambda c: lm["ankle"] + 0.05 <= c.z <= lm["hips"] - 0.14)
    C.offset_along_normals(top, 0.012)
    C.offset_along_normals(pyjama, 0.010)
    return top, pyjama


def kurta_skirt(body, lm):
    z_hem = lm["knee"] + 0.03
    # Starts well up, underneath the top and a few millimetres inside it: MPFB's group leaves small
    # gaps in the top at the hips, and this is what shows through them — cloth, not the pyjama.
    skirt = C.wrap_skirt("K_skirt", body, lm["hips"] + 0.14, z_hem, ease_top=0.005, flare_hem=0.07, folds=6,
                         fold_amp=0.006, front_fold_amp=0.008, rings=40)
    C.transfer_weights(body, skirt)
    C.soften_weights_toward(skirt, "mixamorig:Hips", 0.6)
    return skirt


def blouse(body, lm):
    """A short-sleeved blouse: the chest and the upper arms, cut a little above the waist."""
    sh = {"L": lm["Left_shoulder"], "R": lm["Right_shoulder"]}
    elbow = {"L": lm["Left_elbow"], "R": lm["Right_elbow"]}
    cx, cy, ax, ay = C.torso_section(body, lm["spine2"])
    armpit = ax * 1.06

    def keep(c):
        if c.z > lm["neck"] + 0.02 or c.z < lm["spine1"] - 0.02:
            return False
        front = min(max(-(c.y - cy) / 0.07, 0.0), 1.0)
        back = min(max((c.y - cy) / 0.07, 0.0), 1.0)
        # a round neckline, deeper in front, and a scooped back
        if abs(c.x - cx) <= armpit:
            return c.z <= lm["neck"] - 0.03 - 0.06 * front - 0.05 * back
        for side in ("L", "R"):
            a, b = sh[side], elbow[side]
            axis = b - a
            length = axis.length
            axis /= length
            t = (c - a).dot(axis) / length
            d = ((c - a) - axis * (t * length)).length
            if -0.06 <= t <= 0.45 and d < 0.10 and (c.x - cx) * (a.x - cx) > 0:
                return True
        return False

    b = C.split_faces(body, "helper-tights", "Blouse", keep)
    C.offset_along_normals(b, 0.008)
    C.fold_cloth(b, 0.0025, 6, 0.2, up=0.2)
    return b


def saree_wrap(body, lm, z_top, name="Saree"):
    z_hem = lm["ankle"] + 0.045
    s = C.wrap_skirt(name, body, z_top, z_hem, ease_top=0.016, flare_hem=0.075, folds=9, fold_amp=0.012,
                     front_fold_amp=0.02)
    C.transfer_weights(body, s)
    C.soften_weights_toward(s, "mixamorig:Hips", 0.42)
    return s


def dhoti_wrap(body, lm, z_top):
    z_hem = lm["ankle"] + 0.06
    s = C.wrap_skirt("Dhoti", body, z_top, z_hem, ease_top=0.018, flare_hem=0.085, folds=7, fold_amp=0.02,
                     front_fold_amp=0.045)
    C.transfer_weights(body, s)
    C.soften_weights_toward(s, "mixamorig:Hips", 0.40)
    return s


def pallu(body, lm, surfaces):
    """The saree's end: from the right hip, across the chest, over the left shoulder and down the back."""
    cx, cy, ax, ay = C.torso_section(body, lm["spine1"])
    ls = lm["Left_shoulder"]
    sgn = 1.0 if ls.x > cx else -1.0
    front_hip = Vector((cx - sgn * ax * 0.7, cy - ay * 1.1, lm["hips"] + 0.08))
    chest = Vector((cx, cy - ay * 1.15, lm["spine2"] - 0.02))
    shoulder = Vector((ls.x * 0.92, ls.y, lm["neck"] - 0.035))
    back_up = Vector((cx + (ls.x - cx) * 0.45, cy + ay * 1.05, lm["spine2"] - 0.02))
    back_low = Vector((cx + (ls.x - cx) * 0.30, cy + ay * 1.15, lm["hips"] - 0.05))
    p = C.draped_band(surfaces, [front_hip, chest, shoulder, back_up, back_low], [0.13, 0.17, 0.20, 0.24, 0.26],
                      0.03, "Pallu", per_segment=14)
    C.transfer_weights(body, p)
    return p


def angavastram(body, lm, surfaces):
    """The priest's shawl: over the left shoulder, across the chest to the right hip, and down the back."""
    cx, cy, ax, ay = C.torso_section(body, lm["spine1"])
    ls = lm["Left_shoulder"]
    over = Vector((ls.x * 0.9, ls.y, lm["neck"] - 0.03))
    chest = Vector((cx + ax * 0.15, cy - ay * 1.15, lm["spine2"] - 0.04))
    sgn = 1.0 if ls.x > cx else -1.0
    hip = Vector((cx - sgn * ax * 0.65, cy - ay * 1.1, lm["hips"] + 0.06))
    back_a = Vector((cx + (ls.x - cx) * 0.45, cy + ay * 1.1, lm["spine2"] - 0.03))
    back_b = Vector((cx + (ls.x - cx) * 0.30, cy + ay * 1.2, lm["hips"] + 0.02))
    front = C.draped_band(surfaces, [hip, chest, over], [0.10, 0.15, 0.20], 0.02, "Shawl_front", per_segment=14)
    back = C.draped_band(surfaces, [over, back_a, back_b], [0.18, 0.21, 0.22], 0.026, "Shawl_back", per_segment=14)
    shawl = C.join([front, back], "Shawl")
    C.transfer_weights(body, shawl)
    return shawl


def garland(body, lm, name, sag, count, radius, squash):
    pts = C.garland_path(lm, body, sag, count)
    pts = C.project_out(pts, body, radius * 0.9)
    g = C.bead_chain(name, pts, [radius] * len(pts), squash=squash)
    C.transfer_weights(body, g)
    return g


def bangles(rig, body, lm, name, count=5, radius=0.031, tube=0.0028):
    parts = []
    for side in ("Left", "Right"):
        wrist, elbow = lm[f"{side}_wrist"], lm[f"{side}_elbow"]
        axis = (wrist - elbow).normalized()
        for k in range(count):
            centre = wrist - axis * (0.012 + 0.0065 * k)
            bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=tube, major_segments=20, minor_segments=5,
                                             location=centre)
            t = bpy.context.active_object
            t.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            t.vertex_groups.new(name=f"mixamorig:{side}ForeArm").add([v.index for v in t.data.vertices], 1.0, "REPLACE")
            parts.append(t)
    return C.join(parts, name)


def earrings(body, name):
    """A small gold stud at each earlobe, found from the body's own ear vertices."""
    mw = body.matrix_world
    ear = body.vertex_groups["ears"].index if "ears" in body.vertex_groups else None
    pts = []
    for sign in (1, -1):
        cands = [mw @ v.co for v in body.data.vertices if ear is not None and any(g.group == ear and g.weight > 0.5 for g in v.groups) and (mw @ v.co).x * sign > 0]
        if cands:
            lobe = min(cands, key=lambda p: p.z)
            pts.append(lobe + Vector((sign * 0.004, 0.0, -0.006)))
    obj = C.bead_chain(name, pts, [0.0075] * len(pts), squash=1.0, u_seg=8, v_seg=5)
    obj.vertex_groups.new(name="mixamorig:Head").add([v.index for v in obj.data.vertices], 1.0, "REPLACE")
    return obj


def necklace(body, lm, name):
    cx, cy, _, _ = C.torso_section(body, lm["spine2"])
    pts = []
    for k in range(34):
        phi = 2 * math.pi * k / 34
        front = max(0.0, math.cos(phi)) ** 2
        pts.append(Vector((cx + 0.062 * math.sin(phi), cy - 0.066 * math.cos(phi) - 0.02 * front, lm["neck"] - 0.05 - 0.055 * front)))
    pts = C.project_out(pts, body, 0.007)
    n = C.bead_chain(name, pts, [0.0048] * len(pts), squash=1.0, u_seg=6, v_seg=4)
    C.transfer_weights(body, n)
    return n


# ---------------------------------------------------------------- the build
def build(role):
    spec = ROLES[role]
    P = spec["prefix"]
    print(f"[characters] building {role}")

    body, rig, parts = C.build_human(spec)
    C.bake_body(body)
    lm = C.landmarks(body)
    body.name = body.data.name = f"{P}_Body"

    garments = {}     # object -> (colour image, normal image, tag)
    cloth = []        # objects to be covered-tested against the body

    # Garments cut from MPFB's helper geometry come first: the helpers are deleted straight after,
    # and everything built from scratch afterwards measures a body with no helper skirt round it.
    cut = {}
    if role == "player":
        top, cut["pyjama"] = kurta_and_pyjama(body, lm)
        cut["top"] = top
    elif role == "woman":
        cut["blouse"] = blouse(body, lm)
    C.remove_helpers_from_body(body)
    if role == "player":
        # after the helpers are gone: the skirt measures a body with nothing round it
        cut["kurta"] = C.join([cut.pop("top"), kurta_skirt(body, lm)], "Kurta")
        C.fold_cloth(cut["kurta"], 0.006, 5, 0.4)
        C.fold_cloth(cut["pyjama"], 0.0016, 4, 1.1)

    if role == "player":
        kurta, pyjama = cut["kurta"], cut["pyjama"]
        for o in (kurta, pyjama):
            o.parent = rig
        C.cylinder_uv(kurta, lm["knee"] + 0.02)
        C.cylinder_uv(pyjama, lm["ankle"] + 0.04)
        cloth = [kurta, pyjama]
        col_k, nrm_k = C.cloth_textures(f"{P}_Kurta", (0.95, 0.62, 0.15), border=(0.55, 0.11, 0.12), border_m=0.09, motif="zari", seed=11)
        col_p, nrm_p = C.cloth_textures(f"{P}_Pyjama", (0.93, 0.90, 0.82), border=(0.80, 0.76, 0.66), border_m=0.05, motif="stripe", seed=12)
        garments = {kurta: (col_k, nrm_k, "Kurta"), pyjama: (col_p, nrm_p, "Pyjama")}
        jewellery = []

    elif role == "woman":
        top = cut["blouse"]
        # a saree tied at the navel: over the petticoat, from just above the hip to the ankle
        wrap = saree_wrap(body, lm, lm["hips"] + 0.06)
        for o in (top, wrap):
            o.parent = rig
        C.cylinder_uv(top, lm["spine1"] - 0.02)
        surfaces = [body, top, wrap]
        drape = pallu(body, lm, surfaces)
        for o in (drape,):
            o.parent = rig
        cloth = [top, wrap, drape]
        col_b, nrm_b = C.cloth_textures(f"{P}_Blouse", (0.62, 0.08, 0.13), border=(0.90, 0.72, 0.28), border_m=0.04, motif="stripe", seed=21)
        col_s, nrm_s = C.cloth_textures(f"{P}_Saree", (0.06, 0.40, 0.24), border=(0.60, 0.07, 0.12), border_m=0.11, motif="zari", seed=22)
        col_d, nrm_d = C.cloth_textures(f"{P}_Pallu", (0.06, 0.40, 0.24), border=(0.60, 0.07, 0.12), border_m=0.09, motif="zari", seed=23)
        garments = {top: (col_b, nrm_b, "Blouse"), wrap: (col_s, nrm_s, "Saree"), drape: (col_d, nrm_d, "Pallu")}
        gold = [bangles(rig, body, lm, "Bangles"), earrings(body, "Earrings"), necklace(body, lm, "Necklace")]
        for g in gold:
            g.parent = rig
            C.parent_to_rig(g, rig)
        jewellery = gold

    else:  # pujari
        dhoti = dhoti_wrap(body, lm, lm["hips"] + 0.02)
        dhoti.parent = rig
        surfaces = [body, dhoti]
        shawl = angavastram(body, lm, surfaces)
        shawl.parent = rig
        cloth = [dhoti, shawl]
        col_d, nrm_d = C.cloth_textures(f"{P}_Dhoti", (0.94, 0.92, 0.86), border=(0.62, 0.09, 0.10), border_m=0.11, motif="kasavu", seed=31)
        col_a, nrm_a = C.cloth_textures(f"{P}_Shawl", (0.96, 0.50, 0.06), border=(0.60, 0.08, 0.10), border_m=0.07, motif="zari", seed=32)
        garments = {dhoti: (col_d, nrm_d, "Dhoti"), shawl: (col_a, nrm_a, "Shawl")}
        marigold = garland(body, lm, "Garland", sag=0.30, count=46, radius=0.02, squash=0.7)
        beads = garland(body, lm, "Beads", sag=0.17, count=26, radius=0.0115, squash=1.0)
        for o in (marigold, beads):
            C.parent_to_rig(o, rig)
        jewellery = [marigold, beads]

    for o in list(garments) + list(jewellery):
        C.parent_to_rig(o, rig)

    removed = C.delete_covered_body(body, [o for o in cloth])
    # Keep the face at full detail; thin out hands, feet and the remaining skin.
    protect = body.vertex_groups.new(name="DecimateProtect")
    neck_z = lm["neck"] + 0.03
    protect.add([v.index for v in body.data.vertices if (body.matrix_world @ v.co).z > neck_z], 1.0, "REPLACE")
    for o, ratio in [(body, 0.55)]:
        dec = o.modifiers.new("decimate", "DECIMATE")
        dec.ratio = ratio
        dec.vertex_group = protect.name
        dec.invert_vertex_group = True
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_move_to_index(modifier="decimate", index=0)
        bpy.ops.object.modifier_apply(modifier="decimate")

    # ---- skin: tint, marks, and pores
    skin_img = C.image_of(body)
    C.tint_image(skin_img, spec["skin_tint"])
    brows = parts["Eyebrows"]
    if role == "player":
        C.paint_strokes(body, skin_img, [C.forehead_point(brows, body, 0.018)], 0.0035, (0.72, 0.06, 0.05), 0.9)
    elif role == "woman":
        C.paint_strokes(body, skin_img, [C.forehead_point(brows, body, 0.017)], 0.0042, (0.66, 0.04, 0.07), 0.95)
    else:
        ash = (0.86, 0.84, 0.80)
        for k, up in enumerate((0.030, 0.042, 0.054)):
            line = [C.forehead_point(brows, body, up, across=-0.030 + 0.060 * i / 60) for i in range(61)]
            C.paint_strokes(body, skin_img, line, 0.0022, ash, 0.9)
        C.paint_strokes(body, skin_img, [C.forehead_point(brows, body, 0.020)], 0.0042, (0.66, 0.04, 0.07), 0.95)

    C.set_single_material(body, C.material(f"{P}_Skin", skin_img, None, roughness=0.55))

    # ---- cloth materials
    for obj, (col, nrm, tag) in garments.items():
        C.set_single_material(obj, C.material(f"{P}_{tag}_Cloth", col, nrm, roughness=0.9, normal_strength=1.0))
    for obj in jewellery:
        tag = obj.name
        if tag in ("Garland",):
            img = C.flat_texture(f"{P}_Garland", (0.98, 0.58, 0.05), seed=41, size=64, grain=0.12)
        elif tag in ("Beads",):
            img = C.flat_texture(f"{P}_Beads", (0.36, 0.20, 0.10), seed=42, size=64, grain=0.10)
        else:
            img = C.flat_texture(f"{P}_Gold_{tag}", (0.94, 0.70, 0.22), seed=43, size=64, grain=0.03)
        C.set_single_material(obj, C.material(f"{P}_{tag}", img, roughness=0.4))

    names = {"Eyes": f"{P}_Eyes", "Eyebrows": f"{P}_Brows", "Eyelashes": f"{P}_Lashes", "Hair": f"{P}_Hair"}
    for key, obj in parts.items():
        img = C.image_of(obj)
        if key == "Hair" and img is not None:
            C.tint_image(img, spec["hair_tint"])
        obj.name = obj.data.name = names[key]
        C.set_single_material(obj, C.material(names[key], img, alpha=key in ("Eyebrows", "Eyelashes", "Hair")))
        if img:
            C.save_image(img, TEX_DIR, f"{P}_{key}")
    C.save_image(skin_img, TEX_DIR, f"{P}_Skin")

    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.parent == rig]
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    height = max(p.z for p in C.world_coords(body)) - min(p.z for p in C.world_coords(body))
    for o in meshes:
        print(f"[characters]   {o.name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    print(f"[characters] {role}: {removed} body faces under cloth removed; {tris} triangles; {height:.3f} m; "
          f"{len({s.material.name for o in meshes for s in o.material_slots})} materials")

    if not args.no_render:
        C.render_views(RENDER_DIR, role, height, face_z=lm["top"] - 0.10)
    if not args.no_export:
        os.makedirs(OUT_DIR, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.project, "tools", "blender", f"{P}.blend"))
        C.export_glb(rig, meshes, os.path.join(OUT_DIR, spec["glb"]))
        print(f"[characters] exported {spec['glb']}")


def write_pores():
    """public/assets/textures/skin_pores.png — one tileable normal map for every character's skin."""
    img = C.skin_detail()
    path = os.path.join(args.project, "public", "assets", "textures")
    os.makedirs(path, exist_ok=True)
    img.filepath_raw = os.path.join(path, "skin_pores.png")
    img.file_format = "PNG"
    img.save()
    print("[characters] wrote skin_pores.png")


write_pores()
for r in (["player", "woman", "pujari"] if args.role == "all" else [args.role]):
    build(r)
