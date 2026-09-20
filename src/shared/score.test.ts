/**
 * What a run is worth, and what a run is allowed to claim.
 *
 * The rule the night added: a run may end at 05:00 with the puja unfinished. Those runs are real
 * runs — they are scored, and they reach the board — but the puja's own worth and the reward for
 * being quick both belong to a run that actually finished. The validator has to let them through,
 * which it did not before, because it read "fewer than 25 offerings" as proof of a liar.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORE_WEIGHTS, scoreRun, validateStats } from './score';
import type { RunStats } from './types';

const stats = (over: Partial<RunStats> = {}): RunStats => ({
  itemsCollected: 25,
  itemsLost: 0,
  shelterEvents: 2,
  moonlightEncounters: 3,
  overwhelmed: 0,
  durationMs: 8 * 60_000,
  distanceTravelled: 1200,
  exposedSeconds: 30,
  pujaComplete: true,
  ...over,
});

describe('scoreRun', () => {
  it('pays for the puja and for being quick about it', () => {
    const { breakdown } = scoreRun(stats());
    expect(breakdown.completion).toBe(DEFAULT_SCORE_WEIGHTS.completion);
    expect(breakdown.timeBonus).toBeGreaterThan(0);
    expect(breakdown.total).toBe(
      breakdown.items + breakdown.shelter + breakdown.efficiency + breakdown.completion + breakdown.timeBonus + breakdown.penalties,
    );
  });

  it('pays for neither when dawn ended the run', () => {
    const { breakdown } = scoreRun(stats({ pujaComplete: false }));
    expect(breakdown.completion).toBe(0);
    expect(breakdown.timeBonus, 'there is nothing quick about running out of night').toBe(0);
  });

  it('still counts everything a dawn-ended run did gather', () => {
    const unfinished = scoreRun(stats({ pujaComplete: false, itemsCollected: 18 })).breakdown;
    expect(unfinished.items).toBe(18 * DEFAULT_SCORE_WEIGHTS.perItem);
    expect(unfinished.shelter).toBeGreaterThan(0);
    expect(unfinished.total).toBeGreaterThan(0);
  });

  it('is always worth finishing', () => {
    const finished = scoreRun(stats()).breakdown.total;
    const not = scoreRun(stats({ pujaComplete: false })).breakdown.total;
    expect(finished).toBeGreaterThan(not);
  });
});

describe('validateStats', () => {
  it('accepts an honest finished run', () => {
    expect(validateStats(stats())).toBeNull();
  });

  it('accepts a run that ran out of night with almost nothing in the bag', () => {
    expect(validateStats(stats({ pujaComplete: false, itemsCollected: 3 }))).toBeNull();
    expect(validateStats(stats({ pujaComplete: false, itemsCollected: 0 }))).toBeNull();
  });

  it('still refuses a run that claims a puja it could not have finished', () => {
    expect(validateStats(stats({ pujaComplete: true, itemsCollected: 3 }))).toBe('the puja was not completed');
  });

  it('refuses stats with no completion flag at all', () => {
    const missing = { ...stats() } as Partial<RunStats>;
    delete missing.pujaComplete;
    expect(validateStats(missing as RunStats)).toBe('pujaComplete is not a flag');
  });

  it('still refuses the impossible', () => {
    expect(validateStats(stats({ durationMs: 1000 }))).toBe('finished faster than the village can be walked');
    expect(validateStats(stats({ distanceTravelled: 5 }))).toBe('the offerings are further apart than that');
    expect(validateStats(stats({ exposedSeconds: 99_999 }))).toBe('more time in the moonlight than in the run');
  });
});
