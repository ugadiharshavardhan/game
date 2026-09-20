/**
 * Villagers preparing for the puja — hanging garlands, drawing rangoli, minding the shops,
 * lighting lamps, talking by the well.
 *
 * Each is the playable character's rig, posed by rotating bones about world axes (robust to however
 * each bone's local axes happen to point), then *baked*: the skinning is applied once on the CPU
 * and the result becomes static geometry. No skeletons, no mixers — a villager costs a few static
 * draw calls, and is culled beyond conversation distance.
 *
 * Clothing colours are hue-shifted copies of the character's cloth texture; the player's jhola
 * (shoulder bag) is left off so the protagonist keeps it as his signature.
 */
import {
  type Bone,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  type Material,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  Vector4,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VillagerDef, VillagerPose } from '../../types';
import type { ArtContext } from './runtime';

const DEG = Math.PI / 180;
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/** Kurta colours as CSS filters over the original saffron cloth: white, maroon, leaf, indigo, cream. */
const OUTFITS = [
  'saturate(0.12) brightness(1.35)',
  'hue-rotate(-38deg) saturate(1.2) brightness(0.48)',
  'hue-rotate(62deg) saturate(0.8) brightness(0.72)',
  'hue-rotate(185deg) saturate(0.7) brightness(0.7)',
  'saturate(0.35) brightness(1.15) sepia(0.25)',
];

/** Meshes left off the villagers. */
const SKIP = /Jhola|Lashes/;

/** The character model, loaded once and shared by the statues and the walking villagers. */
let devotee: Promise<Object3D> | null = null;
export function loadDevotee(): Promise<Object3D> {
  devotee ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/models/devotee.glb`).then((g) => g.scene);
  return devotee;
}

export async function build(a: ArtContext): Promise<boolean> {
  if (!a.layout.villagers.length) return true;
  const source = await loadDevotee();
  const outfitMats = new Map<number, Map<Material, Material>>();

  for (const v of a.layout.villagers) {
    const model = cloneSkinned(source);
    pose(model, v.pose);
    const group = bake(model, (m) => (v.grey && /Hair|Brows/.test(m.name) ? greyHair(a, m) : outfitMaterial(a, m, v.outfit, outfitMats)));
    group.name = `villager:${v.id}`;
    group.userData.task = v.task;
    // Stand on (or sit at) the surface: the baked feet or hips define where the ground is.
    group.scale.setScalar(v.scale);
    group.rotation.y = v.rot;
    group.position.set(v.x, 0, v.z);
    group.updateMatrixWorld(true);
    settle(group, v);
    a.root.add(group);
    a.culler.add(group, new Vector3(v.x, 0, v.z), 42);
  }
  return true;
}

// ---- posing --------------------------------------------------------------------------------------

/** Rotates a bone about a world axis (the model faces +z, its left is +x), keeping children attached. */
function turn(model: Object3D, name: string, axis: Vector3, degrees: number): void {
  const bone = model.getObjectByName(`mixamorig${name}`) as Bone | undefined;
  if (!bone?.parent) return;
  bone.parent.updateWorldMatrix(true, false);
  const pq = bone.parent.getWorldQuaternion(new Quaternion());
  const delta = new Quaternion().setFromAxisAngle(axis, degrees * DEG);
  bone.quaternion.premultiply(pq.clone().invert().multiply(delta).multiply(pq));
  bone.updateMatrixWorld(true);
}

/** Both sides at once: `deg` for the left, mirrored for the right. */
function both(model: Object3D, part: string, axis: Vector3, deg: number, mirrorAxis = true): void {
  turn(model, `Left${part}`, axis, deg);
  turn(model, `Right${part}`, axis, mirrorAxis ? -deg : deg);
}

/**
 * The rig rests in an A-pose (arms ~45° down and out). Arm "down" is a rotation about z; elbow
 * flexion is about x (negative lifts the forearm forward); hip flexion is about x (negative
 * swings the thigh forward); knee flexion is about x (positive folds the shin back).
 */
function pose(model: Object3D, p: VillagerPose): void {
  model.updateMatrixWorld(true);
  const armsDown = () => {
    turn(model, 'LeftArm', Z, -38);
    turn(model, 'RightArm', Z, 38);
  };
  switch (p) {
    case 'stand':
      armsDown();
      both(model, 'ForeArm', X, -12, false);
      turn(model, 'Head', X, 6);
      break;
    case 'talk':
      armsDown();
      // Right hand up, palm open — making a point.
      turn(model, 'RightArm', X, -35);
      turn(model, 'RightForeArm', X, -70);
      turn(model, 'LeftForeArm', X, -15);
      turn(model, 'Spine1', Y, -8);
      turn(model, 'Head', Y, -10);
      break;
    case 'arms-up':
      // Reaching up to tie a garland to the frame.
      turn(model, 'LeftArm', Z, 95);
      turn(model, 'RightArm', Z, -95);
      both(model, 'Arm', X, -25, false);
      both(model, 'ForeArm', X, -25, false);
      turn(model, 'Head', X, -22);
      break;
    case 'hold-up':
      // Holding a garland up to someone on the stage.
      armsDown();
      both(model, 'Arm', X, -75, false);
      both(model, 'ForeArm', X, -30, false);
      turn(model, 'Head', X, -18);
      break;
    case 'kneel':
      // Kneeling, leaning over the rangoli with one hand reaching down.
      armsDown();
      both(model, 'UpLeg', X, -5, false);
      both(model, 'Leg', X, 115, false);
      both(model, 'Foot', X, 40, false);
      turn(model, 'Spine', X, 18);
      turn(model, 'Spine1', X, 14);
      turn(model, 'RightArm', X, -55);
      turn(model, 'RightForeArm', X, -20);
      turn(model, 'LeftForeArm', X, -60);
      turn(model, 'Head', X, 20);
      break;
    case 'sit-edge':
      // Sitting on the edge of the veranda, legs hanging, hands on knees.
      armsDown();
      both(model, 'UpLeg', X, -88, false);
      both(model, 'Leg', X, 85, false);
      both(model, 'Arm', X, -30, false);
      both(model, 'ForeArm', X, -40, false);
      turn(model, 'Spine', X, 6);
      turn(model, 'Head', X, 4);
      break;
    case 'sit-stool':
      armsDown();
      both(model, 'UpLeg', X, -80, false);
      both(model, 'Leg', X, 80, false);
      both(model, 'Arm', X, -25, false);
      both(model, 'ForeArm', X, -55, false);
      turn(model, 'Spine', X, 10);
      break;
    case 'light-lamp':
      // Right hand raised to a niche with a flame; left hand cupped below.
      armsDown();
      turn(model, 'RightArm', X, -95);
      turn(model, 'RightArm', Z, 20);
      turn(model, 'RightForeArm', X, -35);
      turn(model, 'LeftArm', X, -45);
      turn(model, 'LeftForeArm', X, -60);
      turn(model, 'Head', X, -15);
      break;
  }
  model.updateMatrixWorld(true);
}

// ---- baking --------------------------------------------------------------------------------------

/** Applies skinning once and returns static meshes (one per material) in the model's space. */
export function bake(model: Object3D, material: (m: Material) => Material): Group {
  const byMat = new Map<Material, BufferGeometry[]>();
  const pos = new Vector3();
  const nor = new Vector3();
  const skinIndex = new Vector4();
  const skinWeight = new Vector4();
  const blended = new Matrix4();
  const bone = new Matrix4();
  const normalM = new Matrix3();
  model.updateMatrixWorld(true);
  const toRoot = new Matrix4().copy(model.matrixWorld).invert();

  model.traverse((o) => {
    if (!(o instanceof SkinnedMesh) || SKIP.test(o.name)) return;
    const src = o.geometry;
    const P = src.getAttribute('position');
    const N = src.getAttribute('normal');
    const SI = src.getAttribute('skinIndex');
    const SW = src.getAttribute('skinWeight');
    const outP = new Float32Array(P.count * 3);
    const outN = new Float32Array(P.count * 3);
    o.skeleton.update();
    const toModel = new Matrix4().multiplyMatrices(toRoot, o.matrixWorld);
    for (let i = 0; i < P.count; i++) {
      skinIndex.fromBufferAttribute(SI, i);
      skinWeight.fromBufferAttribute(SW, i);
      blended.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(k);
        if (!w) continue;
        const b = skinIndex.getComponent(k);
        bone.multiplyMatrices(o.skeleton.bones[b].matrixWorld, o.skeleton.boneInverses[b]);
        const e = blended.elements;
        const f = bone.elements;
        for (let j = 0; j < 16; j++) e[j] += f[j] * w;
      }
      // bindMatrixInverse · Σ(w · boneWorld · boneInverse) · bindMatrix, then into the model's space.
      blended.premultiply(o.bindMatrixInverse).multiply(o.bindMatrix).premultiply(toModel);
      pos.fromBufferAttribute(P, i).applyMatrix4(blended);
      outP.set([pos.x, pos.y, pos.z], i * 3);
      if (N) {
        normalM.getNormalMatrix(blended);
        nor.fromBufferAttribute(N, i).applyMatrix3(normalM).normalize();
        outN.set([nor.x, nor.y, nor.z], i * 3);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(outP, 3));
    g.setAttribute('normal', new BufferAttribute(outN, 3));
    const uv = src.getAttribute('uv');
    if (uv) g.setAttribute('uv', uv.clone());
    if (src.index) g.setIndex(src.index.clone());
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const m = material(mats[0]);
    const list = byMat.get(m) ?? [];
    list.push(g);
    byMat.set(m, list);
  });

  const group = new Group();
  for (const [m, list] of byMat) {
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Puts the villager on their surface: feet on it, or — seated — hips just above it. */
function settle(group: Group, v: VillagerDef): void {
  let minY = Infinity;
  const p = new Vector3();
  group.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const pos = o.geometry.getAttribute('position');
    // Seated on an edge: the lowest point is the feet hanging below the seat; use the seat instead.
    for (let i = 0; i < pos.count; i += 7) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (p.y < minY) minY = p.y;
    }
  });
  if (v.pose === 'sit-edge') {
    // Hanging feet rest on the ground in front of the plinth.
    group.position.y += 0 - minY;
  } else if (v.pose === 'sit-stool') {
    group.position.y += 0 - minY;
  } else {
    group.position.y += v.y - minY;
  }
}

/** Salt-and-pepper hair for the village elders. */
export function greyHair(a: ArtContext, m: Material): Material {
  return a.kit.custom(`npcs:grey-${m.name}`, () => {
    const c = (m as MeshStandardMaterial).clone();
    c.color.set('#c9c3b8');
    c.transparent = false;
    c.alphaTest = 0.45;
    c.side = 2;
    return c;
  });
}

/** The character's materials, with the cloth swapped for this villager's outfit colour. */
export function outfitMaterial(a: ArtContext, m: Material, outfit: number, cache: Map<number, Map<Material, Material>>): Material {
  const std = m as MeshStandardMaterial;
  if (!/Cloth/.test(m.name) || !std.map) {
    // Shared skin, hair, eyes: fix up once like Player.prepareMaterials does.
    if (/Hair|Brows/.test(m.name)) {
      m.transparent = false;
      std.alphaTest = 0.45;
      m.side = 2;
    }
    std.metalness = 0;
    return m;
  }
  let perOutfit = cache.get(outfit);
  if (!perOutfit) cache.set(outfit, (perOutfit = new Map()));
  let out = perOutfit.get(m);
  if (!out) {
    const img = std.map.image as CanvasImageSource & { width: number; height: number };
    const map = a.bank.canvas(`npcs:cloth-${outfit}`, [img.width, img.height], (g, w, h) => {
      g.filter = OUTFITS[outfit % OUTFITS.length];
      g.drawImage(img, 0, 0, w, h);
    }, true, false);
    map.flipY = std.map.flipY;
    map.colorSpace = SRGBColorSpace;
    out = a.kit.custom(`npcs:cloth-${outfit}`, () => {
      const c = std.clone();
      c.map = map as CanvasTexture;
      c.side = 2;
      c.metalness = 0;
      c.roughness = 0.88;
      return c;
    });
    perOutfit.set(m, out);
  }
  return out;
}
