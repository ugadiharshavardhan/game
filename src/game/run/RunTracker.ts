/**
 * What the run is worth, kept as it happens: offerings gathered and lost, shelters reached under
 * the moon, moons survived, ground covered, time taken — and the score they add up to.
 *
 * The weights are the ones on the results screen, so a player can read a score and understand it:
 * every offering is worth 40, every shelter reached under the moon 250, a tidy route up to 1000,
 * and finishing before the night is old up to a few hundred more. Dropping offerings and being
 * overwhelmed cost a little. Nothing here can make a run unwinnable.
 */
import type { RunResult, RunStats, ScoreBreakdown } from '../../shared/types';

export interface ScoreWeights {
  perItem: number;
  perShelter: number;
  efficiencyMax: number;
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
  efficientMetres: 900,
  targetSeconds: 600,
  perSecond: 3,
  timeMax: 600,
  perItemLost: 25,
  perOverwhelmed: 50,
};

export class RunTracker {
  readonly stats: RunStats = {
    itemsCollected: 0,
    itemsLost: 0,
    shelterEvents: 0,
    moonlightEncounters: 0,
    overwhelmed: 0,
    durationMs: 0,
    distanceTravelled: 0,
    exposedSeconds: 0,
  };

  private readonly startedAt = Date.now();
  private readonly weights: ScoreWeights;

  constructor(weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS) {
    this.weights = weights;
  }

  collected(n: number): void {
    this.stats.itemsCollected += n;
  }

  /** Dropped under the moon (counted lost until picked up again). */
  dropped(n: number): void {
    this.stats.itemsLost += n;
    this.stats.overwhelmed++;
  }

  recovered(n: number): void {
    this.stats.itemsLost = Math.max(this.stats.itemsLost - n, 0);
  }

  shelteredUnderMoon(): void {
    this.stats.shelterEvents++;
  }

  moonRose(): void {
    this.stats.moonlightEncounters++;
  }

  travelled(metres: number): void {
    this.stats.distanceTravelled += metres;
  }

  exposed(seconds: number): void {
    this.stats.exposedSeconds = seconds;
  }

  /** The finished run: stats, efficiency and the score breakdown. */
  finish(): RunResult {
    const w = this.weights;
    const stats: RunStats = { ...this.stats, durationMs: Date.now() - this.startedAt };
    const efficiency = stats.distanceTravelled > 0 ? Math.min(w.efficientMetres / stats.distanceTravelled, 1) : 1;
    const breakdown: ScoreBreakdown = {
      items: stats.itemsCollected * w.perItem,
      shelter: stats.shelterEvents * w.perShelter,
      efficiency: Math.round(efficiency * w.efficiencyMax),
      // Capped: a quick run is worth a lot, but never more than gathering the offerings was.
      timeBonus: Math.min(Math.max(0, Math.round((w.targetSeconds - stats.durationMs / 1000) * w.perSecond)), w.timeMax),
      penalties: -(stats.itemsLost * w.perItemLost + stats.overwhelmed * w.perOverwhelmed),
      total: 0,
    };
    breakdown.total = breakdown.items + breakdown.shelter + breakdown.efficiency + breakdown.timeBonus + breakdown.penalties;
    return { stats, breakdown, efficiency, completedAt: Date.now() };
  }
}
