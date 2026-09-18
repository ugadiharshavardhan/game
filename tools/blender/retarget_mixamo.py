"""
Retargets Mixamo clips onto the devotee skeleton and exports public/assets/models/devotee.glb with animations.

    blender -b -P tools/blender/retarget_mixamo.py -- --project <game repo>

Input: tools/blender/Devotee.blend (from build_devotee.py) and art/mixamo/<Clip>.fbx downloaded from mixamo.com
(Y Bot, "FBX Binary", "Without Skin", 30 fps). Both skeletons use Mixamo bone names, but their rest poses differ
(MakeHuman A-pose vs Mixamo T-pose, different bone rolls), so rotations are transferred through the rest poses:

    target_world = source_world · source_rest⁻¹ · target_rest

Hips translation is scaled by the ratio of hip heights so strides match the devotee's legs.
"""
import argparse
import os
import sys

import bpy
from mathutils import Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--project", required=True)
args = ap.parse_args(argv)

CLIPS = ["Idle", "SlowWalk", "Walk", "Run", "CrouchIdle", "CrouchWalk",
         "Interact", "Pickup", "Celebrate", "EnterHouse", "ExitHouse"]
HIPS = "mixamorig:Hips"
BLEND = os.path.join(args.project, "tools", "blender", "Devotee.blend")
CLIP_DIR = os.path.join(args.project, "art", "mixamo")
OUT = os.path.join(args.project, "public", "assets", "models", "devotee.glb")

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene
scene.render.fps = 30
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.parent == rig]


def depth(bone):
    d = 0
    while bone.parent:
        bone, d = bone.parent, d + 1
    return d


ORDERED = sorted(rig.data.bones, key=depth)


def rotation_only(m):
    return m.to_quaternion().to_matrix().to_4x4()


def retarget(src, name):
    src_action = src.animation_data.action
    first, last = (int(round(f)) for f in src_action.frame_range)
    src_rest = {b.name: src.matrix_world @ b.matrix_local for b in src.data.bones}
    tgt_rest = {b.name: rig.matrix_world @ b.matrix_local for b in rig.data.bones}
    ratio = tgt_rest[HIPS].translation.z / max(src_rest[HIPS].translation.z, 1e-4)
    rig_inv = rig.matrix_world.inverted()

    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.matrix_basis = Matrix.Identity(4)

    previous = {}
    for frame in range(first, last + 1):
        scene.frame_set(frame)
        desired = {}
        for bone in ORDERED:
            n = bone.name
            parent_world = desired.get(bone.parent.name) if bone.parent else None
            rest_rel = (bone.parent.matrix_local.inverted() @ bone.matrix_local) if bone.parent else bone.matrix_local
            if n in src.pose.bones:
                src_world = src.matrix_world @ src.pose.bones[n].matrix
                rot = src_world.to_quaternion() @ src_rest[n].to_quaternion().inverted() @ tgt_rest[n].to_quaternion()
                if n == HIPS:
                    loc = tgt_rest[n].translation + (src_world.translation - src_rest[n].translation) * ratio
                else:
                    base = (rig.matrix_world @ ((rig_inv @ parent_world) @ rest_rel)) if parent_world else tgt_rest[n]
                    loc = base.translation
                world = Matrix.Translation(loc) @ rot.to_matrix().to_4x4()
            else:  # bone Mixamo doesn't have (Root, Jaw, Breast…) keeps its rest offset from the parent
                world = (rig.matrix_world @ ((rig_inv @ parent_world) @ rest_rel)) if parent_world else tgt_rest[n]
            desired[n] = world

            armature_space = rig_inv @ world
            if bone.parent:
                basis = ((rig_inv @ desired[bone.parent.name]) @ rest_rel).inverted() @ armature_space
            else:
                basis = bone.matrix_local.inverted() @ armature_space
            loc_b, rot_b, _ = basis.decompose()
            pb = rig.pose.bones[n]
            if n in previous and previous[n].dot(rot_b) < 0:
                rot_b.negate()  # keep quaternions continuous so interpolation takes the short path
            previous[n] = rot_b.copy()
            pb.rotation_quaternion = rot_b
            pb.keyframe_insert("rotation_quaternion", frame=frame - first, group=n)
            if n == HIPS:
                pb.location = loc_b
                pb.keyframe_insert("location", frame=frame - first, group=n)

    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    rig.animation_data.action = None
    return last - first


found = []
for clip in CLIPS:
    path = os.path.join(CLIP_DIR, f"{clip}.fbx")
    if not os.path.exists(path):
        print(f"[retarget] MISSING {clip}.fbx")
        continue
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=True)
    imported = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in imported if o.type == "ARMATURE")
    frames = retarget(src, clip)
    src_action = src.animation_data.action
    for o in imported:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.actions.remove(src_action)
    found.append(clip)
    print(f"[retarget] {clip}: {frames} frames")

for pb in rig.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)

bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True,
                          export_skins=True, export_animations=True, export_animation_mode="NLA_TRACKS",
                          export_def_bones=True, export_image_format="WEBP", export_image_quality=85,
                          export_optimize_animation_size=True)
print(f"[retarget] exported {len(found)}/{len(CLIPS)} clips -> {OUT}")
