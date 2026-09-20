/**
 * The devotee's animations, made in code for the character's own skeleton (devotee.glb ships none).
 *
 * A pose is a list of turns — bone, axis, degrees — about the character's axes (it faces +z, its
 * left is +x), applied parents first, the same convention the villagers are posed with. A clip
 * samples a pose function over time into ordinary AnimationClips, so the rest of the game (the
 * blend tree, phase sync, rate matching, one-shot actions) treats them like any imported clip.
 *
 * Two things make the gaits hold together without IK:
 *   - hip height is solved every sample from the legs' forward kinematics, so the stance foot
 *     always meets the ground (the walk's bob falls out of the geometry);
 *   - each gait's ground speed is measured from how fast its stance foot travels back, and stored
 *     on the clip, so playback can be matched to the controller's real speed (no skating).
 *
 * Conventions (degrees, the character's axes): arm down from the A-pose is Z (−left, +right);
 * raising an arm forward is −X; elbow flexion is −X on the forearm; hip flexion (thigh forward) is
 * −X; knee flexion is +X on the shin; toes down is +X on the foot; leaning forward is +X on the spine.
 */
import { AnimationClip, type Bone, type Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';

const DEG = Math.PI / 180;
const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };

export type Axis = keyof typeof AXES;
/** [bone (without the mixamorig prefix), axis, degrees]. */
export type Turn = [string, Axis, number];

export interface Pose {
  turns: Turn[];
  /** Extra hip offset in the character's frame, metres (added after the legs are solved). */
  hips?: { x?: number; y?: number; z?: number };
  /** Solve hip height so the lower foot touches the ground (gaits, crouch). Default true. */
  plant?: boolean;
}

/** Every bone any pose may turn, parents before children — the order turns are applied in. */
const ORDER = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];

const TAU = Math.PI * 2;
const smooth = (t: number) => {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
};
/** A periodic bump centred on `c` (phase 0..1), width `w`. */
const bump = (p: number, c: number, w: number) => {
  let d = Math.abs(p - c) % 1;
  if (d > 0.5) d = 1 - d;
  return Math.exp(-((d / w) ** 2));
};

// ---- the rig ------------------------------------------------------------------------------------

export class Rig {
  readonly bones = new Map<string, Bone>();
  private readonly rest = new Map<string, Quaternion>();
  private readonly restHips: Vector3;
  private readonly restAnkle: number;
  private readonly model: Object3D;
  private readonly modelQ = new Quaternion();
  private readonly tmpQ = new Quaternion();
  private readonly tmpV = new Vector3();

  constructor(model: Object3D) {
    this.model = model;
    for (const name of ORDER) {
      const b = model.getObjectByName(`mixamorig${name}`) as Bone | undefined;
      if (b) {
        this.bones.set(name, b);
        this.rest.set(name, b.quaternion.clone());
      }
    }
    const hips = this.bones.get('Hips');
    this.restHips = hips ? hips.position.clone() : new Vector3();
    model.updateMatrixWorld(true);
    this.restAnkle = Math.min(this.ankleY('Left'), this.ankleY('Right'));
  }

  get ok(): boolean {
    return ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftArm', 'RightArm'].every((n) => this.bones.has(n));
  }

  reset(): void {
    for (const [n, q] of this.rest) this.bones.get(n)?.quaternion.copy(q);
    this.bones.get('Hips')?.position.copy(this.restHips);
  }

  /** Applies a pose from rest; returns the hip offset used (character frame). */
  apply(p: Pose): Vector3 {
    this.reset();
    this.model.updateMatrixWorld(true);
    this.model.getWorldQuaternion(this.modelQ).invert();
    const byBone = new Map<string, Turn[]>();
    for (const t of p.turns) {
      const list = byBone.get(t[0]) ?? [];
      list.push(t);
      byBone.set(t[0], list);
    }
    for (const name of ORDER) {
      const turns = byBone.get(name);
      const bone = this.bones.get(name);
      if (!turns || !bone?.parent) continue;
      for (const [, axis, deg] of turns) {
        // The parent's orientation in the character's frame: turns are about the character's axes.
        const pq = this.tmpQ.copy(this.modelQ).multiply(bone.parent.getWorldQuaternion(new Quaternion()));
        const delta = new Quaternion().setFromAxisAngle(AXES[axis], deg * DEG);
        bone.quaternion.premultiply(pq.clone().invert().multiply(delta).multiply(pq));
        bone.updateMatrixWorld(true);
      }
    }
    // Hips: plant the lower foot, then add the pose's own offset.
    const off = new Vector3(p.hips?.x ?? 0, p.hips?.y ?? 0, p.hips?.z ?? 0);
    if (p.plant !== false) {
      this.model.updateMatrixWorld(true);
      off.y += this.restAnkle - Math.min(this.ankleY('Left'), this.ankleY('Right'));
    }
    this.moveHips(off);
    return off;
  }

  /** Hips position (its parent's frame) for an offset in the character's frame. */
  hipsFor(off: Vector3): Vector3 {
    const hips = this.bones.get('Hips');
    if (!hips?.parent) return this.restHips.clone();
    // Character frame → the hips' parent frame (rotation and scale).
    hips.parent.updateMatrixWorld(true);
    const inv = hips.parent.matrixWorld.clone().invert();
    const modelM = this.model.matrixWorld;
    const o = this.tmpV.set(0, 0, 0).applyMatrix4(modelM).applyMatrix4(inv);
    const d = off.clone().applyMatrix4(modelM).applyMatrix4(inv).sub(o);
    return this.restHips.clone().add(d);
  }

  private moveHips(off: Vector3): void {
    const hips = this.bones.get('Hips');
    if (!hips) return;
    hips.position.copy(this.hipsFor(off));
    hips.updateMatrixWorld(true);
  }

  /** A foot's ankle height (and forward position) in the character's frame. */
  ankleY(side: 'Left' | 'Right'): number {
    return this.ankle(side).y;
  }

  ankle(side: 'Left' | 'Right'): Vector3 {
    const f = this.bones.get(`${side}Foot`);
    if (!f) return new Vector3();
    const p = f.getWorldPosition(new Vector3());
    return this.model.worldToLocal(p);
  }

  /** Samples `pose(t)` into a clip. */
  clip(name: string, duration: number, fps: number, pose: (t: number) => Pose): AnimationClip {
    const n = Math.max(2, Math.round(duration * fps) + 1);
    const times: number[] = [];
    const q = new Map<string, number[]>();
    const hipsPos: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * duration;
      times.push(t);
      const off = this.apply(pose(t));
      for (const [name, b] of this.bones) {
        const list = q.get(name) ?? [];
        list.push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        q.set(name, list);
      }
      const hp = this.hipsFor(off);
      hipsPos.push(hp.x, hp.y, hp.z);
    }
    const tracks = [...this.bones].map(([nm, b]) => new QuaternionKeyframeTrack(`${b.name}.quaternion`, times, q.get(nm) ?? []));
    const hips = this.bones.get('Hips');
    if (hips) tracks.push(new VectorKeyframeTrack(`${hips.name}.position`, times, hipsPos));
    this.reset();
    return new AnimationClip(name, duration, tracks);
  }

  /**
   * Ground speed of a gait: how fast the stance foot slides back relative to the body, measured
   * over the part of the cycle where that foot is the lower one.
   */
  groundSpeed(duration: number, pose: (t: number) => Pose): number {
    const n = 240;
    let travel = 0;
    let time = 0;
    let prev: Vector3 | null = null;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * duration;
      this.apply(pose(t));
      this.model.updateMatrixWorld(true);
      const l = this.ankle('Left');
      const r = this.ankle('Right');
      const stance = l.y < r.y ? l : r;
      const cur = stance.clone();
      if (prev && Math.abs(prev.y - cur.y) < 0.01 && prev.z > cur.z) {
        travel += prev.z - cur.z;
        time += duration / n;
      }
      prev = cur;
    }
    this.reset();
    return time > 0 ? travel / time : 0;
  }
}

// ---- the poses ----------------------------------------------------------------------------------

/** Arms hanging naturally from the A-pose, elbows soft. */
export const armsDown = (extraZ = 0, elbow = -12): Turn[] => [
  ['LeftArm', 'z', -40 - extraZ],
  ['RightArm', 'z', 40 + extraZ],
  ['LeftForeArm', 'x', elbow],
  ['RightForeArm', 'x', elbow],
];

export interface Gait {
  /** Thigh forward and back at the extremes (degrees). */
  thighFwd: number;
  thighBack: number;
  /** Knee flexion at loading, and at the peak of the swing. */
  kneeLoad: number;
  kneeSwing: number;
  /** Where in the cycle the swing knee peaks. */
  swingAt: number;
  armSwing: number;
  elbow: number;
  /** Extra elbow bend on the forward swing. */
  elbowPump: number;
  lean: number;
  pelvisYaw: number;
  sway: number;
  /** Airborne lift in mid-stride (running), metres. */
  flight: number;
  /** Stance fraction of the cycle (for toe-off timing). */
  stance: number;
}

export const GAITS = {
  slow: { thighFwd: 22, thighBack: 16, kneeLoad: 8, kneeSwing: 45, swingAt: 0.74, armSwing: 10, elbow: -12, elbowPump: 6, lean: 2, pelvisYaw: 4, sway: 0.02, flight: 0, stance: 0.62 },
  walk: { thighFwd: 30, thighBack: 20, kneeLoad: 12, kneeSwing: 58, swingAt: 0.73, armSwing: 20, elbow: -16, elbowPump: 12, lean: 4, pelvisYaw: 6, sway: 0.025, flight: 0, stance: 0.6 },
  run: { thighFwd: 52, thighBack: 24, kneeLoad: 32, kneeSwing: 105, swingAt: 0.68, armSwing: 26, elbow: -72, elbowPump: 8, lean: 11, pelvisYaw: 9, sway: 0.015, flight: 0.05, stance: 0.38 },
  crouch: { thighFwd: 34, thighBack: 8, kneeLoad: 0, kneeSwing: 40, swingAt: 0.74, armSwing: 8, elbow: -40, elbowPump: 4, lean: 0, pelvisYaw: 4, sway: 0.02, flight: 0, stance: 0.62 },
} satisfies Record<string, Gait>;

/** One leg's turns at phase p (0 = this leg's heel strike). */
function leg(side: 'Left' | 'Right', p: number, g: Gait, base: { thigh: number; knee: number } = { thigh: 0, knee: 0 }): Turn[] {
  const amp = (g.thighFwd + g.thighBack) / 2;
  const mid = (g.thighFwd - g.thighBack) / 2;
  const thigh = base.thigh - mid - amp * Math.cos(TAU * p);
  const knee = base.knee + g.kneeLoad * bump(p, 0.1, 0.09) + g.kneeSwing * bump(p, g.swingAt, 0.14) + 3;
  // Keep the foot flat to the ground through stance; heel first at strike, toes push at toe-off.
  const flat = -(thigh + knee);
  const foot = flat - 10 * bump(p, 0.0, 0.06) + 22 * bump(p, g.stance, 0.07) - 6 * bump(p, g.swingAt + 0.08, 0.1);
  const toes = -20 * bump(p, g.stance - 0.04, 0.06);
  return [
    [`${side}UpLeg`, 'x', thigh],
    [`${side}Leg`, 'x', knee],
    [`${side}Foot`, 'x', foot],
    [`${side}ToeBase`, 'x', toes],
  ];
}

export function gaitPose(g: Gait, phase: number, crouch = 0): Pose {
  const c = Math.cos(TAU * phase);
  const s = Math.sin(TAU * phase);
  const crouchLegs = { thigh: -62 * crouch, knee: 95 * crouch };
  const arm = g.armSwing * c;
  const pump = (v: number) => g.elbow - g.elbowPump * Math.max(0, -v / Math.max(g.armSwing, 1));
  return {
    turns: [
      ['Hips', 'y', -g.pelvisYaw * c],
      ['Spine', 'x', g.lean + 26 * crouch],
      ['Spine1', 'y', g.pelvisYaw * 0.6 * c],
      ['Spine2', 'y', g.pelvisYaw * 0.4 * c],
      ['Head', 'x', -g.lean * 0.6 - 18 * crouch],
      ['Head', 'y', -g.pelvisYaw * 0.3 * c],
      ...armsDown(-4 * crouch, 0),
      ['LeftArm', 'x', arm - 20 * crouch],
      ['RightArm', 'x', -arm - 20 * crouch],
      ['LeftForeArm', 'x', pump(arm)],
      ['RightForeArm', 'x', pump(-arm)],
      ...leg('Left', phase, g, crouchLegs),
      ...leg('Right', (phase + 0.5) % 1, g, crouchLegs),
    ],
    hips: {
      x: g.sway * s,
      // A run leaves the ground mid-stride.
      y: g.flight * Math.max(0, Math.sin(TAU * 2 * (phase - g.stance / 2 + 0.02))),
      z: -0.14 * crouch,
    },
  };
}

export function idlePose(t: number, crouch: number): Pose {
  const breath = Math.sin((TAU * t) / 3.5);
  const shift = Math.sin((TAU * t) / 7);
  // A second, slower sway over the same seven seconds: standing still is never quite still, and
  // two harmonics of the same period keep the loop seamless.
  const settle = Math.sin((TAU * t) / 7 + 2.1);
  const legs = crouch ? { thigh: -62, knee: 95 } : { thigh: 0, knee: 0 };
  return {
    turns: [
      ['Hips', 'z', 1.2 * shift * (1 - crouch)],
      ['Hips', 'y', 1.1 * settle * (1 - crouch)],
      ['Spine', 'x', 1.2 * breath + 1 + 26 * crouch],
      ['Spine1', 'y', -0.9 * settle * (1 - crouch)],
      ['Spine2', 'x', 0.8 * breath],
      ['Neck', 'x', -0.6 * breath],
      ['Head', 'x', 3 - 18 * crouch],
      ['Head', 'y', 4 * Math.sin((TAU * t) / 7 + 1)],
      ...armsDown(-1 * breath, crouch ? -45 : -14),
      ...(crouch ? ([['LeftArm', 'x', -28], ['RightArm', 'x', -28]] as Turn[]) : []),
      ['LeftUpLeg', 'x', legs.thigh + 2 * shift * (1 - crouch)],
      ['RightUpLeg', 'x', legs.thigh - 2 * shift * (1 - crouch)],
      ['LeftLeg', 'x', legs.knee + 3],
      ['RightLeg', 'x', legs.knee + 3],
      ['LeftFoot', 'x', -(legs.thigh + legs.knee + 3)],
      ['RightFoot', 'x', -(legs.thigh + legs.knee + 3)],
    ],
    hips: { x: 0.012 * shift * (1 - crouch), z: -0.14 * crouch },
  };
}

/** Blends two poses turn by turn (same bones and axes, in order). */
export function mix(a: Pose, b: Pose, t: number): Pose {
  const k = smooth(t);
  const keyed = new Map<string, number>();
  for (const [bn, ax, d] of a.turns) keyed.set(`${bn}:${ax}`, (keyed.get(`${bn}:${ax}`) ?? 0) + d * (1 - k));
  for (const [bn, ax, d] of b.turns) keyed.set(`${bn}:${ax}`, (keyed.get(`${bn}:${ax}`) ?? 0) + d * k);
  const turns: Turn[] = [...keyed].map(([key, d]) => {
    const [bn, ax] = key.split(':');
    return [bn, ax as Axis, d];
  });
  const h = (p: Pose, c: 'x' | 'y' | 'z') => p.hips?.[c] ?? 0;
  return {
    turns,
    hips: { x: h(a, 'x') * (1 - k) + h(b, 'x') * k, y: h(a, 'y') * (1 - k) + h(b, 'y') * k, z: h(a, 'z') * (1 - k) + h(b, 'z') * k },
    plant: a.plant !== false || b.plant !== false,
  };
}

/** A one-shot as key poses at times; smooth in between. */
export function keyed(keys: [number, Pose][]): (t: number) => Pose {
  return (t) => {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const [t0, p0] = keys[i];
    const [t1, p1] = keys[i + 1];
    return mix(p0, p1, (t - t0) / Math.max(t1 - t0, 1e-3));
  };
}

export const STAND: Pose = idlePose(0, 0);

/** Bending down to lift something from the ground with the right hand. */
const REACH_DOWN: Pose = {
  turns: [
    ['Spine', 'x', 34],
    ['Spine1', 'x', 12],
    ['Head', 'x', 14],
    ...armsDown(0, -10),
    ['RightArm', 'x', -52],
    ['RightArm', 'z', -14],
    ['RightForeArm', 'x', -12],
    ['LeftArm', 'x', -14],
    ['LeftForeArm', 'x', -30],
    ['LeftUpLeg', 'x', -68],
    ['RightUpLeg', 'x', -40],
    ['LeftLeg', 'x', 92],
    ['RightLeg', 'x', 70],
    ['LeftFoot', 'x', -24],
    ['RightFoot', 'x', -30],
  ],
  hips: { z: -0.1 },
};

/** Holding it close afterwards. */
const HOLD: Pose = {
  turns: [['Spine', 'x', 3], ['Head', 'x', 6], ...armsDown(0, -14), ['RightArm', 'x', -28], ['RightArm', 'z', -18], ['RightForeArm', 'x', -70], ['LeftArm', 'x', -10], ['LeftForeArm', 'x', -30]],
};

/** Reaching out, right hand at chest height (a counter, a latch). */
const REACH_OUT: Pose = {
  turns: [['Spine', 'x', 10], ['Spine1', 'y', -8], ['Head', 'x', 6], ...armsDown(0, -12), ['RightArm', 'x', -72], ['RightArm', 'z', -16], ['RightForeArm', 'x', -18], ['LeftForeArm', 'x', -22]],
};

/** A push on a door: the arm out, palm first. */
const PUSH: Pose = {
  turns: [['Spine', 'x', 6], ['Head', 'x', 2], ...armsDown(0, -12), ['RightArm', 'x', -82], ['RightArm', 'z', -8], ['RightForeArm', 'x', -26], ['RightHand', 'x', -30], ['LeftForeArm', 'x', -18]],
};

/** Namaste: palms together before the chest. */
export const NAMASTE: Pose = {
  turns: [['Spine', 'x', 4], ['Head', 'x', 4], ...armsDown(-24, 0), ['LeftArm', 'x', -30], ['RightArm', 'x', -30], ['LeftArm', 'y', 28], ['RightArm', 'y', -28], ['LeftForeArm', 'x', -112], ['RightForeArm', 'x', -112], ['LeftForeArm', 'y', -30], ['RightForeArm', 'y', 30]],
};

/** The turns of a namaste, from five numbers: how far the arms swing in, forward, and round; the forearms' fold and cross. */
const namasteTurns = (p: readonly number[]): Turn[] => [
  ['Spine', 'x', 4],
  ['Head', 'x', 4],
  ...armsDown(0, 0),
  ['LeftArm', 'z', -40 + p[0]],
  ['RightArm', 'z', 40 - p[0]],
  ['LeftArm', 'x', p[1]],
  ['RightArm', 'x', p[1]],
  ['LeftArm', 'y', p[2]],
  ['RightArm', 'y', -p[2]],
  ['LeftForeArm', 'x', p[3]],
  ['RightForeArm', 'x', p[3]],
  ['LeftForeArm', 'y', p[4]],
  ['RightForeArm', 'y', -p[4]],
];

/**
 * A namaste whose palms actually meet, for THIS skeleton.
 *
 * The fixed NAMASTE below was written for one set of proportions and, on the character as built,
 * left the hands 0.8 m apart with the arms spread. Arm length and shoulder width differ from
 * person to person, and a pose made of angles cannot be right for all of them — so the angles are
 * searched for, once, when the clips are built: the five numbers that put both palms together, at
 * the chest, a hand's breadth in front of it. It takes a few hundred trial poses and a few
 * milliseconds.
 */
export function fitNamaste(rig: Rig, model: Object3D): { namaste: Pose; bow: Pose } {
  const head = rig.bones.get('Head');
  const l = rig.bones.get('LeftHand');
  const r = rig.bones.get('RightHand');
  if (!head || !l || !r) return { namaste: NAMASTE, bow: BOW };
  model.updateMatrixWorld(true);
  const inFrame = (b: Object3D) => model.worldToLocal(b.getWorldPosition(new Vector3()));
  rig.reset();
  model.updateMatrixWorld(true);
  const height = inFrame(head).y;

  /** The five arm numbers that put both palms at `target`, given whatever the torso is already doing. */
  const solve = (extra: Turn[], target: Vector3, start: number[]): number[] => {
    const cost = (p: number[]) => {
      rig.apply({ turns: [...namasteTurns(p), ...extra] });
      model.updateMatrixWorld(true);
      const a = inFrame(l);
      const b = inFrame(r);
      return Math.hypot(a.x - 0.02, a.y - target.y, a.z - target.z) + Math.hypot(b.x + 0.02, b.y - target.y, b.z - target.z);
    };
    let p = start;
    let best = cost(p);
    for (const step of [20, 10, 5, 2, 1]) {
      for (let round = 0; round < 40; round++) {
        let improved = false;
        for (let i = 0; i < p.length; i++) {
          for (const d of [step, -step]) {
            const q = [...p];
            q[i] += d;
            const c = cost(q);
            if (c < best - 1e-5) {
              best = c;
              p = q;
              improved = true;
            }
          }
        }
        if (!improved) break;
      }
    }
    return p;
  };

  const upright = solve([], new Vector3(0, height * 0.8, 0.24), [24, 10, 55, -100, -50]);
  // Bowing bends the spine, and arm angles that put the palms together upright swing them across
  // each other once the torso leans — so the bow is fitted on its own, palms together, lower and
  // further forward, with the lean already in.
  const lean: Turn[] = [['Spine', 'x', 22], ['Spine1', 'x', 8], ['Head', 'x', 24]];
  const bowed = solve(lean, new Vector3(0, height * 0.72, 0.36), upright);
  rig.reset();
  model.updateMatrixWorld(true);
  return { namaste: { turns: namasteTurns(upright) }, bow: { turns: [...namasteTurns(bowed), ...lean] } };
}

/** …and a bow over them. */
export const BOW: Pose = { ...NAMASTE, turns: [...NAMASTE.turns, ['Spine', 'x', 22], ['Spine1', 'x', 8], ['Head', 'x', 24]] };

/** Palms together at the chest, on the knees: the moment before the bow. Ankles are planted, so the
 *  hips settle to wherever the folded legs put them. */
const KNEEL: Pose = {
  turns: [
    ['Spine', 'x', 2],
    ['Head', 'x', 8],
    ...armsDown(-24, 0),
    ['LeftArm', 'x', -30],
    ['RightArm', 'x', -30],
    ['LeftArm', 'y', 28],
    ['RightArm', 'y', -28],
    ['LeftForeArm', 'x', -112],
    ['RightForeArm', 'x', -112],
    ['LeftForeArm', 'y', -30],
    ['RightForeArm', 'y', 30],
    // Thighs upright, shins folded back along the floor, the feet laid flat behind.
    ['LeftUpLeg', 'x', -4],
    ['RightUpLeg', 'x', -4],
    ['LeftLeg', 'x', 100],
    ['RightLeg', 'x', 100],
    ['LeftFoot', 'x', 46],
    ['RightFoot', 'x', 46],
  ],
};

/**
 * The pranam itself: sat back on the heels and folded forward, forehead toward the ground and the
 * joined hands stretched out in front of it — the way a devotee bows to Bappa. The hips go back a
 * little so the bow ends before the altar, not on it.
 */
const PRANAM: Pose = {
  turns: [
    ['Spine', 'x', 42],
    ['Spine1', 'x', 26],
    ['Spine2', 'x', 12],
    ['Neck', 'x', 8],
    ['Head', 'x', 22],
    ...armsDown(-24, 0),
    ['LeftArm', 'x', -96],
    ['RightArm', 'x', -96],
    ['LeftArm', 'y', 24],
    ['RightArm', 'y', -24],
    ['LeftForeArm', 'x', -6],
    ['RightForeArm', 'x', -6],
    ['LeftHand', 'y', -12],
    ['RightHand', 'y', 12],
    ['LeftUpLeg', 'x', -84],
    ['RightUpLeg', 'x', -84],
    ['LeftLeg', 'x', 150],
    ['RightLeg', 'x', 150],
    ['LeftFoot', 'x', 40],
    ['RightFoot', 'x', 40],
  ],
  hips: { z: -0.2 },
};

/**
 * Off the ground: the trailing leg tucked, the leading one reaching, arms out for balance.
 *
 * `plant` is off — every other pose solves the hips so the lower foot meets the floor, which is
 * exactly wrong in mid-air: it would drag the character back down to the ground it just left.
 */
const AIRBORNE: Pose = {
  turns: [
    ['Spine', 'x', 8],
    ['Spine1', 'x', 4],
    ['Head', 'x', -6],
    ...armsDown(-18, -34),
    ['LeftArm', 'z', -46],
    ['RightArm', 'z', 46],
    ['LeftArm', 'x', -18],
    ['RightArm', 'x', -14],
    ['LeftUpLeg', 'x', -46],
    ['LeftLeg', 'x', 78],
    ['LeftFoot', 'x', -18],
    ['RightUpLeg', 'x', -12],
    ['RightLeg', 'x', 26],
    ['RightFoot', 'x', -16],
  ],
  plant: false,
};

/** The same, a breath later: enough motion that a long fall does not look like a photograph. */
const AIRBORNE_B: Pose = {
  ...AIRBORNE,
  turns: [
    ...AIRBORNE.turns,
    ['LeftUpLeg', 'x', 8],
    ['RightUpLeg', 'x', -10],
    ['LeftArm', 'z', -6],
    ['RightArm', 'z', 6],
  ],
};

// ---- the clips ----------------------------------------------------------------------------------

/**
 * Builds every clip PlayerAnimation asks for. Locomotion clips carry `userData.groundSpeed` (m/s);
 * cycle lengths are chosen so each gait's natural speed sits near the controller's.
 */
/**
 * Poses a model and leaves it posed, for whoever wants to bake the result — the walking villagers
 * are six baked phases of a walk, swapped in turn. One Poser per model: it remembers the rest pose
 * it was built with, and every pose is applied from there rather than on top of the last one.
 */
export class Poser {
  private readonly rig: Rig;
  private readonly model: Object3D;

  constructor(model: Object3D) {
    this.model = model;
    this.rig = new Rig(model);
  }

  get ok(): boolean {
    return this.rig.ok;
  }

  /** Standing at rest. */
  stand(): void {
    this.set(STAND);
  }

  /** One phase (0..1) of a gait's cycle. */
  gait(kind: 'slow' | 'walk' | 'run', phase: number): void {
    this.set(gaitPose(GAITS[kind], phase));
  }

  private set(p: Pose): void {
    if (!this.rig.ok) return;
    this.rig.apply(p);
    this.model.updateMatrixWorld(true);
  }
}

export function buildProceduralClips(model: Object3D, speeds: { slow: number; walk: number; run: number; crouch: number }): AnimationClip[] {
  const rig = new Rig(model);
  if (!rig.ok) return [];
  const fps = 30;
  const clips: AnimationClip[] = [];

  clips.push(rig.clip('Idle', 7, 15, (t) => idlePose(t, 0)));
  clips.push(rig.clip('CrouchIdle', 7, 15, (t) => idlePose(t, 1)));

  const gait = (name: string, g: Gait, target: number, crouch = 0) => {
    // Measure the stride once at a nominal length, then choose the cycle that makes the gait's
    // natural speed the controller's (within a believable cadence).
    const probe = rig.groundSpeed(1, (t) => gaitPose(g, t, crouch));
    const duration = probe > 0 ? Math.min(Math.max(probe / target, 0.5), 1.4) : 1;
    const clip = rig.clip(name, duration, fps, (t) => gaitPose(g, t / duration, crouch));
    clip.userData = { groundSpeed: probe / duration };
    clips.push(clip);
  };
  gait('SlowWalk', GAITS.slow, speeds.slow);
  gait('Walk', GAITS.walk, speeds.walk);
  gait('Run', GAITS.run, speeds.run);
  gait('CrouchWalk', GAITS.crouch, speeds.crouch, 1);

  clips.push(rig.clip('Pickup', 1.4, fps, keyed([[0, STAND], [0.55, REACH_DOWN], [0.8, REACH_DOWN], [1.15, HOLD], [1.4, STAND]])));
  clips.push(rig.clip('Interact', 1.0, fps, keyed([[0, STAND], [0.38, REACH_OUT], [0.62, REACH_OUT], [1.0, STAND]])));
  const { namaste, bow } = fitNamaste(rig, model);
  clips.push(rig.clip('Celebrate', 2.2, fps, keyed([[0, STAND], [0.5, namaste], [0.9, bow], [1.35, bow], [1.75, namaste], [2.2, STAND]])));
  // Offering and praying at the temple: a namaste, down onto the knees, the full bow, and back up.
  // The gameplay effect lands at the clip's midpoint, which is the deepest part of the bow.
  clips.push(
    rig.clip('Pranam', 4.6, fps, keyed([[0, STAND], [0.4, namaste], [1.2, KNEEL], [1.9, PRANAM], [2.7, PRANAM], [3.4, KNEEL], [4.1, namaste], [4.6, STAND]])),
  );
  clips.push(rig.clip('EnterHouse', 0.8, fps, keyed([[0, STAND], [0.3, PUSH], [0.5, PUSH], [0.8, STAND]])));
  clips.push(rig.clip('ExitHouse', 0.8, fps, keyed([[0, STAND], [0.3, PUSH], [0.5, PUSH], [0.8, STAND]])));
  // Held while the feet are off the ground, and looped: the blend weight, not the clip, says how
  // long a jump lasts, so one pose covers a hop off a step and a drop from the temple plinth.
  clips.push(rig.clip('Jump', 0.9, fps, keyed([[0, AIRBORNE], [0.45, AIRBORNE_B], [0.9, AIRBORNE]])));
  rig.reset();
  model.updateMatrixWorld(true);
  return clips;
}
