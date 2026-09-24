import { describe, expect, it } from 'vitest';
import type { NightPhase } from '../../shared/types';
import { DEFAULT_NIGHT_CONFIG, NightClock, NIGHT_BASE } from './NightClock';

const run = (c: NightClock, seconds: number, dt = 0.05) => {
  for (let t = 0; t < seconds; t += dt) c.update(dt);
};

describe('NightClock', () => {
  it('opens at 19:00 and ends at 05:00', () => {
    const c = new NightClock();
    expect(c.label).toBe('7:00 PM');
    run(c, DEFAULT_NIGHT_CONFIG.seconds + 1);
    expect(c.label).toBe('5:00 AM');
    expect(c.t).toBe(1);
  });

  it('walks evening, then night, then dawn, once each and in that order', () => {
    const c = new NightClock();
    const seen: NightPhase[] = [c.phase];
    for (let t = 0; t < DEFAULT_NIGHT_CONFIG.seconds; t += 0.5) {
      c.update(0.5);
      if (c.phase !== seen[seen.length - 1]) seen.push(c.phase);
    }
    expect(seen).toEqual(['evening', 'night', 'dawn']);
  });

  it('reads midnight halfway through the night', () => {
    const c = new NightClock();
    // 19:00 to 00:00 is 5.0 of the night's 10 hours.
    run(c, DEFAULT_NIGHT_CONFIG.seconds * (5 / 10));
    expect(c.label).toBe('12:00 AM');
  });

  it('never lets the moon rise in the evening, nor again once dawn has come', () => {
    const c = new NightClock();
    expect(c.phase).toBe('evening');
    expect(c.moonMayRise).toBe(false);
    expect(c.moonTicking).toBe(false);

    c.windForward(DEFAULT_NIGHT_CONFIG.seconds * 0.5);
    expect(c.phase).toBe('night');
    expect(c.moonMayRise).toBe(true);
    expect(c.moonTicking).toBe(true);

    c.windForward(DEFAULT_NIGHT_CONFIG.seconds * 0.45);
    expect(c.phase).toBe('dawn');
    expect(c.moonMayRise, 'the moon is retired for good at dawn').toBe(false);
    // It still ticks, so a moon caught out by dawn can fade away rather than snap off.
    expect(c.moonTicking).toBe(true);
  });

  it('darkens through the evening, holds all night, and lifts at dawn', () => {
    const c = new NightClock();
    expect(c.nightBase, 'sunset').toBe(0);

    c.windForward(DEFAULT_NIGHT_CONFIG.seconds * DEFAULT_NIGHT_CONFIG.evening);
    expect(c.nightBase, 'lamps are lit by the end of the evening').toBeCloseTo(NIGHT_BASE, 2);
    expect(c.dawnBlend).toBe(0);

    c.windForward(DEFAULT_NIGHT_CONFIG.seconds * 0.4);
    expect(c.nightBase, 'the small hours are as dark as the evening left them').toBeCloseTo(NIGHT_BASE, 2);
    expect(c.dawnBlend).toBe(0);

    c.windForward(DEFAULT_NIGHT_CONFIG.seconds);
    expect(c.nightBase, 'the sky lifts by 05:00').toBeLessThan(NIGHT_BASE);
    expect(c.dawnBlend).toBe(1);
  });

  it('ends the run at 05:00, and not before', () => {
    const c = new NightClock();
    run(c, DEFAULT_NIGHT_CONFIG.seconds - 5);
    expect(c.done).toBe(false);
    run(c, 6);
    expect(c.done).toBe(true);
  });

  it('never ends a night that is not allowed to end (the tutorial)', () => {
    const c = new NightClock({ ...DEFAULT_NIGHT_CONFIG, ends: false });
    run(c, DEFAULT_NIGHT_CONFIG.seconds * 2, 1);
    expect(c.done).toBe(false);
    expect(c.t).toBe(1);
  });

  it('winds forward to the same place a played night would reach', () => {
    const played = new NightClock();
    const wound = new NightClock();
    run(played, 400);
    wound.windForward(400);
    expect(wound.t).toBeCloseTo(played.t, 6);
    expect(wound.phase).toBe(played.phase);
    expect(wound.label).toBe(played.label);
  });

  it('counts the in-game minutes left to 05:00', () => {
    const c = new NightClock();
    expect(c.minutesLeft).toBe(600); // 19:00 to 05:00
    c.windForward(DEFAULT_NIGHT_CONFIG.seconds / 2);
    expect(c.minutesLeft).toBe(300);
    c.windForward(DEFAULT_NIGHT_CONFIG.seconds);
    expect(c.minutesLeft).toBe(0);
  });
});
