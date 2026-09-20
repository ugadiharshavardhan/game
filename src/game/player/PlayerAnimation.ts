import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type Object3D,
  VectorKeyframeTrack,
} from 'three';
import type { PlayerConfig } from '../config/playerConfig';
import { blendWeights, motionSpeedMultiplier } from './locomotion';

/** One-shot full-body animations. Names are the clip names baked into devotee.glb. */
export const PlayerAction = {
  Interact: 'Interact',
  Pickup: 'Pickup',
  Celebrate: 'Celebrate',
  EnterHouse: 'EnterHouse',
  ExitHouse: 'ExitHouse',
} as const;
export type PlayerAction = (typeof PlayerAction)[keyof typeof PlayerAction];

const LOCOMOTION = ['Idle', 'SlowWalk', 'Walk', 'Run'] as const;
const CROUCH = ['CrouchIdle', 'CrouchWalk'] as const;
/** Held while the feet are off the ground; blended over the gaits like the crouch is. */
const AIR = 'Jump';
/** When a clip is missing, how long the gameplay effect of an action takes. */
const FALLBACK_ACTION_SECONDS = 0.9;

interface RunningAction {
  action: AnimationAction | null;
  duration: number;
  elapsed: number;
  onMidpoint: (() => void) | null;
  onComplete: () => void;
}

/**
 * Drives the character's AnimationMixer as a small blend tree:
 * a 1D locomotion blend on speed, a crouch blend, an airborne blend, phase-synced strides,
 * playback rate matched to ground speed, and one-shot actions on top.
 *
 * The airborne pose is weighted in rather than played as a one-shot, so a jump lasts exactly as
 * long as the feet are actually off the ground — a hop off a step and a drop from the temple
 * plinth are the same clip, held for different lengths of time.
 */
export class PlayerAnimation {
  private readonly mixer: AnimationMixer;
  private readonly loco: (AnimationAction | null)[];
  private readonly crouch: (AnimationAction | null)[];
  private readonly nativeLoco: number[];
  private readonly nativeCrouch: number[];
  private readonly clips = new Map<string, AnimationClip>();
  private readonly air: AnimationAction | null;
  private crouchWeight = 0;
  private airWeight = 0;
  private actionWeight = 0;
  private running: RunningAction | null = null;
  readonly missingClips: string[] = [];
  private readonly config: PlayerConfig;

  constructor(
    model: Object3D,
    clips: AnimationClip[],
    config: PlayerConfig,
  ) {
    this.config = config;
    this.mixer = new AnimationMixer(model);
    const native = new Map<string, number>();
    for (const clip of clips) {
      // Clips made in code say how fast their stride travels; imported ones are measured.
      const measured = (clip.userData as { groundSpeed?: number } | undefined)?.groundSpeed;
      native.set(clip.name, measured ?? makeInPlace(clip));
      this.clips.set(clip.name, clip);
    }
    const start = (name: string) => {
      const clip = this.clips.get(name);
      if (!clip) {
        this.missingClips.push(name);
        return null;
      }
      const a = this.mixer.clipAction(clip);
      a.setLoop(LoopRepeat, Infinity);
      a.setEffectiveWeight(name === 'Idle' ? 1 : 0);
      a.play();
      return a;
    };
    this.loco = LOCOMOTION.map(start);
    this.crouch = CROUCH.map(start);
    this.air = start(AIR);
    this.nativeLoco = LOCOMOTION.map((n) => native.get(n) ?? 0);
    this.nativeCrouch = CROUCH.map((n) => native.get(n) ?? 0);
    for (const a of Object.values(PlayerAction)) if (!this.clips.has(a)) this.missingClips.push(a);
  }

  get isPlayingAction(): boolean {
    return this.running !== null;
  }

  update(dt: number, speed: number, crouched: boolean, airborne = false): void {
    const c = this.config;
    const k = 1 - Math.exp(-dt / Math.max(c.blendTime, 1e-3));
    this.crouchWeight += ((crouched ? 1 : 0) - this.crouchWeight) * (1 - Math.exp(-dt / 0.12));
    // Quick off the ground, softer back onto it: a landing should settle, not snap.
    this.airWeight += ((airborne ? 1 : 0) - this.airWeight) * (1 - Math.exp(-dt / (airborne ? 0.07 : 0.12)));
    this.actionWeight += ((this.running ? 1 : 0) - this.actionWeight) * (1 - Math.exp(-dt / c.actionFadeTime));
    const free = 1 - this.actionWeight;
    const onFoot = free * (1 - this.airWeight);

    const gait = [0, c.slowWalkSpeed, c.walkSpeed, c.runSpeed];
    const crouchGait = [0, c.crouchSpeed];
    this.drive(this.loco, blendWeights(speed, gait), (1 - this.crouchWeight) * onFoot, k);
    this.drive(this.crouch, blendWeights(speed, crouchGait), this.crouchWeight * onFoot, k);
    this.drive([this.air], [1], this.airWeight * free, k);

    const locoRate = motionSpeedMultiplier(speed, gait, this.nativeLoco, c.minMotionSpeed, c.maxMotionSpeed);
    const crouchRate = motionSpeedMultiplier(speed, crouchGait, this.nativeCrouch, c.minMotionSpeed, c.maxMotionSpeed);
    for (let i = 1; i < this.loco.length; i++) this.loco[i]?.setEffectiveTimeScale(this.nativeLoco[i] ? locoRate : 1);
    this.crouch[1]?.setEffectiveTimeScale(this.nativeCrouch[1] ? crouchRate : 1);
    syncPhase(this.loco.slice(1));

    this.tickAction(dt);
    this.mixer.update(dt);
  }

  /** Plays a one-shot. `onMidpoint` fires when the hand reaches the object; `onComplete` when control returns. */
  play(name: PlayerAction, onMidpoint: (() => void) | null, onComplete: () => void): void {
    const clip = this.clips.get(name);
    let action: AnimationAction | null = null;
    if (clip) {
      action = this.mixer.clipAction(clip);
      action.reset();
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.setEffectiveWeight(1);
      action.fadeIn(this.config.actionFadeTime).play();
    }
    this.running = {
      action,
      duration: clip ? clip.duration : FALLBACK_ACTION_SECONDS,
      elapsed: 0,
      onMidpoint,
      onComplete,
    };
  }

  dispose(): void {
    this.mixer.stopAllAction();
  }

  private tickAction(dt: number): void {
    const r = this.running;
    if (!r) return;
    r.elapsed += dt;
    if (r.onMidpoint && r.elapsed >= r.duration * 0.5) {
      const mid = r.onMidpoint;
      r.onMidpoint = null;
      mid();
    }
    if (r.elapsed >= r.duration - this.config.actionFadeTime) {
      r.action?.fadeOut(this.config.actionFadeTime);
      this.running = null;
      r.onComplete();
    }
  }

  private drive(actions: (AnimationAction | null)[], weights: number[], scale: number, k: number): void {
    actions.forEach((a, i) => {
      if (!a) return;
      const current = a.getEffectiveWeight();
      a.setEffectiveWeight(current + (weights[i] * scale - current) * k);
    });
  }
}

/**
 * Measures a locomotion clip's ground speed from its hips track, then removes the forward drift
 * so it plays in place (the physics body moves the character). Returns metres per second.
 */
export function makeInPlace(clip: AnimationClip): number {
  const track = clip.tracks.find((t) => t.name.endsWith('Hips.position')) as VectorKeyframeTrack | undefined;
  if (!track || track.times.length < 2 || clip.duration <= 0) return 0;
  const v = track.values;
  const n = track.times.length;
  const dx = v[(n - 1) * 3] - v[0];
  const dz = v[(n - 1) * 3 + 2] - v[2];
  const speed = Math.hypot(dx, dz) / clip.duration;
  if (speed < 0.05) return 0; // idles and actions stay as they are
  for (let i = 0; i < n; i++) {
    const t = track.times[i] / clip.duration;
    v[i * 3] -= dx * t;
    v[i * 3 + 2] -= dz * t;
  }
  return speed;
}

/** Keep blended strides in step: every moving clip follows the heaviest one's normalized time. */
function syncPhase(actions: (AnimationAction | null)[]): void {
  let leader: AnimationAction | null = null;
  for (const a of actions) if (a && (!leader || a.getEffectiveWeight() > leader.getEffectiveWeight())) leader = a;
  if (!leader || leader.getEffectiveWeight() < 0.01) return;
  const phase = leader.time / leader.getClip().duration;
  for (const a of actions) if (a && a !== leader) a.time = phase * a.getClip().duration;
}
