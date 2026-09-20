/**
 * What the village's people are doing: sweeping a doorstep, drawing rangoli, hanging a garland,
 * stringing marigolds, waving the aarti lamp. Each is a short, seamlessly looping clip, made in
 * code for the same skeleton the player walks with (see proceduralClips.ts for the conventions:
 * the character faces +z, its left is +x; arm down from the A-pose is Z; raising an arm forward
 * is −X; elbow flexion is −X on the forearm; hip flexion is −X on the thigh; knee flexion is +X).
 *
 * All of them are slow. These are people going about a festival evening, not an animation reel:
 * the fastest thing here is the pujari's bell, and that is meant to be quick.
 *
 * Every loop is a whole number of periods of one base period, so it closes on itself without a
 * seam, and every pose is tested (activity.test.ts) against the skeleton: a hand that is meant to
 * be on the ground is measured on the ground.
 */
import type { AnimationClip, Object3D } from 'three';
import { armsDown, fitNamaste, GAITS, gaitPose, idlePose, mix, type Pose, Rig, type Turn } from './proceduralClips';

const TAU = Math.PI * 2;
const FPS = 24;

export const ACTIVITIES = [
  'Sweep',
  'Rangoli',
  'Wipe',
  'Garland',
  'HoldUp',
  'Talk',
  'Listen',
  'Lamp',
  'Arrange',
  'Stringing',
  'SitStool',
  'SitEdge',
  'Aarti',
  'Pray',
  'CarryWalk',
] as const;
export type Activity = (typeof ACTIVITIES)[number];

/** Seconds per loop. Longer is slower. */
const PERIOD: Record<Activity, number> = {
  Sweep: 2.4,
  Rangoli: 5,
  Wipe: 3,
  Garland: 4,
  HoldUp: 5,
  Talk: 6,
  Listen: 7,
  Lamp: 5,
  Arrange: 4.5,
  Stringing: 4,
  SitStool: 7,
  SitEdge: 8,
  Aarti: 3,
  Pray: 6,
  CarryWalk: 1.2,
};

// ---- lower-body postures --------------------------------------------------------------------------

/** Kneeling on both knees, sitting back a little: the rangoli and the floor-cloth. */
const kneelLegs = (): Turn[] => [
  ['LeftUpLeg', 'x', -12],
  ['RightUpLeg', 'x', -12],
  ['LeftLeg', 'x', 118],
  ['RightLeg', 'x', 118],
  ['LeftFoot', 'x', 42],
  ['RightFoot', 'x', 42],
];

/** Sitting with the shins hanging: a stool, or the edge of a veranda. */
const seatedLegs = (thigh = -84, shin = 84): Turn[] => [
  ['LeftUpLeg', 'x', thigh],
  ['RightUpLeg', 'x', thigh],
  ['LeftLeg', 'x', shin],
  ['RightLeg', 'x', shin],
  ['LeftFoot', 'x', -(thigh + shin) + 4],
  ['RightFoot', 'x', -(thigh + shin) + 4],
];

/** One foot a little ahead, knees soft: someone who has been standing at the same work for a while. */
const workStance = (s: number): Turn[] => [
  ['LeftUpLeg', 'x', -9 + 2 * s],
  ['RightUpLeg', 'x', 5 - 2 * s],
  ['LeftLeg', 'x', 14],
  ['RightLeg', 'x', 8],
  ['LeftFoot', 'x', -5],
  ['RightFoot', 'x', -3],
];

// ---- the activities -------------------------------------------------------------------------------

function sweep(t: number): Pose {
  const a = (TAU * t) / PERIOD.Sweep;
  const s = Math.sin(a);
  const c = Math.cos(a);
  return {
    turns: [
      ['Spine', 'x', 30],
      ['Spine1', 'x', 14],
      ['Spine1', 'y', 9 * s],
      ['Head', 'x', 14],
      ['Head', 'y', -5 * s],
      ...armsDown(0, -12),
      // The right hand pulls the broom in and pushes it out; the left steadies the handle.
      ['RightArm', 'x', -22 + 18 * s],
      ['RightArm', 'z', 6 * c],
      ['RightForeArm', 'x', -22 - 12 * s],
      ['LeftArm', 'x', -14 + 12 * s],
      ['LeftForeArm', 'x', -34 - 8 * s],
      ...workStance(s),
    ],
    hips: { z: 0.045 - 0.02 * s, x: 0.012 * c },
  };
}

function rangoli(t: number): Pose {
  const a = (TAU * t) / PERIOD.Rangoli;
  const s = Math.sin(a);
  const c = Math.cos(a);
  return {
    turns: [
      ['Spine', 'x', 38],
      ['Spine1', 'x', 30],
      ['Spine1', 'y', 5 * s],
      ['Head', 'x', 18],
      ['Head', 'y', 6 * c],
      ...armsDown(0, -12),
      // The right hand draws slow loops on the ground in front of her; the left rests on a knee.
      ['RightArm', 'x', -46 + 13 * c],
      ['RightArm', 'z', 4 + 15 * s],
      ['RightForeArm', 'x', -10 + 9 * s],
      ['LeftArm', 'x', -36],
      ['LeftForeArm', 'x', -46],
      ...kneelLegs(),
    ],
    hips: { z: -0.12 },
  };
}

function wipe(t: number): Pose {
  const a = (TAU * t) / PERIOD.Wipe;
  const s = Math.sin(a);
  const c = Math.cos(a);
  return {
    turns: [
      ['Spine', 'x', 42],
      ['Spine1', 'x', 32],
      ['Spine1', 'y', 12 * s],
      ['Head', 'x', 18],
      ...armsDown(0, -12),
      // A cloth pushed side to side across the floor; the left hand takes her weight.
      ['RightArm', 'x', -50 + 4 * c],
      ['RightArm', 'z', 4 + 28 * s],
      ['RightForeArm', 'x', -6 + 6 * c],
      ['LeftArm', 'x', -46],
      ['LeftForeArm', 'x', -4],
      ...kneelLegs(),
    ],
    hips: { z: -0.12, x: 0.03 * s },
  };
}

function garland(t: number): Pose {
  const a = (TAU * t) / PERIOD.Garland;
  const s = Math.sin(a);
  const c = Math.cos(a);
  return {
    turns: [
      ['Spine', 'x', -2],
      ['Head', 'x', -22],
      ['Head', 'y', 5 * s],
      // Both arms overhead, tying the garland to the frame: the hands work small, opposite ways.
      ['LeftArm', 'z', 95 + 5 * s],
      ['RightArm', 'z', -95 - 5 * c],
      ['LeftArm', 'x', -25 + 5 * c],
      ['RightArm', 'x', -25 + 5 * s],
      ['LeftForeArm', 'x', -25 - 10 * s],
      ['RightForeArm', 'x', -25 - 10 * c],
      ...workStance(0),
    ],
    hips: { y: 0.008 * s },
  };
}

function holdUp(t: number): Pose {
  const a = (TAU * t) / PERIOD.HoldUp;
  const s = Math.sin(a);
  return {
    turns: [
      ['Spine', 'x', -2],
      ['Head', 'x', -18],
      ['Head', 'y', 6 * s],
      ...armsDown(0, -12),
      // Holding the next garland up to whoever is on the stage, weight shifting with the wait.
      ['LeftArm', 'x', -75 + 5 * s],
      ['RightArm', 'x', -75 - 5 * s],
      ['LeftForeArm', 'x', -30],
      ['RightForeArm', 'x', -30],
      ...workStance(s),
    ],
    hips: { x: 0.015 * s },
  };
}

function talk(t: number): Pose {
  const a = (TAU * t) / PERIOD.Talk;
  const s = Math.sin(a);
  const beat = Math.max(0, Math.sin(a * 2));
  return {
    turns: [
      ['Spine', 'x', 2],
      ['Spine1', 'y', -8 + 3 * s],
      ['Head', 'y', -10 + 9 * Math.sin(a * 0.5)],
      ['Head', 'x', 3 + 3 * beat],
      ...armsDown(0, -12),
      // The right hand makes the point, palm open, on the beat; the left hangs and drifts.
      ['RightArm', 'x', -35 - 10 * beat],
      ['RightForeArm', 'x', -70 - 16 * beat],
      ['LeftForeArm', 'x', -15 - 5 * Math.sin(a + 1)],
      ...workStance(s),
    ],
    hips: { x: 0.012 * s },
  };
}

function listen(t: number): Pose {
  const a = (TAU * t) / PERIOD.Listen;
  const nod = Math.max(0, Math.sin(a * 2));
  return {
    turns: [
      ['Spine', 'x', 3],
      ['Head', 'x', 4 + 7 * nod],
      ['Head', 'y', 10 * Math.sin(a) * 0.6 + 8],
      ['Head', 'z', 3 * Math.sin(a * 0.5)],
      ...armsDown(0, -14),
      ['LeftArm', 'x', -6],
      ['RightArm', 'x', -6],
      ...workStance(Math.sin(a)),
    ],
    hips: { x: 0.01 * Math.sin(a) },
  };
}

function lamp(t: number): Pose {
  const a = (TAU * t) / PERIOD.Lamp;
  const s = Math.sin(a);
  return {
    turns: [
      ['Spine', 'x', 2],
      ['Head', 'x', -15 + 3 * s],
      ...armsDown(0, -12),
      // The right hand up to a niche with a flame, steadying it; the left cupped below.
      ['RightArm', 'x', -95 + 4 * s],
      ['RightArm', 'z', 20],
      ['RightForeArm', 'x', -35 - 5 * s],
      ['LeftArm', 'x', -45],
      ['LeftForeArm', 'x', -60 + 4 * s],
      ...workStance(0),
    ],
  };
}

function arrange(t: number): Pose {
  const a = (TAU * t) / PERIOD.Arrange;
  const s = Math.sin(a);
  const c = Math.cos(a);
  return {
    turns: [
      ['Spine', 'x', 9],
      ['Head', 'x', 22 + 3 * s],
      ['Head', 'y', 7 * c],
      ...armsDown(0, -12),
      // Both hands at counter height, moving trays and sweets a little at a time, alternately.
      ['LeftArm', 'x', -14 + 8 * s],
      ['RightArm', 'x', -14 - 8 * s],
      ['LeftArm', 'z', -32 + 5 * c],
      ['RightArm', 'z', 32 - 5 * c],
      ['LeftForeArm', 'x', -40 + 8 * c],
      ['RightForeArm', 'x', -40 - 8 * c],
      ...workStance(s),
    ],
    hips: { x: 0.014 * s },
  };
}

function stringing(t: number): Pose {
  const a = (TAU * t) / PERIOD.Stringing;
  const s = Math.sin(a);
  const c = Math.cos(a);
  return {
    turns: [
      ['Spine', 'x', 12],
      ['Head', 'x', 24],
      ['Head', 'y', 5 * s],
      ...armsDown(0, -12),
      // Seated, threading marigolds: both hands together in the lap, the right drawing the needle out.
      ['LeftArm', 'x', -46],
      ['RightArm', 'x', -50 - 6 * c],
      ['LeftArm', 'z', -24],
      ['RightArm', 'z', 24 + 6 * s],
      ['LeftForeArm', 'x', -62],
      ['RightForeArm', 'x', -62 - 12 * Math.max(0, s)],
      ...seatedLegs(-86, 86),
    ],
  };
}

function sitStool(t: number): Pose {
  const a = (TAU * t) / PERIOD.SitStool;
  const s = Math.sin(a);
  const beat = Math.max(0, Math.sin(a * 2));
  return {
    turns: [
      ['Spine', 'x', 10],
      ['Head', 'y', 22 * Math.sin(a * 0.5)],
      ['Head', 'x', 8 + 5 * beat],
      ...armsDown(0, -12),
      // Weighing rice, waiting for the next customer: hands drift on the counter.
      ['LeftArm', 'x', -25],
      ['RightArm', 'x', -28 - 6 * beat],
      ['LeftForeArm', 'x', -55],
      ['RightForeArm', 'x', -55 - 10 * beat],
      ...seatedLegs(-80, 80),
    ],
    hips: { x: 0.008 * s },
  };
}

function sitEdge(t: number): Pose {
  const a = (TAU * t) / PERIOD.SitEdge;
  const s = Math.sin(a);
  return {
    turns: [
      ['Spine', 'x', 6],
      ['Head', 'y', 26 * Math.sin(a)],
      ['Head', 'x', 4 + 3 * Math.sin(a * 2)],
      ...armsDown(0, -12),
      // Watching the lane, hands on his knees, breathing slowly.
      ['LeftArm', 'x', -30],
      ['RightArm', 'x', -30],
      ['LeftForeArm', 'x', -40],
      ['RightForeArm', 'x', -40],
      ['Spine2', 'x', 1.2 * s],
      ...seatedLegs(-88, 85),
      // an old man swings a foot now and then
      ['RightLeg', 'x', 85 + 5 * Math.max(0, Math.sin(a * 2 + 1))],
    ],
  };
}

function aarti(t: number): Pose {
  const a = (TAU * t) / PERIOD.Aarti;
  const s = Math.sin(a);
  const c = Math.cos(a);
  return {
    turns: [
      ['Spine', 'x', 3],
      ['Head', 'x', 6],
      ['Head', 'y', 4 * s],
      ...armsDown(0, -12),
      // The right hand circles the lamp before the god: slow, wide, clockwise as seen from the front.
      ['RightArm', 'x', -72 + 13 * c],
      ['RightArm', 'z', 30 + 14 * s],
      ['RightForeArm', 'x', -62 + 10 * s],
      // The left hand rings the bell — quickly, from the wrist, four rings to a circle.
      ['LeftArm', 'x', -52],
      ['LeftArm', 'z', -30],
      ['LeftForeArm', 'x', -72 + 20 * Math.sin(a * 4)],
      ...workStance(0),
    ],
    hips: { x: 0.008 * s },
  };
}

/** Set by `buildActivityClips` for the skeleton being built: a namaste whose palms meet on it. */
let fitted: { namaste: Pose; bow: Pose } | null = null;

function pray(t: number): Pose {
  const a = (TAU * t) / PERIOD.Pray;
  // A namaste that bows a little on each slow breath and comes back up.
  return fitted ? mix(fitted.namaste, fitted.bow, 0.5 - 0.5 * Math.cos(a)) : STAND_FALLBACK;
}
const STAND_FALLBACK: Pose = idlePose(0, 0);

function carryWalk(t: number): Pose {
  const g = GAITS.slow;
  const base = gaitPose(g, (t / PERIOD.CarryWalk) % 1);
  const keep = base.turns.filter(([b]) => !/Arm$|ForeArm$/.test(b));
  return {
    ...base,
    turns: [
      ...keep,
      // One hand up to steady the pot on the hip, the other swinging gently.
      ['LeftArm', 'z', -14],
      ['LeftArm', 'x', 4],
      ['LeftForeArm', 'x', -44],
      ['RightArm', 'z', 40],
      ['RightArm', 'x', 10 * Math.cos(TAU * ((t / PERIOD.CarryWalk) % 1))],
      ['RightForeArm', 'x', -14],
    ],
  };
}

const POSES: Record<Activity, (t: number) => Pose> = {
  Sweep: sweep,
  Rangoli: rangoli,
  Wipe: wipe,
  Garland: garland,
  HoldUp: holdUp,
  Talk: talk,
  Listen: listen,
  Lamp: lamp,
  Arrange: arrange,
  Stringing: stringing,
  SitStool: sitStool,
  SitEdge: sitEdge,
  Aarti: aarti,
  Pray: pray,
  CarryWalk: carryWalk,
};

/** The pose function of an activity: what the tests measure, and what the clip is sampled from. */
export function activityPose(activity: Activity, t: number): Pose {
  return POSES[activity](t);
}

export function activityPeriod(activity: Activity): number {
  return PERIOD[activity];
}

/**
 * Every activity as an ordinary looping AnimationClip for this character's skeleton, named for the
 * activity. The clips target bones by name, so one set drives every clone of the model. Idle is
 * added here too, because a person between two jobs stands about like anybody else.
 */
export function buildActivityClips(model: Object3D): AnimationClip[] {
  const rig = new Rig(model);
  if (!rig.ok) return [];
  fitted = fitNamaste(rig, model);
  const clips = ACTIVITIES.map((name) => rig.clip(name, PERIOD[name], FPS, (t) => POSES[name](t)));
  // A walking activity says how fast it travels, so playback can be matched to how fast they walk.
  const carry = clips.find((c) => c.name === 'CarryWalk');
  if (carry) carry.userData = { groundSpeed: rig.groundSpeed(PERIOD.CarryWalk, POSES.CarryWalk) };
  clips.push(rig.clip('Rest', 7, 15, (t) => idlePose(t, 0)));
  rig.reset();
  model.updateMatrixWorld(true);
  return clips;
}
