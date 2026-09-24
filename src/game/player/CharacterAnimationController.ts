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
import { blendWeights, strideRate } from './locomotion';
import { Posture } from './posture';

/** One-shot and sustained character animations. */
export const PlayerAction = {
  Interact: 'Interact',
  Pickup: 'Pickup',
  Celebrate: 'Celebrate',
  /** Kneeling before Bappa and bowing to the ground: offering and praying at the temple. */
  Pranam: 'Pranam',
  Offer: 'Offer',
  Talk: 'Talk',
  Sit: 'Sit',
  Sleep: 'Sleep',
  EnterHouse: 'EnterHouse',
  ExitHouse: 'ExitHouse',
} as const;
export type PlayerAction = (typeof PlayerAction)[keyof typeof PlayerAction];

/** The locomotion blend, slowest first. Speed picks two neighbours and mixes them. */
const LOCOMOTION = ['Idle', 'SlowWalk', 'Walk', 'FastWalk', 'Run'] as const;
const CROUCH = ['CrouchIdle', 'CrouchWalk'] as const;
/** Held while the feet are off the ground; blended over the gaits like the crouch is. */
const AIR = 'Jump';
/** When a clip is missing, how long the gameplay effect of an action takes. */
const FALLBACK_ACTION_SECONDS = 0.9;

/**
 * What the character is doing, as the rest of the game talks about it. The locomotion states are
 * *derived from speed* rather than commanded — the blend tree is continuous, and the name is what
 * that speed is nearest — so there is no moment where a state is set and the body has not caught
 * up with it yet.
 */
export const MovementState = {
  Idle: 'idle',
  Walk: 'walk',
  FastWalk: 'fast-walk',
  Run: 'run',
  Sneak: 'sneak',
  Interact: 'interact',
  Pickup: 'pickup',
  Celebrate: 'celebrate',
  Offer: 'offer',
  Talk: 'talk',
  JumpStart: 'jump-start',
  JumpLoop: 'jump-loop',
  JumpLand: 'jump-land',
  Sit: 'sit',
  Sleep: 'sleep',
  GetUp: 'get-up',
  /** On the way down to sitting or lying. */
  Transition: 'transition',
} as const;
export type MovementState = (typeof MovementState)[keyof typeof MovementState];

/** The clip each posture phase plays; null for standing (the locomotion blend has the body). */
const POSTURE_CLIP: Record<Posture, { clip: string; loop: boolean } | null> = {
  [Posture.Standing]: null,
  [Posture.SittingDown]: { clip: 'SitDown', loop: false },
  [Posture.Sitting]: { clip: 'SitLoop', loop: true },
  [Posture.StandingUp]: { clip: 'StandUp', loop: false },
  [Posture.LyingDown]: { clip: 'SleepStart', loop: false },
  [Posture.Sleeping]: { clip: 'SleepLoop', loop: true },
  [Posture.Waking]: { clip: 'WakeUp', loop: false },
};

/** A short full-body clip that takes over from the blend for a moment and gives it back. */
interface Burst {
  action: AnimationAction;
  left: number;
  duration: number;
  peak: number;
}

interface RunningAction {
  action: AnimationAction | null;
  duration: number;
  elapsed: number;
  onMidpoint: (() => void) | null;
  onComplete: () => void;
}

/**
 * Everything the character's body does, in one place, for the player and for teammates alike.
 *
 * It is a small blend tree rather than a stack of clips that get switched: a 1D blend on speed
 * (idle · stroll · walk · fast walk · run), a crouch blend across it, an airborne blend, strides
 * kept in phase so blended legs never fight, playback rate matched to the ground speed so the
 * feet do not skate, and one-shot actions (reach, pick up, bow) faded over the top without
 * stopping the legs.
 *
 * Nothing here knows about input, physics or the camera — it is given a speed and told whether
 * the character is crouching or airborne, and it works out the rest. That is what lets a remote
 * teammate, who has no controller at all, use the same class and look the same.
 */
export class CharacterAnimationController {
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
  private state: MovementState = MovementState.Idle;
  /** How long the character has been standing still, for the occasional glance about. */
  private idleFor = 0;
  private idleLook: AnimationAction | null = null;
  private idleLookWeight = 0;
  private turnStep: AnimationAction | null = null;
  private turnStepLeft: AnimationAction | null = null;
  private turnStepRight: AnimationAction | null = null;
  private turnStepFor = 0;
  readonly missingClips: string[] = [];
  private readonly config: PlayerConfig;
  /** Set by the named API; null while the blend follows the controller's real speed. */
  private commanded: { speed: number; crouched: boolean } | null = null;
  /** Sitting and lying: a layer over everything else, crossfaded clip to clip. */
  private posture: Posture = Posture.Standing;
  private postureAction: AnimationAction | null = null;
  private posturePrev: AnimationAction | null = null;
  private postureShare = 1;
  private postureWeight = 0;
  private readonly jumpStartAction: AnimationAction | null;
  private readonly jumpLandAction: AnimationAction | null;
  private jumpStart: Burst | null = null;
  private jumpLand: Burst | null = null;

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
    // The two that play *over* the locomotion rather than in place of it.
    this.idleLook = this.overlay('IdleLook');
    this.turnStepLeft = this.overlay('TurnLeft');
    this.turnStepRight = this.overlay('TurnRight');
    this.jumpStartAction = this.overlay('JumpStart');
    this.jumpLandAction = this.overlay('JumpLand');
    this.nativeLoco = LOCOMOTION.map((n) => native.get(n) ?? 0);
    this.nativeCrouch = CROUCH.map((n) => native.get(n) ?? 0);
    for (const a of Object.values(PlayerAction)) if (!this.clips.has(a)) this.missingClips.push(a);
    for (const p of Object.values(POSTURE_CLIP)) if (p && !this.clips.has(p.clip)) this.missingClips.push(p.clip);
  }

  /**
   * Which posture phase the body should show. Only a change does anything — the clip for the new
   * phase starts from its first frame and is crossfaded in over the last; standing hands the body
   * back to the locomotion blend (the get-up clips end on the standing pose, so nothing jumps).
   */
  setPosture(phase: Posture): void {
    if (phase === this.posture) return;
    this.posture = phase;
    const spec = POSTURE_CLIP[phase];
    if (!spec) return;
    const clip = this.clips.get(spec.clip);
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    if (this.posturePrev && this.posturePrev !== action) this.posturePrev.setEffectiveWeight(0).stop();
    this.posturePrev = this.postureAction && this.postureAction !== action ? this.postureAction : null;
    this.postureShare = this.posturePrev && this.postureWeight > 0.01 ? 0 : 1;
    action.reset();
    action.setLoop(spec.loop ? LoopRepeat : LoopOnce, spec.loop ? Infinity : 1);
    action.clampWhenFinished = !spec.loop;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(0);
    action.play();
    this.postureAction = action;
  }

  get postureBlend(): number {
    return this.postureWeight;
  }

  /** The feet just left the ground under their own power: the push-off, over the airborne hold. */
  launched(): void {
    if (!this.jumpStartAction) return;
    this.jumpStart = this.burst(this.jumpStartAction, 1);
  }

  /**
   * The feet just came down. `impact` is the downward speed (m/s); `moving` softens it, because a
   * runner landing keeps running rather than stopping to absorb it.
   */
  landed(impact: number, moving: boolean): void {
    if (!this.jumpLandAction || impact < 1.5) return;
    const peak = Math.min(1, impact / 6) * (moving ? 0.5 : 1);
    this.jumpLand = this.burst(this.jumpLandAction, peak);
  }

  private burst(action: AnimationAction, peak: number): Burst {
    const duration = action.getClip().duration;
    action.reset();
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(0);
    action.play();
    return { action, left: duration, duration, peak };
  }

  /** How much of the body a burst has this frame: all of it at once, eased out over its last half. */
  private burstWeight(b: Burst | null, dt: number): number {
    if (!b) return 0;
    b.left -= dt;
    const t = Math.max(b.left, 0) / Math.max(b.duration, 1e-3);
    return b.peak * Math.min(1, t * 2);
  }

  get isPlayingAction(): boolean {
    return this.running !== null;
  }

  /** What the character is doing now — the state machine's current node. */
  get movementState(): MovementState {
    return this.state;
  }

  // ---- the named API -----------------------------------------------------------------------
  //
  // The locomotion states are speeds, so "play a walk" is "be going at a walking pace": these set
  // the blend's target directly, for scripted moments and for tests. Ordinary play calls
  // updateMovementAnimation with a real speed and never touches them.

  playIdle(): void {
    this.setMovementState(MovementState.Idle);
  }

  playWalk(): void {
    this.setMovementState(MovementState.Walk);
  }

  playFastWalk(): void {
    this.setMovementState(MovementState.FastWalk);
  }

  playRun(): void {
    this.setMovementState(MovementState.Run);
  }

  playSneak(): void {
    this.setMovementState(MovementState.Sneak);
  }

  playPickup(onContact: (() => void) | null, onDone: () => void): void {
    this.play(PlayerAction.Pickup, onContact, onDone);
  }

  playInteract(onContact: (() => void) | null, onDone: () => void): void {
    this.play(PlayerAction.Interact, onContact, onDone);
  }

  playCelebrate(onDone: () => void = () => {}): void {
    this.play(PlayerAction.Celebrate, null, onDone);
  }

  playOffer(onContact: (() => void) | null = null, onDone: () => void = () => {}): void {
    this.play(PlayerAction.Offer, onContact, onDone);
  }

  playPranam(onContact: (() => void) | null = null, onDone: () => void = () => {}): void {
    this.play(PlayerAction.Pranam, onContact, onDone);
  }

  playTalk(onDone: () => void = () => {}): void {
    this.play(PlayerAction.Talk, null, onDone);
  }

  playSit(onDone: () => void = () => {}): void {
    this.play(PlayerAction.Sit, null, onDone);
  }

  playSleep(onDone: () => void = () => {}): void {
    this.play(PlayerAction.Sleep, null, onDone);
  }

  /** Drives the blend from a named state instead of a measured speed. */
  setMovementState(state: MovementState): void {
    const c = this.config;
    const speed: Partial<Record<MovementState, number>> = {
      [MovementState.Idle]: 0,
      [MovementState.Walk]: c.walkSpeed,
      [MovementState.FastWalk]: c.fastWalkSpeed,
      [MovementState.Run]: c.runSpeed,
      [MovementState.Sneak]: c.crouchSpeed,
    };
    const target = speed[state];
    if (target === undefined) return;
    this.commanded = { speed: target, crouched: state === MovementState.Sneak };
  }

  /**
   * A step round on the spot, for a turn too big to make by rotating. `radians` is signed: the
   * way the character is about to turn.
   */
  turnInPlace(radians: number): void {
    if (this.turnStepFor > 0) return;
    const action = radians > 0 ? this.turnStepLeft : this.turnStepRight;
    if (!action) return;
    this.turnStep = action;
    this.turnStepFor = action.getClip().duration;
    action.reset();
    action.setLoop(LoopOnce, 1);
    action.setEffectiveWeight(0);
    action.play();
  }

  /** The per-frame call: a real speed, whether the character is crouching, and whether airborne. */
  updateMovementAnimation(dt: number, speed: number, crouched: boolean, airborne = false): void {
    this.update(dt, speed, crouched, airborne);
  }

  update(dt: number, speed: number, crouched: boolean, airborne = false): void {
    const c = this.config;
    if (this.commanded) {
      speed = this.commanded.speed;
      crouched = this.commanded.crouched;
      airborne = false;
    }
    const k = 1 - Math.exp(-dt / Math.max(c.blendTime, 1e-3));
    this.crouchWeight += ((crouched ? 1 : 0) - this.crouchWeight) * (1 - Math.exp(-dt / 0.12));
    // Quick off the ground, softer back onto it: a landing should settle, not snap.
    this.airWeight += ((airborne ? 1 : 0) - this.airWeight) * (1 - Math.exp(-dt / (airborne ? 0.07 : 0.12)));
    this.actionWeight += ((this.running ? 1 : 0) - this.actionWeight) * (1 - Math.exp(-dt / c.actionFadeTime));
    const seated = this.posture !== Posture.Standing;
    this.postureWeight += ((seated ? 1 : 0) - this.postureWeight) * (1 - Math.exp(-dt / (seated ? 0.14 : 0.22)));
    if (!seated && this.postureWeight < 0.002 && this.postureAction) {
      this.postureAction.setEffectiveWeight(0).stop();
      this.postureAction = null;
    }
    this.postureShare = Math.min(1, this.postureShare + dt / 0.25);
    this.postureAction?.setEffectiveWeight(this.postureWeight * this.postureShare);
    if (this.posturePrev) {
      this.posturePrev.setEffectiveWeight(this.postureWeight * (1 - this.postureShare));
      if (this.postureShare >= 1) {
        this.posturePrev.stop();
        this.posturePrev = null;
      }
    }
    const landing = this.burstWeight(this.jumpLand, dt);
    const pushing = this.burstWeight(this.jumpStart, dt);
    if (this.jumpLand && this.jumpLand.left <= 0) this.jumpLand = null;
    if (this.jumpStart && this.jumpStart.left <= 0) this.jumpStart = null;
    this.state = stateFor(c, speed, crouched, this.running, this.posture, airborne, pushing > 0.05, landing > 0.05);

    const free = (1 - this.actionWeight) * (1 - this.postureWeight);
    const onFoot = free * (1 - this.airWeight) * (1 - landing);
    this.jumpLandAction?.setEffectiveWeight(free * (1 - this.airWeight) * landing);
    this.jumpStartAction?.setEffectiveWeight(free * this.airWeight * pushing);

    const gait = [0, c.slowWalkSpeed, c.walkSpeed, c.fastWalkSpeed, c.runSpeed];
    const crouchGait = [0, c.crouchSpeed];
    const locoBlend = blendWeights(speed, gait);
    const crouchBlend = blendWeights(speed, crouchGait);
    this.drive(this.loco, locoBlend, (1 - this.crouchWeight) * onFoot, k);
    this.drive(this.crouch, crouchBlend, this.crouchWeight * onFoot, k);
    this.drive([this.air], [1], this.airWeight * free * (1 - pushing), k);

    // The rate comes from the blend that is playing, so the feet match the ground at every speed
    // and not only at the four the clips were made for.
    const locoRate = strideRate(speed, locoBlend, this.nativeLoco, c.minMotionSpeed, c.maxMotionSpeed);
    const crouchRate = strideRate(speed, crouchBlend, this.nativeCrouch, c.minMotionSpeed, c.maxMotionSpeed);
    for (let i = 1; i < this.loco.length; i++) this.loco[i]?.setEffectiveTimeScale(this.nativeLoco[i] ? locoRate : 1);
    this.crouch[1]?.setEffectiveTimeScale(this.nativeCrouch[1] ? crouchRate : 1);
    syncPhase(this.loco.slice(1));

    this.tickOverlays(dt, speed, free);
    this.tickAction(dt);
    this.mixer.update(dt);
  }

  /**
   * The two things that play over the locomotion: an occasional glance about while standing
   * still, and the step the body takes when the character turns on the spot. Both are faded in
   * and out rather than switched, and both give way instantly to a real action.
   */
  private tickOverlays(dt: number, speed: number, free: number): void {
    const c = this.config;
    // A look about, now and then, for a player who has stopped to think.
    if (speed <= c.idleThreshold && free > 0.9) this.idleFor += dt;
    else this.idleFor = 0;
    const looking = this.idleLook?.isRunning() && this.idleLook.time < this.idleLook.getClip().duration - 0.2;
    if (this.idleLook && this.idleFor > c.idleVariationSeconds && !looking) {
      this.idleFor = 0;
      this.idleLook.reset();
      this.idleLook.setLoop(LoopOnce, 1);
      this.idleLook.play();
    }
    // Kept below full weight: it colours the idle, it does not replace it.
    const wantLook = looking ? 0.75 * free : 0;
    this.idleLookWeight += (wantLook - this.idleLookWeight) * (1 - Math.exp(-dt / 0.35));
    this.idleLook?.setEffectiveWeight(this.idleLookWeight);

    if (this.turnStepFor > 0) {
      this.turnStepFor -= dt;
      const step = this.turnStep;
      if (step) {
        // In over the first third, out over the last: a step, not a pose.
        const left = this.turnStepFor / Math.max(step.getClip().duration, 1e-3);
        const shape = Math.min(1, Math.min(left * 3, (1 - left) * 3));
        step.setEffectiveWeight(Math.max(0, shape) * 0.85 * free);
      }
      if (this.turnStepFor <= 0) {
        this.turnStep?.setEffectiveWeight(0);
        this.turnStep?.stop();
        this.turnStep = null;
      }
    }
  }

  /** A clip that plays on top of the blend rather than inside it. */
  private overlay(name: string): AnimationAction | null {
    const clip = this.clips.get(name);
    if (!clip) return null;
    const a = this.mixer.clipAction(clip);
    a.setLoop(LoopOnce, 1);
    a.clampWhenFinished = true;
    a.setEffectiveWeight(0);
    return a;
  }

  /** Stops driving the blend from a named state and goes back to following real speed. */
  followSpeed(): void {
    this.commanded = null;
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

/** Which node of the state machine a speed (and what the character is doing) amounts to. */
function stateFor(
  c: PlayerConfig,
  speed: number,
  crouched: boolean,
  action: RunningAction | null,
  posture: Posture,
  airborne: boolean,
  pushing: boolean,
  landing: boolean,
): MovementState {
  switch (posture) {
    case Posture.Sitting:
      return MovementState.Sit;
    case Posture.Sleeping:
      return MovementState.Sleep;
    case Posture.StandingUp:
    case Posture.Waking:
      return MovementState.GetUp;
    case Posture.SittingDown:
    case Posture.LyingDown:
      return MovementState.Transition;
    default:
      break;
  }
  if (action) {
    const name = action.action?.getClip().name;
    if (name === PlayerAction.Pickup) return MovementState.Pickup;
    if (name === PlayerAction.Celebrate) return MovementState.Celebrate;
    return MovementState.Interact;
  }
  if (pushing) return MovementState.JumpStart;
  if (airborne) return MovementState.JumpLoop;
  if (landing) return MovementState.JumpLand;
  if (crouched) return MovementState.Sneak;
  if (speed <= c.idleThreshold) return MovementState.Idle;
  if (speed > (c.fastWalkSpeed + c.runSpeed) / 2) return MovementState.Run;
  if (speed > (c.walkSpeed + c.fastWalkSpeed) / 2) return MovementState.FastWalk;
  return MovementState.Walk;
}
