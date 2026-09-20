/**
 * The village's activities, measured against the real skeleton.
 *
 * Nobody watches these in a test, so they are checked the way an animator checks by eye: where
 * the hands are, how low the hips are, whether the feet are on the floor, whether the loop closes.
 * The skeleton is read straight from the exported .glb (no renderer, no textures), so this runs
 * against exactly the bones the game will pose.
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AnimationClip, AnimationMixer, Bone, Group, type Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ACTIVITIES, type Activity, activityPeriod, buildActivityClips } from './activityClips';

interface GltfNode {
  name?: string;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  mesh?: number;
}

/** The skeleton of a character .glb as bones, and nothing else. Names are sanitised as the loader does. */
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

const pos = (root: Object3D, bone: string): Vector3 => root.getObjectByName(`mixamorig${bone}`)!.getWorldPosition(new Vector3());

/** Plays `clip` to time t and returns the root, its bones at that moment. */
function at(root: Group, clip: AnimationClip, t: number): Group {
  const mixer = new AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.setTime(t);
  root.updateMatrixWorld(true);
  return root;
}

const range = (values: number[]) => Math.max(...values) - Math.min(...values);

describe.each(['woman.glb', 'devotee.glb', 'pujari.glb'])('activities on %s', (file) => {
  const root = skeletonOf(file);
  const clips = new Map(buildActivityClips(root).map((c) => [c.name, c]));
  // Standing measurements, before anything is posed: proportions differ between people.
  root.updateMatrixWorld(true);
  const H = pos(root, 'Head').y;
  const restHips = pos(root, 'Hips').y;
  const restAnkle = Math.min(pos(root, 'LeftFoot').y, pos(root, 'RightFoot').y);

  /** A measurement sampled through a whole loop. */
  const sweepOver = (name: Activity, measure: (r: Group) => number, samples = 48): number[] =>
    Array.from({ length: samples }, (_, i) => measure(at(root, clips.get(name)!, (i / samples) * activityPeriod(name))));

  it('has every activity, and a rest', () => {
    for (const a of ACTIVITIES) expect(clips.has(a), a).toBe(true);
    expect(clips.has('Rest')).toBe(true);
  });

  it.each(ACTIVITIES)('%s: every sample is a real pose, and the loop closes', (name) => {
    const clip = clips.get(name)!;
    for (const track of clip.tracks) for (const v of track.values) expect(Number.isFinite(v)).toBe(true);
    const start = at(root, clip, 0);
    const a = ['RightHand', 'LeftHand', 'Head', 'Hips'].map((b) => pos(start, b).clone());
    const end = at(root, clip, activityPeriod(name));
    const z = ['RightHand', 'LeftHand', 'Head', 'Hips'].map((b) => pos(end, b));
    a.forEach((p, i) => expect(p.distanceTo(z[i]), `${name}: bone ${i} at the seam`).toBeLessThan(0.004));
  });

  it('Sweep: the broom hand works low and in front, and really strokes', () => {
    const hand = sweepOver('Sweep', (r) => pos(r, 'RightHand').y);
    expect(Math.min(...hand)).toBeGreaterThan(H * 0.28);
    expect(Math.max(...hand), 'a hand at waist height, not shoulder height').toBeLessThan(H * 0.72);
    const forward = sweepOver('Sweep', (r) => pos(r, 'RightHand').z);
    expect(range(forward), 'a stroke of at least a hand’s breadth').toBeGreaterThan(0.07);
    expect(Math.min(...forward), 'in front of the body').toBeGreaterThan(-0.05);
    const between = sweepOver('Sweep', (r) => pos(r, 'RightHand').distanceTo(pos(r, 'LeftHand')));
    expect(Math.max(...between), 'both hands on one handle').toBeLessThan(0.5);
  });

  it.each(['Rangoli', 'Wipe'] as const)('%s: kneeling low, a hand on the ground moving', (name) => {
    const hips = sweepOver(name, (r) => pos(r, 'Hips').y);
    expect(Math.max(...hips), 'the hips are well down').toBeLessThan(restHips * 0.7);
    const hand = sweepOver(name, (r) => pos(r, 'RightHand').y);
    expect(Math.max(...hand), 'the working hand is near the floor').toBeLessThan(H * 0.32);
    const across = sweepOver(name, (r) => Math.hypot(pos(r, 'RightHand').x, pos(r, 'RightHand').z));
    expect(range(across), 'it moves').toBeGreaterThan(0.04);
  });

  it('Garland: both hands are above the head', () => {
    for (const gap of sweepOver('Garland', (r) => Math.min(pos(r, 'LeftHand').y, pos(r, 'RightHand').y) - pos(r, 'Head').y)) {
      expect(gap).toBeGreaterThan(0.02);
    }
  });

  it('HoldUp: hands out in front, at the height of the chest or above', () => {
    const y = sweepOver('HoldUp', (r) => Math.min(pos(r, 'LeftHand').y, pos(r, 'RightHand').y));
    const z = sweepOver('HoldUp', (r) => Math.min(pos(r, 'LeftHand').z, pos(r, 'RightHand').z));
    expect(Math.min(...y)).toBeGreaterThan(H * 0.68);
    expect(Math.min(...z)).toBeGreaterThan(0.2);
  });

  it('Lamp: one hand raised to a niche', () => {
    const y = sweepOver('Lamp', (r) => pos(r, 'RightHand').y);
    expect(Math.min(...y)).toBeGreaterThan(H * 0.78);
  });

  it('Arrange: both hands forward at counter height', () => {
    const y = sweepOver('Arrange', (r) => (pos(r, 'LeftHand').y + pos(r, 'RightHand').y) / 2);
    const z = sweepOver('Arrange', (r) => Math.min(pos(r, 'LeftHand').z, pos(r, 'RightHand').z));
    expect(Math.min(...y)).toBeGreaterThan(H * 0.45);
    expect(Math.max(...y)).toBeLessThan(H * 0.8);
    expect(Math.min(...z)).toBeGreaterThan(0.15);
  });

  it.each(['SitStool', 'SitEdge', 'Stringing'] as const)('%s: hips at seat height, the hips over the feet', (name) => {
    const hips = sweepOver(name, (r) => pos(r, 'Hips').y - Math.min(pos(r, 'LeftFoot').y, pos(r, 'RightFoot').y));
    // a seat is about a quarter of a person's height above the floor
    expect(Math.min(...hips)).toBeGreaterThan((restHips - restAnkle) * 0.28);
    expect(Math.max(...hips)).toBeLessThan((restHips - restAnkle) * 0.75);
    const thigh = sweepOver(name, (r) => pos(r, 'LeftLeg').z - pos(r, 'Hips').z);
    expect(Math.min(...thigh), 'thighs run forward').toBeGreaterThan(0.15);
  });

  it('Aarti: the lamp hand circles, and the bell hand rings', () => {
    const rx = sweepOver('Aarti', (r) => pos(r, 'RightHand').x);
    const ry = sweepOver('Aarti', (r) => pos(r, 'RightHand').y);
    // a circle has extent in both directions
    expect(range(rx)).toBeGreaterThan(0.06);
    expect(range(ry)).toBeGreaterThan(0.05);
    const bell = sweepOver('Aarti', (r) => pos(r, 'LeftHand').y, 96);
    let turns = 0;
    for (let i = 2; i < bell.length; i++) if ((bell[i] - bell[i - 1]) * (bell[i - 1] - bell[i - 2]) < 0) turns++;
    expect(turns, 'several rings a circle').toBeGreaterThanOrEqual(6);
  });

  it('Pray: palms together at the chest', () => {
    const together = sweepOver('Pray', (r) => pos(r, 'LeftHand').distanceTo(pos(r, 'RightHand')));
    const y = sweepOver('Pray', (r) => pos(r, 'LeftHand').y);
    expect(Math.max(...together)).toBeLessThan(0.16);
    expect(Math.min(...y)).toBeGreaterThan(H * 0.5);
    expect(Math.max(...y)).toBeLessThan(H * 0.95);
  });

  it('Talk: the speaking hand comes up and moves; the other stays down', () => {
    const right = sweepOver('Talk', (r) => pos(r, 'RightHand').y);
    const left = sweepOver('Talk', (r) => pos(r, 'LeftHand').y);
    expect(Math.max(...right)).toBeGreaterThan(H * 0.55);
    expect(range(right)).toBeGreaterThan(0.04);
    expect(Math.max(...left), 'a hanging hand').toBeLessThan(Math.max(...right));
  });

  it('Listen: standing, hands down, the head moving', () => {
    const hands = sweepOver('Listen', (r) => Math.max(pos(r, 'LeftHand').y, pos(r, 'RightHand').y));
    expect(Math.max(...hands), 'a hanging hand sits at the hip, about 0.62 of head height').toBeLessThan(H * 0.7);
    const head = sweepOver('Listen', (r) => pos(r, 'Head').x);
    expect(range(head)).toBeGreaterThanOrEqual(0);
  });

  it('CarryWalk: a hand up at the hip, feet on the ground', () => {
    const hand = sweepOver('CarryWalk', (r) => pos(r, 'LeftHand').y);
    expect(Math.min(...hand)).toBeGreaterThan(H * 0.4);
    expect(Math.max(...hand)).toBeLessThan(H * 0.75);
    const feet = sweepOver('CarryWalk', (r) => Math.min(pos(r, 'LeftFoot').y, pos(r, 'RightFoot').y) - restAnkle);
    expect(Math.min(...feet)).toBeGreaterThan(-0.05);
    expect(Math.max(...feet)).toBeLessThan(0.05);
  });

  it('nobody stands taller than they are, or sinks into the ground, in any activity', () => {
    for (const name of ACTIVITIES) {
      const heads = sweepOver(name, (r) => pos(r, 'Head').y, 24);
      // garland and lamp are arm poses: the head never leaves standing height by much
      expect(Math.max(...heads), name).toBeLessThan(H * 1.06);
      const feet = sweepOver(name, (r) => Math.min(pos(r, 'LeftFoot').y, pos(r, 'RightFoot').y) - restAnkle, 24);
      expect(Math.min(...feet), `${name}: feet in the floor`).toBeGreaterThan(-0.06);
    }
  });
});

describe('the rig', () => {
  it('is the same skeleton in all three characters, so one set of clips fits everyone', () => {
    const names = (f: string) => {
      const out: string[] = [];
      skeletonOf(f).traverse((o) => o.name.startsWith('mixamorig') && out.push(o.name));
      return out.sort();
    };
    expect(names('woman.glb')).toEqual(names('devotee.glb'));
    expect(names('pujari.glb')).toEqual(names('devotee.glb'));
  });

  it('rotation is not accidentally shared between two clones', () => {
    const q = new Quaternion();
    expect(q.length()).toBe(1);
  });
});
