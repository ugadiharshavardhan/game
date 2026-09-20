import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPOSURE_CONFIG, moonPressure, type ExposureInput } from '../moon/ExposureSystem';
import { DEFAULT_HEALTH_CONFIG, HealthSystem } from './HealthSystem';

const DT = 1 / 30;

/** Seconds of this input before the system says so. Returns Infinity if it never does. */
function secondsUntil(h: HealthSystem, pressure: number, sheltered: boolean, cap = 300): number {
  for (let t = 0; t < cap; t += DT) {
    if (h.update(DT, { pressure, sheltered })) return t;
  }
  return Infinity;
}

const hold = (h: HealthSystem, seconds: number, pressure: number, sheltered: boolean) => {
  for (let t = 0; t < seconds; t += DT) h.update(DT, { pressure, sheltered });
};

/** The pressure of standing in the open under a full moon, from the exposure config's own maths. */
const outside = (over: Partial<ExposureInput> = {}) =>
  moonPressure(DEFAULT_EXPOSURE_CONFIG, {
    moonRate: 1,
    sheltered: false,
    openGround: true,
    covered: false,
    gait: 'walk',
    shelterDistance: 10,
    ...over,
  });

describe('HealthSystem', () => {
  it('starts whole', () => {
    const h = new HealthSystem();
    expect(h.value).toBe(DEFAULT_HEALTH_CONFIG.max);
    expect(h.level).toBe('well');
    expect(h.draining).toBe(false);
  });

  it('drains under the moon, and the harder the moon the faster', () => {
    const open = new HealthSystem();
    hold(open, 5, outside(), false);
    const covered = new HealthSystem();
    hold(covered, 5, outside({ openGround: false, covered: true }), false);

    expect(open.value).toBeLessThan(DEFAULT_HEALTH_CONFIG.max);
    expect(open.draining).toBe(true);
    expect(covered.value, 'a veranda costs less than open ground').toBeGreaterThan(open.value);
  });

  it('running in the open costs more than sneaking', () => {
    const running = new HealthSystem();
    hold(running, 6, outside({ gait: 'run' }), false);
    const sneaking = new HealthSystem();
    hold(sneaking, 6, outside({ gait: 'sneak' }), false);
    expect(sneaking.value).toBeGreaterThan(running.value);
  });

  it('holds steady outdoors once the clouds are back — it does not heal in the open', () => {
    const h = new HealthSystem();
    hold(h, 6, outside(), false);
    const hurt = h.value;
    expect(hurt).toBeLessThan(DEFAULT_HEALTH_CONFIG.max);

    // No moon on you, but still outside: nothing gets better out here.
    hold(h, 30, 0, false);
    expect(h.value).toBe(hurt);
    expect(h.draining).toBe(false);
  });

  it('comes back only behind a door', () => {
    const h = new HealthSystem();
    hold(h, 8, outside(), false);
    const hurt = h.value;

    hold(h, 1.5, 0, true);
    expect(h.value, 'indoors it recovers').toBeGreaterThan(hurt);

    hold(h, 30, 0, true);
    expect(h.value, 'up to whole, and no further').toBe(DEFAULT_HEALTH_CONFIG.max);
  });

  it('waits a moment after the door shuts before it starts mending', () => {
    const h = new HealthSystem();
    hold(h, 8, outside(), false);
    const hurt = h.value;
    hold(h, DEFAULT_HEALTH_CONFIG.recoverDelay * 0.5, 0, true);
    expect(h.value, 'not instantly').toBe(hurt);
    hold(h, DEFAULT_HEALTH_CONFIG.recoverDelay, 0, true);
    expect(h.value).toBeGreaterThan(hurt);
  });

  it('a shelter is a shelter even with the moon full on the roof', () => {
    const h = new HealthSystem();
    hold(h, 8, outside(), false);
    const hurt = h.value;
    // `pressure` is already zero indoors in play; belt and braces if a caller passes one.
    hold(h, 5, outside(), true);
    expect(h.value).toBeGreaterThan(hurt);
  });

  it('gives a player caught in the open the best part of half a minute', () => {
    const h = new HealthSystem();
    const t = secondsUntil(h, outside(), false);
    expect(t, 'an ordinary walk in the open').toBeGreaterThan(15);
    expect(t).toBeLessThan(30);
  });

  it('gives a player caught at a dead run, far out, ten seconds at least', () => {
    const h = new HealthSystem();
    const worst = outside({ gait: 'run', shelterDistance: 60 });
    const t = secondsUntil(h, worst, false);
    expect(t, 'the worst case the village can produce').toBeGreaterThan(10);
  });

  it('says so once when it runs out, and comes round with something left', () => {
    const h = new HealthSystem();
    const t = secondsUntil(h, outside(), false);
    expect(t).toBeLessThan(Infinity);
    expect(h.value).toBe(0);
    expect(h.level).toBe('critical');

    h.revive();
    expect(h.value, 'never nothing: a run is never made unwinnable').toBe(DEFAULT_HEALTH_CONFIG.revive);
    expect(h.value).toBeGreaterThan(0);

    // And it does not keep announcing it once revived.
    expect(h.update(DT, { pressure: 0, sheltered: true })).toBe(false);
  });

  it('warns before it is too late', () => {
    const h = new HealthSystem();
    const seen: string[] = [];
    for (let t = 0; t < 60; t += DT) {
      h.update(DT, { pressure: outside(), sheltered: false });
      if (seen[seen.length - 1] !== h.level) seen.push(h.level);
    }
    expect(seen).toEqual(['well', 'grazed', 'hurt', 'critical']);
  });

  it('reports a fraction the HUD can draw', () => {
    const h = new HealthSystem();
    expect(h.fraction).toBe(1);
    hold(h, 8, outside(), false);
    expect(h.fraction).toBeGreaterThan(0);
    expect(h.fraction).toBeLessThan(1);
  });
});
