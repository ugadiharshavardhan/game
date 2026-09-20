import { describe, expect, it } from 'vitest';
import { ResolutionGovernor } from './ResolutionGovernor';

/** Runs `seconds` of frames of a given length, returning every change the governor asked for. */
function run(g: ResolutionGovernor, seconds: number, dt: number): number[] {
  const changes: number[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const next = g.frame(dt);
    if (next !== null) changes.push(next);
  }
  return changes;
}

describe('ResolutionGovernor', () => {
  it('leaves a device that is keeping up exactly where it is', () => {
    const g = new ResolutionGovernor({ ceiling: 1, floor: 0.5 });
    expect(run(g, 30, 1 / 60)).toEqual([]);
    expect(g.pixelRatio).toBe(1);
  });

  it('draws fewer pixels when frames run slow, and stops at the floor', () => {
    const g = new ResolutionGovernor({ ceiling: 1, floor: 0.6 });
    run(g, 60, 1 / 20);
    expect(g.pixelRatio).toBeLessThan(1);
    expect(g.pixelRatio).toBeGreaterThanOrEqual(0.6);
    run(g, 60, 1 / 20);
    expect(g.pixelRatio).toBe(0.6);
  });

  it('ignores the start-up hitches', () => {
    const g = new ResolutionGovernor({ ceiling: 1, floor: 0.5 });
    expect(run(g, 3.5, 1 / 10)).toEqual([]);
  });

  it('does not count a paused tab as a slow frame', () => {
    const g = new ResolutionGovernor({ ceiling: 1, floor: 0.5 });
    run(g, 6, 1 / 60);
    for (let i = 0; i < 10; i++) g.frame(4);
    expect(g.pixelRatio).toBe(1);
  });

  it('winds resolution back up once there is room, but slowly', () => {
    const g = new ResolutionGovernor({ ceiling: 1, floor: 0.5 });
    run(g, 12, 1 / 20);
    const low = g.pixelRatio;
    expect(low).toBeLessThan(1);
    const raised = run(g, 3, 1 / 60);
    expect(raised, 'not straight away').toEqual([]);
    run(g, 40, 1 / 60);
    expect(g.pixelRatio).toBeGreaterThan(low);
  });

  it('settles on a device that cannot hold the higher resolution instead of flickering', () => {
    const g = new ResolutionGovernor({ ceiling: 1, floor: 0.5 });
    // Fine below 0.8, too slow above it.
    const frameFor = () => (g.pixelRatio > 0.8 ? 1 / 25 : 1 / 60);
    const changes: number[] = [];
    for (let t = 0, i = 0; t < 300; i++) {
      const dt = frameFor();
      t += dt;
      const next = g.frame(dt);
      if (next !== null) changes.push(next);
    }
    const lateChanges = changes.slice(6);
    expect(lateChanges.length, `still changing: ${changes.join(', ')}`).toBeLessThan(6);
  });
});
