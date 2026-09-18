/**
 * Pure locomotion maths — no Three.js, no physics — so it is unit-testable.
 */
import type { PlayerConfig } from '../config/playerConfig';
import { PlayerStateId } from './PlayerState';

export interface MoveIntent {
  /** 0..1 stick deflection (keyboard is always 1). */
  magnitude: number;
  run: boolean;
  slow: boolean;
  crouched: boolean;
}

/** Gait priority: crouch > run > slow walk > walk. Analog input scales speed continuously. */
export function targetSpeed(c: PlayerConfig, intent: MoveIntent): number {
  const m = Math.min(Math.max(intent.magnitude, 0), 1);
  if (m < 0.01) return 0;
  const gait = intent.crouched
    ? c.crouchSpeed
    : intent.run
      ? c.runSpeed
      : intent.slow
        ? c.slowWalkSpeed
        : c.walkSpeed;
  return gait * m;
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

export function deriveLocomotionState(c: PlayerConfig, planarSpeed: number, crouched: boolean): PlayerStateId {
  if (crouched) return PlayerStateId.Sneaking;
  if (planarSpeed > c.walkSpeed * 1.1) return PlayerStateId.Running;
  return planarSpeed > c.idleThreshold ? PlayerStateId.Walking : PlayerStateId.Idle;
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
 * Playback-rate multiplier that keeps feet planted. Clips sit at gameplay gait speeds in the blend,
 * but each clip's own stride speed differs, so play at speed ÷ blended native speed.
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
