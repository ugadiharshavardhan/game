/**
 * What a run is worth — the one place the number is worked out.
 *
 * The client shows it on the results screen and the server recomputes it from the same stats
 * before anything reaches a leaderboard, so a modified client can change what a player *sees* but
 * never what is recorded. Pure arithmetic: no engine, no DOM, no clock.
 */
import type { RunStats, ScoreBreakdown } from './types.ts';

export interface ScoreWeights {
  perItem: number;
  perShelter: number;
  efficiencyMax: number;
  /** The puja finished before 05:00. The single largest thing a run can be worth. */
  completion: number;
  /** The route a careful player walks, metres: the yardstick for efficiency. */
  efficientMetres: number;
  /** Finishing under this many seconds earns the bonus, at `perSecond` a second, up to `timeMax`. */
  targetSeconds: number;
  perSecond: number;
  timeMax: number;
  perItemLost: number;
  perOverwhelmed: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  perItem: 40,
  perShelter: 250,
  efficiencyMax: 1000,
  completion: 1200,
  efficientMetres: 900,
  targetSeconds: 600,
  perSecond: 3,
  timeMax: 600,
  perItemLost: 25,
  perOverwhelmed: 50,
};

export interface ScoredRun {
  breakdown: ScoreBreakdown;
  /** 0..1 — metres walked against the shortest route that would have done it. */
  efficiency: number;
}

export function scoreRun(stats: RunStats, w: ScoreWeights = DEFAULT_SCORE_WEIGHTS): ScoredRun {
  const efficiency = stats.distanceTravelled > 0 ? Math.min(w.efficientMetres / stats.distanceTravelled, 1) : 1;
  // Dawn broke first: the offerings gathered still count, but the puja's own worth and the
  // reward for being quick about it belong to a run that actually finished.
  const done = stats.pujaComplete;
  const breakdown: ScoreBreakdown = {
    items: stats.itemsCollected * w.perItem,
    shelter: stats.shelterEvents * w.perShelter,
    efficiency: Math.round(efficiency * w.efficiencyMax),
    completion: done ? w.completion : 0,
    // Capped: a quick run is worth a lot, but never more than gathering the offerings was.
    timeBonus: done ? Math.min(Math.max(0, Math.round((w.targetSeconds - stats.durationMs / 1000) * w.perSecond)), w.timeMax) : 0,
    penalties: -(stats.itemsLost * w.perItemLost + stats.overwhelmed * w.perOverwhelmed),
    total: 0,
  };
  breakdown.total =
    breakdown.items + breakdown.shelter + breakdown.efficiency + breakdown.completion + breakdown.timeBonus + breakdown.penalties;
  return { breakdown, efficiency };
}

/** What a run of this game can physically look like. Anything outside it did not happen. */
export interface RunLimits {
  /** The puja asks for this many offerings, so a finished run collected at least this many. */
  requiredItems: number;
  maxItems: number;
  minSeconds: number;
  maxSeconds: number;
  /** Nobody crosses the village without walking. */
  minMetres: number;
  maxMetres: number;
  maxShelterEvents: number;
  maxOverwhelmed: number;
}

export const DEFAULT_RUN_LIMITS: RunLimits = {
  requiredItems: 25,
  maxItems: 200,
  minSeconds: 90,
  maxSeconds: 7200,
  minMetres: 250,
  maxMetres: 60000,
  maxShelterEvents: 60,
  maxOverwhelmed: 60,
};

/** Returns why these stats are impossible, or null if they could have happened. */
export function validateStats(stats: RunStats, limits: RunLimits = DEFAULT_RUN_LIMITS): string | null {
  const numbers: Array<[string, number]> = [
    ['itemsCollected', stats.itemsCollected],
    ['itemsLost', stats.itemsLost],
    ['shelterEvents', stats.shelterEvents],
    ['moonlightEncounters', stats.moonlightEncounters],
    ['overwhelmed', stats.overwhelmed],
    ['durationMs', stats.durationMs],
    ['distanceTravelled', stats.distanceTravelled],
    ['exposedSeconds', stats.exposedSeconds],
  ];
  for (const [name, value] of numbers) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return `${name} is not a real number`;
  }
  if (typeof stats.pujaComplete !== 'boolean') return 'pujaComplete is not a flag';
  const seconds = stats.durationMs / 1000;
  // A run that says it finished the puja must have carried the offerings to do it. A run that
  // ran out of night is a real run too, and is allowed to have gathered nothing at all.
  if (stats.pujaComplete && stats.itemsCollected < limits.requiredItems) return 'the puja was not completed';
  if (stats.itemsCollected > limits.maxItems) return 'more offerings than the village holds';
  if (seconds < limits.minSeconds) return 'finished faster than the village can be walked';
  if (seconds > limits.maxSeconds) return 'longer than a night';
  if (stats.distanceTravelled < limits.minMetres) return 'the offerings are further apart than that';
  if (stats.distanceTravelled > limits.maxMetres) return 'further than anyone walks in a night';
  if (stats.shelterEvents > limits.maxShelterEvents) return 'more doors than there are';
  if (stats.overwhelmed > limits.maxOverwhelmed) return 'caught out too many times to be a run';
  if (stats.exposedSeconds > seconds) return 'more time in the moonlight than in the run';
  return null;
}
