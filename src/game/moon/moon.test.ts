import { describe, expect, it } from 'vitest';
import type { MoonPhase } from '../../shared/types';
import { DEFAULT_MOON_CONFIG, MoonCycle } from './MoonCycle';
import { DEFAULT_PURITY_CONFIG, PuritySystem } from './PuritySystem';

const run = (m: MoonCycle, seconds: number, dt = 0.05) => {
  for (let t = 0; t < seconds; t += dt) m.update(dt);
};

describe('MoonCycle', () => {
  it('goes day → dusk → moonrise → moonlight → moonset → day', () => {
    const m = new MoonCycle();
    const seen: MoonPhase[] = [m.phase];
    m.onPhase((p) => seen.push(p));
    run(m, 400);
    expect(seen.slice(0, 6)).toEqual(['day', 'dusk', 'moonrise', 'moonlight', 'moonset', 'day']);
    expect(m.cycle).toBeGreaterThanOrEqual(2);
  });

  it('is only dangerous in moonlight', () => {
    const m = new MoonCycle();
    for (const p of ['day', 'dusk', 'moonrise', 'moonset'] as const) {
      m.skipTo(p);
      expect(m.dangerous).toBe(false);
    }
    m.skipTo('moonlight');
    expect(m.dangerous).toBe(true);
  });

  it('always gives a grace period before danger', () => {
    const m = new MoonCycle();
    let last: MoonPhase = m.phase;
    let graceSeconds = 0;
    const graces: number[] = [];
    for (let t = 0; t < 600; t += 0.05) {
      m.update(0.05);
      if (m.phase === 'moonrise') graceSeconds += 0.05;
      if (m.phase === 'moonlight' && last === 'moonrise') {
        graces.push(graceSeconds);
        graceSeconds = 0;
      }
      last = m.phase;
    }
    expect(graces.length).toBeGreaterThanOrEqual(3);
    for (const g of graces) expect(g).toBeGreaterThanOrEqual(DEFAULT_MOON_CONFIG.durations.moonrise * 0.89);
  });

  it('jitters durations by seed, reproducibly', () => {
    const lengths = (seed: number) => {
      const m = new MoonCycle(DEFAULT_MOON_CONFIG, seed);
      const out: number[] = [];
      let t = 0;
      m.onPhase(() => {
        out.push(+t.toFixed(2));
      });
      for (; t < 300; t += 0.01) m.update(0.01);
      return out;
    };
    expect(lengths(7)).toEqual(lengths(7));
    expect(lengths(7)).not.toEqual(lengths(8));
  });

  it('moonlight rises through moonrise, holds, and fades at moonset', () => {
    const m = new MoonCycle();
    expect(m.moonlight).toBe(0);
    m.skipTo('moonrise');
    const start = m.moonlight;
    run(m, 2);
    expect(m.moonlight).toBeGreaterThan(start);
    m.skipTo('moonlight');
    expect(m.moonlight).toBe(1);
    m.skipTo('moonset');
    run(m, 5.9);
    expect(m.moonlight).toBeLessThan(0.1);
  });
});

describe('PuritySystem', () => {
  const outside = { dangerous: true, sheltered: false, openGround: false };
  const open = { dangerous: true, sheltered: false, openGround: true };
  const indoors = { dangerous: true, sheltered: true, openGround: false };

  it('moonlight cannot touch you indoors', () => {
    const p = new PuritySystem();
    for (let i = 0; i < 600; i++) expect(p.update(0.05, indoors)).toBe(false);
    expect(p.value).toBe(DEFAULT_PURITY_CONFIG.max);
    expect(p.exposed).toBe(false);
    expect(p.exposedSeconds).toBe(0);
  });

  it('drains outside in moonlight, faster on open ground', () => {
    const a = new PuritySystem();
    const b = new PuritySystem();
    for (let i = 0; i < 20; i++) {
      a.update(0.05, outside);
      b.update(0.05, open);
    }
    expect(a.value).toBeLessThan(100);
    expect(b.value).toBeLessThan(a.value);
    expect(a.exposed).toBe(true);
  });

  it('does not drain while the moon is hidden, and recovers', () => {
    const p = new PuritySystem();
    p.value = 50;
    for (let i = 0; i < 20; i++) p.update(0.05, { dangerous: false, sheltered: false, openGround: true });
    expect(p.value).toBeGreaterThan(50);
  });

  it('runs out once, then comes back part-way', () => {
    const p = new PuritySystem();
    let failures = 0;
    for (let i = 0; i < 400; i++) if (p.update(0.05, open)) failures++;
    expect(failures).toBeGreaterThanOrEqual(1);
    expect(p.failures).toBe(failures);
    expect(p.value).toBeGreaterThan(0);
  });

  it('gives at least ten seconds on open ground from full', () => {
    const p = new PuritySystem();
    let t = 0;
    while (!p.update(0.05, open)) t += 0.05;
    expect(t).toBeGreaterThanOrEqual(10);
  });
});
