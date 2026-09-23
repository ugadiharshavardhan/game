/**
 * Pure locomotion maths — no Three.js, no physics — so it is unit-testable.
 */
import type { PlayerConfig } from '../config/playerConfig';
import { PlayerStateId } from './PlayerState';

export interface MoveIntent {
  /** 0..1 stick deflection (a key is always 1). */
  magnitude: number;
  run: boolean;
  slow: boolean;
  crouched: boolean;
  /** A thumb or a stick rather than a key: how far it is pushed chooses the gait. */
  analogue?: boolean;
}

/** Past this much deflection a stick is asking for a walk; past the second, a fast walk. */
const STICK_WALK = 0.45;
const STICK_FAST = 0.9;

/**
 * Gait priority: crouch > run > slow walk > the pace the stick is asking for.
 *
 * A key is a switch, so it walks (and runs with Shift). A stick is not: a thumb barely off centre
 * strolls, half-way walks, and pushed to the edge it is a fast walk — the pace between a walk and
 * a run, which is also what the player passes through while a key's run is still gathering speed.
 */
export function targetSpeed(c: PlayerConfig, intent: MoveIntent): number {
  const m = Math.min(Math.max(intent.magnitude, 0), 1);
  if (m < 0.01) return 0;
  if (intent.crouched) return c.crouchSpeed * m;
  if (intent.run) return c.runSpeed * m;
  if (intent.slow) return c.slowWalkSpeed * m;
  if (!intent.analogue) return c.walkSpeed * m;
  // A stick: stroll → walk → fast walk, with no step in it anywhere.
  if (m <= STICK_WALK) return c.slowWalkSpeed + ((c.walkSpeed - c.slowWalkSpeed) * m) / STICK_WALK;
  if (m >= STICK_FAST) return c.fastWalkSpeed;
  return c.walkSpeed + ((c.fastWalkSpeed - c.walkSpeed) * (m - STICK_WALK)) / (STICK_FAST - STICK_WALK);
}

/**
 * What a turn costs. Facing the way you are going is free; a right angle or more keeps only
 * `turnSlowdown` of the speed, so a run into a hairpin becomes a decelerating arc rather than a
 * pivot on the spot. `angleError` is radians between facing and the way the player is asking for.
 */
export function turnSpeedFactor(c: PlayerConfig, angleError: number): number {
  const t = Math.min(Math.abs(angleError) / (Math.PI / 2), 1);
  return 1 - (1 - c.turnSlowdown) * t * t;
}

/** Eases speed toward the target with separate acceleration and deceleration, never overshooting. */
export function stepSpeed(
  current: number,
  target: number,
  acceleration: number,
  deceleration: number,
  dt: number,
): number {
  const rate = target > current ? acceleration : deceleration;
  const delta = target - current;
  const step = rate * dt;
  return Math.abs(delta) <= step ? target : current + Math.sign(delta) * step;
}

export function deriveLocomotionState(
  c: PlayerConfig,
  planarSpeed: number,
  crouched: boolean,
  airborne = false,
): PlayerStateId {
  // Feet off the ground beats everything: whatever the legs were doing, they are not doing it now.
  if (airborne) return PlayerStateId.Jumping;
  if (crouched) return PlayerStateId.Sneaking;
  // The bands are set between the gaits, so a speed that is on its way from one to the next reads
  // as whichever it is nearer — including the fast walk a key's run passes through.
  if (planarSpeed > (c.fastWalkSpeed + c.runSpeed) / 2) return PlayerStateId.Running;
  if (planarSpeed > (c.walkSpeed + c.fastWalkSpeed) / 2) return PlayerStateId.FastWalking;
  return planarSpeed > c.idleThreshold ? PlayerStateId.Walking : PlayerStateId.Idle;
}

/**
 * Whether this frame is a launch.
 *
 * Two forgivenesses, both standard and both the reason a jump feels like it obeys you:
 * *coyote time* lets a jump pressed just after walking off an edge still count, and the *buffer*
 * lets a jump pressed just before landing fire the moment the feet touch down.
 *
 * @param sinceGrounded seconds since the player last stood on something (0 while standing).
 * @param sincePressed seconds since the jump button was last pressed (Infinity if never).
 */
export function shouldJump(c: PlayerConfig, sinceGrounded: number, sincePressed: number): boolean {
  return sinceGrounded <= c.coyoteTime && sincePressed <= c.jumpBufferTime;
}

/**
 * Blend weights for clips placed at `thresholds` (ascending) given `value` —
 * a 1D blend tree. Weights sum to 1; at most two neighbours are non-zero.
 */
export function blendWeights(value: number, thresholds: readonly number[]): number[] {
  const w = thresholds.map(() => 0);
  const last = thresholds.length - 1;
  if (value <= thresholds[0]) w[0] = 1;
  else if (value >= thresholds[last]) w[last] = 1;
  else {
    let i = 0;
    while (value > thresholds[i + 1]) i++;
    const t = (value - thresholds[i]) / (thresholds[i + 1] - thresholds[i]);
    w[i] = 1 - t;
    w[i + 1] = t;
  }
  return w;
}

/**
 * Playback rate that keeps the feet planted, worked out from the blend that is actually playing.
 *
 * The blend is a mixture of two clips, and what the feet do is the *weighted* mixture of their
 * strides — so the rate is the ground speed divided by that mixture, not by an approximation
 * along the gait axis. This is the whole of the anti-skating mechanism, and it is exact wherever
 * the clamp is not biting.
 */
export function strideRate(
  speed: number,
  weights: readonly number[],
  nativeSpeeds: readonly number[],
  min: number,
  max: number,
): number {
  if (speed <= 0.01) return 1;
  let stride = 0;
  for (let i = 0; i < weights.length; i++) stride += weights[i] * (nativeSpeeds[i] ?? 0);
  return stride <= 0.01 ? 1 : Math.min(Math.max(speed / stride, min), max);
}

/**
 * Playback-rate multiplier along the gait axis. Kept for the blend-free case (a single clip) and
 * because the level tests read it; `strideRate` is what the character actually plays at.
 */
export function motionSpeedMultiplier(
  speed: number,
  gaitSpeeds: readonly number[],
  nativeSpeeds: readonly number[],
  min: number,
  max: number,
): number {
  if (speed <= 0.01) return 1;
  const last = gaitSpeeds.length - 1;
  let native: number;
  if (speed >= gaitSpeeds[last]) native = nativeSpeeds[last];
  else {
    let i = 0;
    while (speed > gaitSpeeds[i + 1]) i++;
    const t = (speed - gaitSpeeds[i]) / (gaitSpeeds[i + 1] - gaitSpeeds[i]);
    // Idle → first gait: the first moving clip carries all the motion, so the ratio is constant.
    native = i === 0 ? (nativeSpeeds[1] * speed) / gaitSpeeds[1] : nativeSpeeds[i] + (nativeSpeeds[i + 1] - nativeSpeeds[i]) * t;
  }
  return native <= 0.01 ? 1 : Math.min(Math.max(speed / native, min), max);
}

/** Critically-damped smoothing of an angle (radians) — the same curve as Unity's SmoothDampAngle. */
export function smoothDampAngle(
  current: number,
  target: number,
  velocity: { value: number },
  smoothTime: number,
  dt: number,
): number {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return smoothDamp(current, current + delta, velocity, smoothTime, dt);
}

export function smoothDamp(
  current: number,
  target: number,
  velocity: { value: number },
  smoothTime: number,
  dt: number,
): number {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity.value + omega * change) * dt;
  velocity.value = (velocity.value - omega * temp) * exp;
  let output = target + (change + temp) * exp;
  if (target - current > 0 === output > target) {
    output = target;
    velocity.value = (output - target) / dt;
  }
  return output;
}
