import { describe, expect, it } from 'vitest';
import { LADDER, PerformanceManager, verdict } from './PerformanceManager';
import { type DeviceInfo, PROFILES, profileFor, startingTier } from './quality';

const DESKTOP: DeviceInfo = { mobile: false, cores: 12, memory: 16, dpr: 2, label: 'desktop' };
const PHONE: DeviceInfo = { mobile: true, cores: 8, memory: 6, dpr: 3, label: 'phone' };
const OLD_PHONE: DeviceInfo = { mobile: true, cores: 2, memory: 2, dpr: 2, label: 'old phone' };
const CAPS_DESKTOP = { high: 2, medium: 1.5, low: 1 };
const CAPS_PHONE = { high: 1.5, medium: 1.5, low: 1.25 };

const make = (device: DeviceInfo, requested: 'auto' | 'low' | 'medium' | 'high' = 'auto') =>
  new PerformanceManager({ requested, device, profile: profileFor(requested, device), caps: device.mobile ? CAPS_PHONE : CAPS_DESKTOP });

/** Runs `seconds` of frames, `dt` long (or from a function of the manager); returns how many changes it made. */
function run(m: PerformanceManager, seconds: number, dt: number | ((m: PerformanceManager) => number)): number {
  let changes = 0;
  for (let t = 0; t < seconds; ) {
    const d = typeof dt === 'number' ? dt : dt(m);
    t += d;
    if (m.frame(d)) changes++;
  }
  return changes;
}

describe('device detection', () => {
  it('does not treat a phone as a potato: phones start MEDIUM, desktops HIGH', () => {
    expect(startingTier(DESKTOP)).toBe('high');
    expect(startingTier(PHONE)).toBe('medium');
    expect(startingTier(OLD_PHONE)).toBe('low');
  });

  it('caps a phone’s pixels harder and gives it no multisampled target', () => {
    const p = profileFor('auto', PHONE);
    expect(p.name).toBe('medium');
    expect(p.pixelRatio).toBeLessThanOrEqual(1.5);
    expect(p.msaa).toBe(0);
    expect(profileFor('auto', DESKTOP).msaa).toBeGreaterThan(0);
  });

  it('draws every teammate at every tier', () => {
    for (const p of Object.values(PROFILES)) expect(p.ghosts).toBe(3);
  });

  it('uses 2048 / 1024 / 512 shadow maps for HIGH / MEDIUM / LOW', () => {
    expect(PROFILES.high.shadowMapSize).toBe(2048);
    expect(PROFILES.medium.shadowMapSize).toBe(1024);
    expect(PROFILES.low.shadowMapSize).toBe(512);
    expect(LADDER.find((r) => r.tier === 'low')?.shadowMapSize).toBe(512);
  });
});

describe('PerformanceManager', () => {
  it('reads frame rate as GOOD over 50, OK 35–50, POOR under 35', () => {
    expect(verdict(58)).toBe('good');
    expect(verdict(42)).toBe('ok');
    expect(verdict(30)).toBe('poor');
  });

  it('starts where the device starts, pixel ratio capped', () => {
    const d = make(DESKTOP);
    expect(d.live.tier).toBe('high');
    expect(d.live.pixelRatio).toBe(2);
    expect(d.live.shadowMapSize).toBe(2048);
    const p = make(PHONE);
    expect(p.live.tier).toBe('medium');
    expect(p.live.pixelRatio).toBe(1.5);
    expect(p.live.shadowMapSize).toBe(1024);
  });

  it('leaves a device that is keeping up exactly where it is', () => {
    const m = make(PHONE);
    expect(run(m, 60, 1 / 60)).toBe(0);
    expect(m.rung).toBe(0);
  });

  it('holds still in the OK band', () => {
    const m = make(PHONE);
    expect(run(m, 60, 1 / 42)).toBe(0);
  });

  it('ignores the start-up hitches and a paused tab', () => {
    const m = make(PHONE);
    expect(run(m, 3.5, 1 / 10)).toBe(0);
    for (let i = 0; i < 10; i++) m.frame(4);
    expect(m.rung).toBe(0);
  });

  it('gives things up in order — render scale first, then shadows, then bloom — and a phone reaches LOW', () => {
    const m = make(PHONE);
    const seen: string[] = [];
    let prev = { ...m.live };
    for (let t = 0; t < 120; t += 1 / 20) {
      if (!m.frame(1 / 20)) continue;
      const l = m.live;
      if (l.pixelRatio !== prev.pixelRatio) seen.push('scale');
      if (l.shadowEvery !== prev.shadowEvery) seen.push('shadowEvery');
      if (l.bloom !== prev.bloom) seen.push('bloom');
      if (l.particles !== prev.particles) seen.push('particles');
      if (l.tier !== prev.tier) seen.push(`tier:${l.tier}`);
      prev = { ...l };
    }
    expect(seen.indexOf('scale')).toBeLessThan(seen.indexOf('shadowEvery'));
    expect(seen.indexOf('shadowEvery')).toBeLessThan(seen.indexOf('bloom'));
    expect(seen.indexOf('bloom')).toBeLessThan(seen.indexOf('particles'));
    expect(seen).toContain('tier:low');
    expect(m.live.shadowMapSize).toBe(512);
    expect(m.live.pixelRatio).toBeGreaterThanOrEqual(0.6);
  });

  it('never gives up more than one rung per settle period', () => {
    const m = make(DESKTOP);
    // Warm-up, then 3 s of terrible frames: two POOR windows make one step, the settle blocks a second.
    run(m, 4, 1 / 60);
    expect(run(m, 3, 1 / 10)).toBe(1);
  });

  it('winds back up once there is room, but slowly', () => {
    const m = make(PHONE);
    run(m, 14, 1 / 20);
    const low = m.rung;
    expect(low).toBeGreaterThan(0);
    run(m, 4, 1 / 60);
    expect(m.rung, 'not straight away').toBe(low);
    run(m, 60, 1 / 60);
    expect(m.rung).toBeLessThan(low);
  });

  it('settles on a device that cannot hold a higher rung instead of flickering', () => {
    const m = make(DESKTOP);
    // Fine from the third rung down; too slow above it.
    let changes = 0;
    for (let t = 0; t < 400; ) {
      const dt = m.rung < 2 ? 1 / 28 : 1 / 60;
      t += dt;
      if (m.frame(dt)) changes++;
    }
    const lateChanges = changes;
    expect(lateChanges, 'still changing').toBeLessThan(12);
    expect(m.rung).toBeGreaterThanOrEqual(2);
  });

  it('keeps a tier the player chose: LOW stays LOW, HIGH never falls into MEDIUM', () => {
    const high = make(DESKTOP, 'high');
    run(high, 120, 1 / 15);
    expect(high.live.tier).toBe('high');
    const low = make(PHONE, 'low');
    expect(low.live.tier).toBe('low');
    expect(low.live.pixelRatio).toBe(1.25);
  });
});
