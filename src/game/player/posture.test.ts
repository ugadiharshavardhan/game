import { describe, expect, it } from 'vitest';
import { Posture, PostureMachine, type PostureContext } from './posture';

const T = { sitDown: 1, standUp: 1, lieDown: 2, wakeUp: 2 };
const OK: PostureContext = { grounded: true, busy: false, roomToLie: true };
const run = (m: PostureMachine, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) m.update(0.05);
};

describe('PostureMachine', () => {
  it('sits down, stays seated, and stands back up through the transitions', () => {
    const m = new PostureMachine(T);
    expect(m.request('sit', OK)).toBeNull();
    expect(m.phase).toBe(Posture.SittingDown);
    expect(m.locksMovement).toBe(true);
    run(m, 1.1);
    expect(m.phase).toBe(Posture.Sitting);
    expect(m.request('stand', OK)).toBeNull();
    expect(m.phase).toBe(Posture.StandingUp);
    run(m, 1.1);
    expect(m.phase).toBe(Posture.Standing);
    expect(m.locksMovement).toBe(false);
  });

  it('lies down to sleep and wakes: lying-down → sleeping → waking → standing', () => {
    const m = new PostureMachine(T);
    const seen: Posture[] = [];
    m.onChange((_, to) => seen.push(to));
    m.request('sleep', OK);
    run(m, 2.1);
    expect(m.phase).toBe(Posture.Sleeping);
    expect(m.isAsleep).toBe(true);
    m.request('wake', OK);
    run(m, 2.1);
    expect(seen).toEqual([Posture.LyingDown, Posture.Sleeping, Posture.Waking, Posture.Standing]);
  });

  it('asleep, only WAKE is heard', () => {
    const m = new PostureMachine(T);
    m.request('sleep', OK);
    run(m, 2.1);
    expect(m.request('sit', OK)).toBe('not-now');
    expect(m.request('stand', OK)).toBe('not-now');
    expect(m.request('sleep', OK)).toBe('not-now');
    expect(m.phase).toBe(Posture.Sleeping);
  });

  it('seated blocks sleep; STAND is the way out', () => {
    const m = new PostureMachine(T);
    m.request('sit', OK);
    run(m, 1.1);
    expect(m.request('sleep', OK)).toBe('not-now');
    expect(m.request('wake', OK)).toBe('not-now');
    expect(m.phase).toBe(Posture.Sitting);
  });

  it('refuses in mid-air, while busy, and where there is no room to lie down', () => {
    const m = new PostureMachine(T);
    expect(m.request('sit', { ...OK, grounded: false })).toBe('airborne');
    expect(m.request('sleep', { ...OK, busy: true })).toBe('busy');
    expect(m.request('sleep', { ...OK, roomToLie: false })).toBe('no-room');
    // Sitting does not need room to lie down.
    expect(m.request('sit', { ...OK, roomToLie: false })).toBeNull();
  });

  it('remembers a STAND pressed on the way down and a WAKE pressed while lying down', () => {
    const m = new PostureMachine(T);
    m.request('sit', OK);
    run(m, 0.3);
    expect(m.request('stand', OK)).toBeNull();
    expect(m.phase).toBe(Posture.SittingDown);
    run(m, 0.8);
    expect(m.phase).toBe(Posture.StandingUp);

    const s = new PostureMachine(T);
    s.request('sleep', OK);
    run(s, 0.5);
    s.request('wake', OK);
    run(s, 1.6);
    expect(s.phase).toBe(Posture.Waking);
  });

  it('toggles', () => {
    const m = new PostureMachine(T);
    m.toggleSit(OK);
    run(m, 1.1);
    m.toggleSit(OK);
    expect(m.phase).toBe(Posture.StandingUp);
    run(m, 1.1);
    m.toggleSleep(OK);
    run(m, 2.1);
    m.toggleSleep(OK);
    expect(m.phase).toBe(Posture.Waking);
  });

  it('follows a teammate: from sitting to sleeping it stands first', () => {
    const m = new PostureMachine(T);
    m.follow('sitting');
    run(m, 1.1);
    expect(m.phase).toBe(Posture.Sitting);
    m.follow('sleeping');
    expect(m.phase).toBe(Posture.StandingUp);
    run(m, 1.1);
    m.follow('sleeping');
    expect(m.phase).toBe(Posture.LyingDown);
    run(m, 2.1);
    m.follow('standing');
    run(m, 2.1);
    expect(m.phase).toBe(Posture.Standing);
  });

  it('reset puts the body straight back on its feet', () => {
    const m = new PostureMachine(T);
    m.request('sleep', OK);
    run(m, 2.1);
    m.reset();
    expect(m.phase).toBe(Posture.Standing);
    expect(m.locksMovement).toBe(false);
  });
});
