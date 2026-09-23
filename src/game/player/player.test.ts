import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYER_CONFIG as C, validatePlayerConfig } from '../config/playerConfig';
import {
  blendWeights,
  deriveLocomotionState,
  shouldJump,
  motionSpeedMultiplier,
  smoothDampAngle,
  stepSpeed,
  strideRate,
  targetSpeed,
  turnSpeedFactor,
  type MoveIntent,
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
    // Between the gaits, a speed reads as whichever it is nearer.
    [3.3, false, PlayerStateId.FastWalking],
    [4, false, PlayerStateId.FastWalking],
    [4.6, false, PlayerStateId.Running],
    [5, false, PlayerStateId.Running],
    [0, true, PlayerStateId.Sneaking],
    [1.4, true, PlayerStateId.Sneaking],
  ])('speed %f crouched %s → %s', (speed, crouched, expected) =>
    expect(deriveLocomotionState(C, speed, crouched)).toBe(expected));

  it('reads as jumping the whole time the feet are off the ground', () => {
    for (const speed of [0, 1, 4]) {
      for (const crouched of [false, true]) {
        expect(deriveLocomotionState(C, speed, crouched, true)).toBe(PlayerStateId.Jumping);
      }
    }
  });

  it('passes through every gait on the way from standing to a run, in order', () => {
    const seen: PlayerStateId[] = [];
    for (let speed = 0; speed <= C.runSpeed; speed += 0.05) {
      const state = deriveLocomotionState(C, speed, false);
      if (seen[seen.length - 1] !== state) seen.push(state);
    }
    expect(seen).toEqual([PlayerStateId.Idle, PlayerStateId.Walking, PlayerStateId.FastWalking, PlayerStateId.Running]);
  });
});

describe('shouldJump', () => {
  it('jumps when standing and asked', () => {
    expect(shouldJump(C, 0, 0)).toBe(true);
  });

  it('forgives a jump pressed just after walking off an edge', () => {
    expect(shouldJump(C, C.coyoteTime * 0.5, 0), 'inside the coyote window').toBe(true);
    expect(shouldJump(C, C.coyoteTime + 0.05, 0), 'and not outside it').toBe(false);
  });

  it('remembers a jump pressed just before landing', () => {
    expect(shouldJump(C, 0, C.jumpBufferTime * 0.5), 'inside the buffer').toBe(true);
    expect(shouldJump(C, 0, C.jumpBufferTime + 0.05), 'and forgets it after').toBe(false);
  });

  it('never jumps out of mid-air', () => {
    expect(shouldJump(C, 0.5, 0)).toBe(false);
  });

  it('never jumps without being asked', () => {
    expect(shouldJump(C, 0, Infinity)).toBe(false);
  });

  it('clears the plinths and steps the village is built from', () => {
    // Apex of a launch at jumpSpeed under gravity: v^2 / 2g.
    const apex = (C.jumpSpeed * C.jumpSpeed) / (2 * Math.abs(C.gravity));
    expect(apex, 'higher than a step the autostep will not take').toBeGreaterThan(C.stepHeight);
    expect(apex, 'and not so high it reads as a moon jump').toBeLessThan(1.2);
  });
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

describe('the gait a stick is asking for', () => {
  const stick = (magnitude: number, over: Partial<MoveIntent> = {}) =>
    targetSpeed(C, { magnitude, run: false, slow: false, crouched: false, analogue: true, ...over });

  it('strolls, walks and then hurries as the thumb goes further', () => {
    expect(stick(0)).toBe(0);
    expect(stick(0.2)).toBeGreaterThan(0);
    expect(stick(0.2)).toBeLessThan(C.walkSpeed);
    expect(stick(0.45)).toBeCloseTo(C.walkSpeed, 5);
    expect(stick(1)).toBeCloseTo(C.fastWalkSpeed, 5);
    // And nothing in between is a step: the curve only ever goes up.
    let last = -1;
    for (let m = 0; m <= 1.0001; m += 0.02) {
      const speed = stick(m);
      expect(speed, `deflection ${m.toFixed(2)}`).toBeGreaterThanOrEqual(last - 1e-9);
      last = speed;
    }
  });

  it('a key is a switch: it walks, and runs when asked', () => {
    const key = (over: Partial<MoveIntent> = {}) => targetSpeed(C, { magnitude: 1, run: false, slow: false, crouched: false, ...over });
    expect(key()).toBe(C.walkSpeed);
    expect(key({ run: true })).toBe(C.runSpeed);
    expect(key({ slow: true })).toBe(C.slowWalkSpeed);
    expect(key({ crouched: true })).toBe(C.crouchSpeed);
    // Crouching wins over everything: you cannot sprint while sneaking.
    expect(key({ crouched: true, run: true })).toBe(C.crouchSpeed);
  });
});

describe('turning costs speed', () => {
  it('is free ahead, and expensive across', () => {
    expect(turnSpeedFactor(C, 0)).toBe(1);
    expect(turnSpeedFactor(C, Math.PI / 2)).toBeCloseTo(C.turnSlowdown, 5);
    expect(turnSpeedFactor(C, Math.PI)).toBeCloseTo(C.turnSlowdown, 5);
    expect(turnSpeedFactor(C, -Math.PI / 2)).toBeCloseTo(C.turnSlowdown, 5);
  });

  it('falls away smoothly rather than at a threshold', () => {
    let last = 1;
    for (let a = 0; a <= Math.PI; a += 0.05) {
      const f = turnSpeedFactor(C, a);
      expect(f).toBeLessThanOrEqual(last + 1e-9);
      expect(Math.abs(f - last)).toBeLessThan(0.05);
      last = f;
    }
  });

  it('a run into a hairpin arrives at a walk, not a pivot', () => {
    const arc = C.runSpeed * turnSpeedFactor(C, Math.PI);
    expect(arc).toBeLessThan(C.fastWalkSpeed);
    expect(arc).toBeGreaterThan(C.slowWalkSpeed);
  });
});

describe('feet that stay on the ground', () => {
  const gaits = [0, C.slowWalkSpeed, C.walkSpeed, C.fastWalkSpeed, C.runSpeed];

  /** How fast the blended stride actually travels, given the rate the controller plays it at. */
  const strideSpeed = (speed: number, natives: number[]) => {
    const rate = motionSpeedMultiplier(speed, gaits, natives, C.minMotionSpeed, C.maxMotionSpeed);
    const w = blendWeights(speed, gaits);
    return w.reduce((sum, weight, i) => sum + weight * natives[i] * rate, 0);
  };

  it('matches the ground exactly when each clip strides at its own gait', () => {
    const natives = [0, C.slowWalkSpeed, C.walkSpeed, C.fastWalkSpeed, C.runSpeed];
    for (let speed = 0.2; speed <= C.runSpeed; speed += 0.1) {
      const slip = Math.abs(strideSpeed(speed, natives) - speed);
      expect(slip, `at ${speed.toFixed(1)} m/s`).toBeLessThan(0.02);
    }
  });

  it('still barely slips when the clips stride a quarter off their gait', () => {
    // The clip builder measures each stride and picks a cycle length, but it is allowed to be out
    // by up to a quarter before the playback-rate clamp stops compensating. Even then the feet
    // should be within a few centimetres a second of the ground.
    for (const error of [0.75, 1.25]) {
      const natives = gaits.map((g) => g * error);
      for (let speed = 0.4; speed <= C.runSpeed; speed += 0.1) {
        const slip = Math.abs(strideSpeed(speed, natives) - speed);
        expect(slip / speed, `${Math.round(error * 100)}% clips at ${speed.toFixed(1)} m/s`).toBeLessThan(0.06);
      }
    }
  });
});

describe('the rate the stride plays at', () => {
  const gaits = [0, C.slowWalkSpeed, C.walkSpeed, C.fastWalkSpeed, C.runSpeed];

  it('is exact for whatever mixture of clips is playing', () => {
    // Clips that stride at their own gait, but blended at a speed between two of them: the rate
    // has to answer to the mixture, not to the axis.
    const natives = [0, 1.1, 2.4, 3.0, 5.4];
    for (let speed = 0.3; speed <= C.runSpeed; speed += 0.07) {
      const w = blendWeights(speed, gaits);
      const rate = strideRate(speed, w, natives, C.minMotionSpeed, C.maxMotionSpeed);
      const stride = w.reduce((sum, weight, i) => sum + weight * natives[i], 0) * rate;
      expect(Math.abs(stride - speed), `at ${speed.toFixed(2)} m/s`).toBeLessThan(0.02);
    }
  });

  it('never plays so fast or so slow that the legs look wrong', () => {
    const natives = [0, 1.1, 2.4, 3.0, 5.4];
    for (let speed = 0; speed <= C.runSpeed * 1.3; speed += 0.1) {
      const rate = strideRate(speed, blendWeights(speed, gaits), natives, C.minMotionSpeed, C.maxMotionSpeed);
      expect(rate).toBeGreaterThanOrEqual(C.minMotionSpeed);
      expect(rate).toBeLessThanOrEqual(C.maxMotionSpeed);
    }
  });
});
