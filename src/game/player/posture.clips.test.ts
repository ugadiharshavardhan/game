/**
 * The devotee's run, sit and sleep, measured against his real skeleton.
 *
 * Nobody watches these in a test, so they are checked the way an animator checks by eye: whether
 * the body lying down is actually lying on the floor (and not floating, sinking, or a standing
 * figure tipped over), whether the seat is on the ground, whether each transition ends where the
 * next begins, and whether a runner's arms swing back past the hips instead of reaching forward.
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type AnimationClip, AnimationMixer, Bone, Group, type Object3D, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildProceduralClips } from './proceduralClips';

interface GltfNode {
  name?: string;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

function skeletonOf(file: string): Group {
  const b = readFileSync(resolve(process.cwd(), 'public/assets/models', file));
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as { nodes: GltfNode[]; scenes: { nodes: number[] }[] };
  const make = (i: number): Object3D => {
    const n = json.nodes[i];
    const o = new Bone();
    o.name = (n.name ?? `node${i}`).replace(/[:.[\]/]/g, '');
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    for (const c of n.children ?? []) o.add(make(c));
    return o;
  };
  const root = new Group();
  for (const i of json.scenes[0].nodes) root.add(make(i));
  root.updateMatrixWorld(true);
  return root;
}

const BODY = /^mixamorig(Hips|Spine\d?|Neck|Head|(Left|Right)(Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot|ToeBase))$/;

describe('posture clips on devotee.glb', () => {
  const root = skeletonOf('devotee.glb');
  let clips: Map<string, AnimationClip>;
  const joints: Object3D[] = [];
  beforeAll(() => {
    clips = new Map(buildProceduralClips(root, { slow: 1.2, walk: 2.2, fastWalk: 3.3, run: 5, crouch: 1.4 }).map((c) => [c.name, c]));
    root.traverse((o) => {
      if (BODY.test(o.name)) joints.push(o);
    });
  });

  const pos = (bone: string) => root.getObjectByName(`mixamorig${bone}`)!.getWorldPosition(new Vector3());
  const lowest = () => Math.min(...joints.map((j) => j.getWorldPosition(new Vector3()).y));
  let mixer: AnimationMixer | null = null;
  /** Poses the skeleton at `t` seconds into `name` (and leaves it posed until the next call). */
  const at = (name: string, t: number) => {
    mixer?.stopAllAction();
    mixer?.uncacheRoot(root);
    const clip = clips.get(name)!;
    mixer = new AnimationMixer(root);
    mixer.clipAction(clip).play();
    mixer.setTime(Math.min(t, clip.duration - 1e-4));
    root.updateMatrixWorld(true);
  };
  const samples = (name: string, n = 24) => Array.from({ length: n + 1 }, (_, i) => (clips.get(name)!.duration * i) / n);

  it('drives only bones — never the character object itself', () => {
    for (const name of ['SitDown', 'SitLoop', 'StandUp', 'SleepStart', 'SleepLoop', 'WakeUp', 'JumpStart', 'JumpLand']) {
      const clip = clips.get(name);
      expect(clip, name).toBeDefined();
      for (const track of clip!.tracks) expect(track.name, `${name}: ${track.name}`).toMatch(/^mixamorig/);
    }
    at('SleepLoop', 1);
    expect(root.rotation.x).toBe(0);
    expect(root.rotation.z).toBe(0);
  });

  it('sleeps lying on the floor: head, back and hips down, the body stretched out along the ground', () => {
    for (const t of samples('SleepLoop', 8)) {
      at('SleepLoop', t);
      expect(pos('Head').y).toBeLessThan(0.2);
      expect(pos('Hips').y).toBeLessThan(0.2);
      expect(pos('Spine1').y).toBeLessThan(0.2);
      // Lengthwise along the floor, head to heels.
      expect(Math.abs(pos('Head').z - pos('RightFoot').z)).toBeGreaterThan(1.1);
      // Resting on the ground: not floating above it, not sunk into it.
      expect(lowest()).toBeGreaterThan(-0.005);
      expect(lowest()).toBeLessThan(0.06);
    }
  });

  it('sits with the seat on the ground and the head upright', () => {
    for (const t of samples('SitLoop', 8)) {
      at('SitLoop', t);
      expect(pos('Hips').y).toBeLessThan(0.22);
      expect(pos('Head').y).toBeGreaterThan(0.6);
      expect(lowest()).toBeGreaterThan(-0.005);
      expect(lowest()).toBeLessThan(0.04);
    }
  });

  it('never sinks into or floats off the floor on the way down or up', () => {
    for (const name of ['SitDown', 'StandUp', 'SleepStart', 'WakeUp', 'JumpLand']) {
      for (const t of samples(name)) {
        at(name, t);
        expect(lowest(), `${name} @ ${t.toFixed(2)}s`).toBeGreaterThan(-0.005);
        expect(lowest(), `${name} @ ${t.toFixed(2)}s`).toBeLessThan(0.1);
      }
    }
  });

  it('hands over seamlessly: each transition ends where the next state begins', () => {
    const head = (name: string, t: number) => (at(name, t), pos('Head'));
    const end = (name: string) => clips.get(name)!.duration;
    expect(head('SitDown', end('SitDown')).distanceTo(head('SitLoop', 0))).toBeLessThan(0.03);
    expect(head('StandUp', 0).distanceTo(head('SitLoop', 0))).toBeLessThan(0.03);
    expect(head('SleepStart', end('SleepStart')).distanceTo(head('SleepLoop', 0))).toBeLessThan(0.03);
    expect(head('WakeUp', 0).distanceTo(head('SleepLoop', 0))).toBeLessThan(0.03);
    // Standing again at the end, as tall as the idle.
    expect(head('WakeUp', end('WakeUp')).distanceTo(head('Idle', 0))).toBeLessThan(0.05);
    expect(head('StandUp', end('StandUp')).distanceTo(head('Idle', 0))).toBeLessThan(0.05);
  });

  it('runs with bent elbows, the arms driving back past the hips and opposite the legs', () => {
    let back = Infinity;
    let front = -Infinity;
    for (const t of samples('Run', 16)) {
      at('Run', t);
      const shoulder = pos('LeftArm');
      const elbow = pos('LeftForeArm');
      const hand = pos('LeftHand');
      const a = shoulder.clone().sub(elbow).normalize();
      const b = hand.clone().sub(elbow).normalize();
      const angle = (Math.acos(a.dot(b)) * 180) / Math.PI;
      expect(angle).toBeGreaterThan(60);
      expect(angle).toBeLessThan(115);
      // Never held up and out in front: the hand stays below the shoulder.
      expect(hand.y).toBeLessThan(shoulder.y - 0.08);
      back = Math.min(back, hand.z - shoulder.z);
      front = Math.max(front, hand.z - shoulder.z);
    }
    expect(back).toBeLessThan(-0.08);
    expect(front).toBeGreaterThan(0.15);
    // Opposition: when the left foot is furthest forward, the left hand is behind the body.
    let bestT = 0;
    let bestZ = -Infinity;
    for (const t of samples('Run', 32)) {
      at('Run', t);
      if (pos('LeftFoot').z > bestZ) {
        bestZ = pos('LeftFoot').z;
        bestT = t;
      }
    }
    at('Run', bestT);
    expect(pos('LeftHand').z - pos('LeftArm').z).toBeLessThan(0);
  });

  it('worships with palms touching directly above or at the head without crossing', () => {
    at('Celebrate', 1.2);
    const head = pos('Head');
    const lh = pos('LeftHand');
    const rh = pos('RightHand');
    // Hands are raised to the head level
    expect(lh.y).toBeGreaterThan(head.y - 0.05);
    expect(rh.y).toBeGreaterThan(head.y - 0.05);
    // Hands are touching directly together (distance between hand centers is small)
    expect(lh.distanceTo(rh)).toBeLessThan(0.06);
    // Hands must NOT cross: left hand stays on the left (x >= rh.x - 0.002)
    expect(lh.x).toBeGreaterThanOrEqual(rh.x - 0.002);
  });

  it('animates picking up and putting into bag', () => {
    // At pickup reach (0.6s), hand is reaching down
    at('Pickup', 0.6);
    const reachY = pos('RightHand').y;
    expect(reachY).toBeLessThan(pos('Hips').y + 0.1);

    // At bag tuck (1.25s), right hand brings item across to bag at left side
    at('Pickup', 1.25);
    const bagHand = pos('RightHand');
    expect(bagHand.y).toBeGreaterThan(reachY + 0.05);
    // Right hand has moved inward towards body and bag
    expect(bagHand.x).toBeGreaterThan(-0.45);
  });
});

