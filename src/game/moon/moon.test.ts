import { describe, expect, it } from 'vitest';
import type { MoonStateName } from '../../shared/types';
import { DEFAULT_EXPOSURE_CONFIG, ExposureSystem, type ExposureInput } from './ExposureSystem';
import { MoonManager } from './MoonManager';
import { DEFAULT_MOON_CONFIG, moonlightFor } from './MoonState';

const run = (m: MoonManager, seconds: number, dt = 0.05) => {
  for (let t = 0; t < seconds; t += dt) m.update(dt);
};

describe('MoonManager', () => {
  it('cycles safe → warning → rising → active → fading → safe', () => {
    const m = new MoonManager();
    const seen: MoonStateName[] = [m.state];
    m.onState((s) => seen.push(s));
    run(m, 1200);
    expect(seen.slice(0, 6)).toEqual(['safe', 'warning', 'rising', 'active', 'fading', 'safe']);
    expect(m.cycle).toBeGreaterThanOrEqual(1);
  });

  it('keeps the brief’s timings, within the jitter', () => {
    const m = new MoonManager();
    const lengths = new Map<MoonStateName, number>();
    let last: MoonStateName = m.state;
    let t = 0;
    let since = 0;
    for (; t < 2000; t += 0.05) {
      m.update(0.05);
      since += 0.05;
      if (m.state !== last) {
        if (!lengths.has(last)) lengths.set(last, since);
        last = m.state;
        since = 0;
      }
    }
    for (const [state, seconds] of lengths) {
      if (state === 'safe') continue; // the first safe stretch is its own length
      const want = DEFAULT_MOON_CONFIG.durations[state];
      expect(Math.abs(seconds - want) / want, state).toBeLessThanOrEqual(DEFAULT_MOON_CONFIG.jitter + 0.02);
    }
  });

  it('is only dangerous once the moon is up', () => {
    const m = new MoonManager();
    const danger: Record<MoonStateName, boolean> = { safe: false, warning: false, rising: true, active: true, fading: false };
    for (const [state, want] of Object.entries(danger) as [MoonStateName, boolean][]) {
      m.skipTo(state);
      expect(m.dangerous, state).toBe(want);
    }
  });

  it('gives the whole warning before anything costs anything', () => {
    const m = new MoonManager();
    m.skipTo('safe');
    run(m, 1);
    // From the first sign to the first exposure: the warning's full length.
    expect(m.untilMoonlight).toBeGreaterThan(DEFAULT_MOON_CONFIG.durations.warning);
    m.skipTo('warning');
    expect(m.untilMoonlight).toBeGreaterThan(DEFAULT_MOON_CONFIG.durations.warning * 0.9);
    expect(m.exposureRate).toBe(0);
    m.skipTo('rising');
    expect(m.untilMoonlight).toBe(0);
  });

  it('moonlight rises before the moon does, holds, and fades away', () => {
    expect(moonlightFor('safe', 1)).toBe(0);
    expect(moonlightFor('warning', 1)).toBeGreaterThan(0); // the sky cools first
    expect(moonlightFor('warning', 1)).toBeLessThan(moonlightFor('rising', 0.5));
    expect(moonlightFor('active', 1)).toBe(1);
    expect(moonlightFor('fading', 1)).toBe(0);
    // No steps: the curve is continuous across every boundary.
    const order: MoonStateName[] = ['safe', 'warning', 'rising', 'active', 'fading'];
    for (let i = 0; i + 1 < order.length; i++) {
      expect(Math.abs(moonlightFor(order[i], 1) - moonlightFor(order[i + 1], 0))).toBeLessThan(0.02);
    }
  });

  it('villagers head home from the first sign until the moon has gone', () => {
    const m = new MoonManager();
    const home: Record<MoonStateName, boolean> = { safe: false, warning: true, rising: true, active: true, fading: false };
    for (const [state, want] of Object.entries(home) as [MoonStateName, boolean][]) {
      m.skipTo(state);
      expect(m.goingHome, state).toBe(want);
    }
  });

  it('a seed reproduces a night exactly', () => {
    const lengths = (seed: number) => {
      const m = new MoonManager(DEFAULT_MOON_CONFIG, seed);
      const out: number[] = [];
      let t = 0;
      m.onState(() => out.push(+t.toFixed(2)));
      for (; t < 800; t += 0.05) m.update(0.05);
      return out;
    };
    expect(lengths(7)).toEqual(lengths(7));
    expect(lengths(7)).not.toEqual(lengths(8));
  });
});

describe('ExposureSystem', () => {
  const outside = (over: Partial<ExposureInput> = {}): ExposureInput => ({
    moonRate: 1,
    sheltered: false,
    openGround: false,
    covered: false,
    gait: 'walk',
    shelterDistance: 10,
    ...over,
  });
  const fill = (e: ExposureSystem, input: ExposureInput, max = 120) => {
    let t = 0;
    while (t < max && !e.update(0.05, input)) t += 0.05;
    return t;
  };

  it('is zero while the moon is behind the clouds', () => {
    const e = new ExposureSystem();
    for (let i = 0; i < 400; i++) e.update(0.05, outside({ moonRate: 0 }));
    expect(e.value).toBe(0);
    expect(e.rising).toBe(false);
  });

  it('inside a shelter the moon cannot touch you, and what you caught clears', () => {
    const e = new ExposureSystem();
    e.value = 70;
    for (let i = 0; i < 100; i++) expect(e.update(0.05, outside({ sheltered: true }))).toBe(false);
    expect(e.value).toBe(0);
    expect(e.exposedSeconds).toBe(0);
  });

  it('open ground is worst, cover is best', () => {
    const times = (over: Partial<ExposureInput>) => fill(new ExposureSystem(), outside(over));
    const open = times({ openGround: true });
    const lane = times({});
    const covered = times({ covered: true });
    expect(open).toBeLessThan(lane);
    expect(lane).toBeLessThan(covered);
  });

  it('running catches the light; sneaking keeps you out of it', () => {
    const times = (gait: ExposureInput['gait']) => fill(new ExposureSystem(), outside({ gait }));
    expect(times('run')).toBeLessThan(times('walk'));
    expect(times('walk')).toBeLessThan(times('sneak'));
  });

  it('a long way from any door is worse than beside one', () => {
    expect(fill(new ExposureSystem(), outside({ shelterDistance: 60 }))).toBeLessThan(fill(new ExposureSystem(), outside({ shelterDistance: 2 })));
  });

  it('always leaves time to reach a door', () => {
    const worst = fill(new ExposureSystem(), outside({ openGround: true, gait: 'run', shelterDistance: 60 }));
    expect(worst, 'running across open ground, far from anywhere').toBeGreaterThanOrEqual(8);
    const ordinary = fill(new ExposureSystem(), outside({}));
    expect(ordinary, 'walking the lanes').toBeGreaterThanOrEqual(18);
    const careful = fill(new ExposureSystem(), outside({ covered: true, gait: 'sneak' }), 200);
    expect(careful, 'under cover, keeping low').toBeGreaterThanOrEqual(50);
  });

  it('says "find shelter" before it fills', () => {
    const e = new ExposureSystem();
    let warnedAt = 0;
    let t = 0;
    while (!e.update(0.05, outside({}))) {
      t += 0.05;
      if (!warnedAt && e.level === 'warn') warnedAt = t;
    }
    expect(warnedAt).toBeGreaterThan(0);
    expect(t - warnedAt, 'time left after the warning').toBeGreaterThan(3);
    expect(e.failures).toBe(1);
    expect(e.value).toBe(DEFAULT_EXPOSURE_CONFIG.max);
    e.reset();
    expect(e.value).toBe(0);
  });
});
