import { describe, expect, it } from 'vitest';
import { smoothDamp } from '../player/locomotion';
import { type CameraConfig, DEFAULT_CAMERA_CONFIG as C, validateCameraConfig } from './CameraConfig';
import {
  computeFraming,
  fovForAspect,
  pitchDistanceScale,
  playerFade,
  resolveBoom,
  stickCurve,
  stickRamp,
  wrapAngle,
} from './cameraMath';

const DEG = Math.PI / 180;
const none = { run: 0, sneak: 0 };

describe('CameraConfig', () => {
  it('defaults are valid', () => expect(validateCameraConfig(C)).toEqual([]));
  it.each<[string, Partial<CameraConfig>]>([
    ['inverted pitch limits', { pitchMinDeg: 40, pitchMaxDeg: 10 }],
    ['gimbal-flipping pitch', { pitchMaxDeg: 95 }],
    ['default distance outside zoom range', { distance: 9 }],
    ['near plane too far for the collision sphere', { nearPlane: 0.3 }],
    ['sneak pivot at the ground', { sneak: { ...C.sneak, heightOffset: -1.4 } }],
    ['fade that never fades', { playerFadeEnd: 1, playerFadeStart: 0.5 }],
    ['negative damping', { followDampingXZ: -0.1 }],
    ['sub-linear stick curve', { stickResponseCurve: 0.5 }],
  ])('rejects %s', (_, patch) => expect(validateCameraConfig({ ...C, ...patch })).not.toEqual([]));
});

describe('framing', () => {
  it('default pitch, no gait: exactly the configured rig', () => {
    const f = computeFraming(C, C.distance, C.defaultPitchDeg * DEG, none);
    expect(f.distance).toBeCloseTo(C.distance);
    expect(f.height).toBeCloseTo(C.pivotHeight);
    expect(f.fov).toBeCloseTo(C.fov);
  });

  it('running pulls back and widens the FOV, subtly', () => {
    const f = computeFraming(C, C.distance, C.defaultPitchDeg * DEG, { run: 1, sneak: 0 });
    expect(f.distance).toBeGreaterThan(C.distance);
    expect(f.distance - C.distance).toBeLessThan(0.8); // a nudge, not a lurch
    expect(f.fov).toBeGreaterThan(C.fov);
    expect(f.fov - C.fov).toBeLessThanOrEqual(8);
  });

  it('sneaking moves closer and lower', () => {
    const f = computeFraming(C, C.distance, C.defaultPitchDeg * DEG, { run: 0, sneak: 1 });
    expect(f.distance).toBeLessThan(C.distance);
    expect(f.height).toBeLessThan(C.pivotHeight);
  });

  it('half-blended gait gives half the offset', () => {
    const f = computeFraming(C, C.distance, C.defaultPitchDeg * DEG, { run: 0.5, sneak: 0 });
    expect(f.distance).toBeCloseTo(C.distance + C.run.distanceOffset / 2);
  });

  it('boom length never collapses, even at min zoom while sneaking', () =>
    expect(computeFraming(C, C.zoomMin, C.pitchMinDeg * DEG, { run: 0, sneak: 1 }).distance).toBeGreaterThanOrEqual(0.3));
});

describe('fovForAspect', () => {
  const hfov = (vfov: number, aspect: number) => (2 * Math.atan(Math.tan((vfov * DEG) / 2) * aspect)) / DEG;
  it('leaves landscape screens alone', () => expect(fovForAspect(C, C.fov, 16 / 9)).toBeCloseTo(C.fov));
  it('widens a portrait phone until the minimum horizontal FOV fits', () => {
    const v = fovForAspect(C, C.fov, 390 / 844);
    expect(v).toBeGreaterThan(C.fov);
    expect(hfov(v, 390 / 844)).toBeCloseTo(C.minHorizontalFov, 0);
  });
  it('keeps the run push on top of the widened base, within the cap', () => {
    const walk = fovForAspect(C, C.fov, 0.6);
    const run = fovForAspect(C, C.fov + C.run.fovOffset, 0.6);
    expect(run - walk).toBeCloseTo(Math.min(C.run.fovOffset, C.maxFov - walk));
    expect(fovForAspect(C, C.fov + C.run.fovOffset, 0.2)).toBeLessThanOrEqual(C.maxFov);
  });
});

describe('pitchDistanceScale (FreeLook rigs)', () => {
  it('is 1 at the default pitch', () => expect(pitchDistanceScale(C, C.defaultPitchDeg * DEG)).toBeCloseTo(1));
  it('hits the low and high rig scales at the limits', () => {
    expect(pitchDistanceScale(C, C.pitchMinDeg * DEG)).toBeCloseTo(C.lowAngleDistanceScale);
    expect(pitchDistanceScale(C, C.pitchMaxDeg * DEG)).toBeCloseTo(C.highAngleDistanceScale);
  });
  it('is monotonic across the whole range (no bumps when sweeping pitch)', () => {
    let prev = -Infinity;
    for (let p = C.pitchMinDeg; p <= C.pitchMaxDeg; p += 0.5) {
      const s = pitchDistanceScale(C, p * DEG);
      expect(s).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s;
    }
  });
});

describe('stick', () => {
  it('curve keeps full deflection at full rate', () => expect(stickCurve(1, 0, 2).x).toBeCloseTo(1));
  it('curve gives precision near the centre', () => expect(stickCurve(0.3, 0, 2).x).toBeCloseTo(0.09));
  it('diagonals are not faster than cardinals', () => {
    const d = stickCurve(Math.SQRT1_2, Math.SQRT1_2, 1.8);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
  });
  it('ramp starts at 60% and reaches full speed', () => {
    expect(stickRamp(0, 0.3)).toBeCloseTo(0.6);
    expect(stickRamp(0.3, 0.3)).toBeCloseTo(1);
    expect(stickRamp(5, 0)).toBe(1);
  });
});

describe('resolveBoom', () => {
  it('pulls in instantly when pull-in time is 0', () => {
    const v = { value: 0 };
    expect(resolveBoom(3.4, 1.1, v, 0, 0.4, 1 / 60, smoothDamp)).toBe(1.1);
  });
  it('eases back out rather than snapping', () => {
    const v = { value: 0 };
    const next = resolveBoom(1.1, 3.4, v, 0, 0.4, 1 / 60, smoothDamp);
    expect(next).toBeGreaterThan(1.1);
    expect(next).toBeLessThan(3.4);
  });
  it('never exceeds what the collision allows, whatever the smoothing', () => {
    const v = { value: 50 }; // absurd outward velocity left over from a previous frame
    for (const allowed of [0, 0.4, 1, 2.5]) expect(resolveBoom(3, allowed, v, 0.2, 0.4, 1 / 30, smoothDamp)).toBeLessThanOrEqual(allowed);
  });
});

describe('playerFade', () => {
  it('opaque at normal distances, hidden inside the head', () => {
    expect(playerFade(C, 3)).toBe(1);
    expect(playerFade(C, C.playerFadeEnd - 0.1)).toBe(0);
    const mid = playerFade(C, (C.playerFadeStart + C.playerFadeEnd) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('wrapAngle', () => {
  it.each([0, 1, -1, Math.PI - 0.01, 7, -7, 100])('%f stays equivalent and inside (-π, π]', (a) => {
    const w = wrapAngle(a);
    expect(w).toBeGreaterThan(-Math.PI - 1e-9);
    expect(w).toBeLessThanOrEqual(Math.PI + 1e-9);
    expect(Math.cos(w)).toBeCloseTo(Math.cos(a));
    expect(Math.sin(w)).toBeCloseTo(Math.sin(a));
  });
});
