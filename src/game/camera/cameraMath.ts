/**
 * Pure camera maths — no scene, no physics — so the feel can be unit-tested exactly.
 */
import type { CameraConfig } from './CameraConfig';

const DEG = Math.PI / 180;

export interface Framing {
  distance: number;
  height: number;
  fov: number;
}

/** Blend weights, each 0..1. */
export interface GaitWeights {
  run: number;
  sneak: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Boom length multiplier for a pitch — the FreeLook "three rigs" in one curve.
 * At the default pitch it is 1. Looking up (camera low) it shrinks, so the camera doesn't dig into
 * the ground; looking down (camera high) it grows a little, showing more of the street.
 */
export function pitchDistanceScale(c: CameraConfig, pitch: number): number {
  const p = pitch / DEG;
  if (p <= c.defaultPitchDeg) {
    const t = (c.defaultPitchDeg - p) / Math.max(c.defaultPitchDeg - c.pitchMinDeg, 1e-3);
    return 1 + (c.lowAngleDistanceScale - 1) * smoothstep01(t);
  }
  const t = (p - c.defaultPitchDeg) / Math.max(c.pitchMaxDeg - c.defaultPitchDeg, 1e-3);
  return 1 + (c.highAngleDistanceScale - 1) * smoothstep01(t);
}

/** Target boom length, pivot height and FOV for the current zoom, pitch and gait blend. */
export function computeFraming(c: CameraConfig, zoomDistance: number, pitch: number, gait: GaitWeights): Framing {
  const distance =
    zoomDistance * pitchDistanceScale(c, pitch) + c.run.distanceOffset * gait.run + c.sneak.distanceOffset * gait.sneak;
  return {
    distance: Math.max(distance, 0.3),
    height: c.pivotHeight + c.run.heightOffset * gait.run + c.sneak.heightOffset * gait.sneak,
    fov: c.fov + c.run.fovOffset * gait.run + c.sneak.fovOffset * gait.sneak,
  };
}

/**
 * Stick deflection → rate multiplier. Radial so diagonals aren't faster, with an exponent that
 * gives precision near the centre, as in most modern console games.
 */
export function stickCurve(x: number, y: number, exponent: number): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < 1e-6) return { x: 0, y: 0 };
  const shaped = Math.pow(Math.min(m, 1), exponent);
  return { x: (x / m) * shaped, y: (y / m) * shaped };
}

/**
 * Turn-speed ramp: a full stick deflection starts at 60% speed and reaches 100% after `rampTime`.
 * Small corrections stay slow and precise; a held flick turns quickly. `heldTime` is how long the
 * stick has been past 90% deflection.
 */
export function stickRamp(heldTime: number, rampTime: number): number {
  if (rampTime <= 0) return 1;
  return 0.6 + 0.4 * smoothstep01(heldTime / rampTime);
}

export function wrapAngle(a: number): number {
  let x = (a + Math.PI) % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x - Math.PI;
}

/**
 * Boom length after collision. Pulls in (instantly by default) the moment something intrudes,
 * eases out when it clears, and never exceeds `allowed` — so whatever the smoothing, the camera
 * is never placed inside geometry.
 */
export function resolveBoom(
  current: number,
  allowed: number,
  velocity: { value: number },
  pullInTime: number,
  recoverTime: number,
  dt: number,
  damp: (cur: number, target: number, vel: { value: number }, time: number, dt: number) => number,
): number {
  let next: number;
  if (allowed < current) {
    next = pullInTime <= 0 ? allowed : damp(current, allowed, velocity, pullInTime, dt);
    if (pullInTime <= 0) velocity.value = 0;
  } else {
    next = recoverTime <= 0 ? allowed : damp(current, allowed, velocity, recoverTime, dt);
  }
  return Math.min(next, allowed);
}

/** Player opacity for a camera this close to the pivot: 1 far away, 0 when the camera is in the head. */
export function playerFade(c: CameraConfig, cameraToPivot: number): number {
  return smoothstep01((cameraToPivot - c.playerFadeEnd) / Math.max(c.playerFadeStart - c.playerFadeEnd, 1e-3));
}

/**
 * Vertical FOV for this aspect ratio: the configured framing FOV, widened on narrow screens so at
 * least `minHorizontalFov` shows across (gait offsets stay on top), capped at `maxFov`.
 */
export function fovForAspect(c: CameraConfig, framingFov: number, aspect: number): number {
  const needed = (2 * Math.atan(Math.tan((c.minHorizontalFov * DEG) / 2) / Math.max(aspect, 0.1))) / DEG;
  const base = Math.max(c.fov, needed);
  return Math.min(base + (framingFov - c.fov), c.maxFov);
}
