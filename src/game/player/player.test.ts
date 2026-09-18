import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYER_CONFIG as C, validatePlayerConfig } from '../config/playerConfig';
import {
  blendWeights,
  deriveLocomotionState,
  motionSpeedMultiplier,
  smoothDampAngle,
  stepSpeed,
  targetSpeed,
} from './locomotion';
import { PlayerState, PlayerStateId } from './PlayerState';

const intent = (magnitude: number, run = false, slow = false, crouched = false) => ({ magnitude, run, slow, crouched });

describe('PlayerConfig', () => {
  it('defaults are valid', () => expect(validatePlayerConfig(C)).toEqual([]));
  it('rejects crouch taller than stand', () =>
    expect(validatePlayerConfig({ ...C, crouchHeight: C.standHeight })).not.toEqual([]));
  it('rejects non-increasing gait speeds', () =>
    expect(validatePlayerConfig({ ...C, runSpeed: C.walkSpeed - 0.1 })).not.toEqual([]));
  it('rejects negative speed', () => expect(validatePlayerConfig({ ...C, crouchSpeed: -1 })).not.toEqual([]));
});

describe('targetSpeed', () => {
  it('no input is zero', () => expect(targetSpeed(C, intent(0, true))).toBe(0));
  it('full input walks', () => expect(targetSpeed(C, intent(1))).toBeCloseTo(C.walkSpeed));
  it('run held runs', () => expect(targetSpeed(C, intent(1, true))).toBeCloseTo(C.runSpeed));
  it('slow walk beats walk', () => expect(targetSpeed(C, intent(1, false, true))).toBeCloseTo(C.slowWalkSpeed));
  it('run beats slow walk', () => expect(targetSpeed(C, intent(1, true, true))).toBeCloseTo(C.runSpeed));
  it('crouch overrides run', () => expect(targetSpeed(C, intent(1, true, false, true))).toBeCloseTo(C.crouchSpeed));
  it('half stick is half speed', () => expect(targetSpeed(C, intent(0.5))).toBeCloseTo(C.walkSpeed / 2));
});

describe('stepSpeed', () => {
  it('accelerates without overshoot', () => {
    expect(stepSpeed(0, 2, 10, 14, 0.1)).toBeCloseTo(1);
    expect(stepSpeed(1.9, 2, 10, 14, 0.1)).toBeCloseTo(2);
  });
  it('decelerates with the deceleration rate', () => expect(stepSpeed(2, 0, 10, 14, 0.1)).toBeCloseTo(0.6));
});

describe('deriveLocomotionState', () => {
  it.each([
    [0, false, PlayerStateId.Idle],
    [1, false, PlayerStateId.Walking],
    [2.2, false, PlayerStateId.Walking],
    [4, false, PlayerStateId.Running],
    [0, true, PlayerStateId.Sneaking],
    [1.4, true, PlayerStateId.Sneaking],
  ])('speed %f crouched %s → %s', (speed, crouched, expected) =>
    expect(deriveLocomotionState(C, speed, crouched)).toBe(expected));
});

describe('blendWeights', () => {
  const t = [0, 1.2, 2.2, 5];
  it('clamps below and above', () => {
    expect(blendWeights(-1, t)).toEqual([1, 0, 0, 0]);
    expect(blendWeights(9, t)).toEqual([0, 0, 0, 1]);
  });
  it('interpolates two neighbours', () => {
    const w = blendWeights(3.6, t);
    expect(w[2]).toBeCloseTo(0.5);
    expect(w[3]).toBeCloseTo(0.5);
    expect(w.reduce((a, b) => a + b)).toBeCloseTo(1);
  });
});

describe('motionSpeedMultiplier', () => {
  const gait = [0, 1.2, 2.2, 5];
  const native = [0, 1.0, 1.6, 4];
  it('walk clip alone', () => expect(motionSpeedMultiplier(2.2, gait, native, 0.5, 2)).toBeCloseTo(2.2 / 1.6));
  it('between walk and run', () => expect(motionSpeedMultiplier(3.6, gait, native, 0.5, 2)).toBeCloseTo(3.6 / 2.8));
  it('clamps', () => expect(motionSpeedMultiplier(5, gait, [0, 1, 1, 1], 0.7, 1.3)).toBeCloseTo(1.3));
  it('idle plays at normal rate', () => expect(motionSpeedMultiplier(0, gait, native, 0.7, 1.3)).toBe(1));
});

describe('smoothDampAngle', () => {
  it('takes the short way round and converges', () => {
    const v = { value: 0 };
    let a = Math.PI * 0.9;
    const target = -Math.PI * 0.9; // 0.2π away across the wrap
    const first = smoothDampAngle(a, target, v, 0.1, 1 / 60);
    expect(first).toBeGreaterThan(a); // moved forward through π, not backward
    for (let i = 0; i < 120; i++) a = smoothDampAngle(a, target, v, 0.1, 1 / 60);
    expect(Math.cos(a - target)).toBeCloseTo(1, 3);
  });
});

describe('PlayerState', () => {
  it('starts idle and unlocked', () => {
    const s = new PlayerState();
    expect(s.value).toBe(PlayerStateId.Idle);
    expect(s.isLocked).toBe(false);
  });
  it('fires change only on change', () => {
    const s = new PlayerState();
    let calls = 0;
    s.onChange(() => calls++);
    s.updateLocomotion(PlayerStateId.Walking);
    s.updateLocomotion(PlayerStateId.Walking);
    s.updateLocomotion(PlayerStateId.Running);
    expect(calls).toBe(2);
  });
  it('interaction locks and overrides locomotion', () => {
    const s = new PlayerState();
    s.beginInteraction();
    s.updateLocomotion(PlayerStateId.Running);
    expect(s.value).toBe(PlayerStateId.Interacting);
    expect(s.isLocked).toBe(true);
    s.endInteraction();
    expect(s.value).toBe(PlayerStateId.Idle);
  });
  it('house flow: interacting → hidden → interacting → idle', () => {
    const s = new PlayerState();
    s.beginInteraction();
    s.enterHidden();
    s.endInteraction();
    expect(s.value).toBe(PlayerStateId.Hidden);
    s.beginInteraction();
    expect(s.value).toBe(PlayerStateId.Interacting);
    s.exitHidden();
    s.endInteraction();
    expect(s.value).toBe(PlayerStateId.Idle);
    expect(s.isLocked).toBe(false);
  });
});
