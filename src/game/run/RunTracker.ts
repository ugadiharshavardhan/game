/**
 * What the run is worth, kept as it happens: offerings gathered and lost, shelters reached under
 * the moon, moons survived, ground covered, time taken — and the score they add up to.
 *
 * The weights are the ones on the results screen, so a player can read a score and understand it:
 * every offering is worth 40, every shelter reached under the moon 250, a tidy route up to 1000,
 * and finishing before the night is old up to a few hundred more. Dropping offerings and being
 * overwhelmed cost a little. Nothing here can make a run unwinnable.
 *
 * The arithmetic itself lives in `shared/score.ts`, because the server recomputes every score it
 * is sent from the same stats with the same weights (see `server/`).
 */
import { DEFAULT_SCORE_WEIGHTS, scoreRun, type ScoreWeights } from '../../shared/score';
import type { RunResult, RunStats } from '../../shared/types';

export type { ScoreWeights };
export { DEFAULT_SCORE_WEIGHTS };

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
    pujaComplete: false,
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

  /**
   * The finished run: stats, efficiency and the score breakdown.
   *
   * @param pujaComplete every offering was before Bappa before 05:00. False when dawn ended the
   *   run instead — those runs are scored honestly for what they gathered and no more.
   */
  finish(pujaComplete: boolean): RunResult {
    const stats: RunStats = { ...this.stats, pujaComplete, durationMs: Date.now() - this.startedAt };
    const { breakdown, efficiency } = scoreRun(stats, this.weights);
    return { stats, breakdown, efficiency, completedAt: Date.now() };
  }
}
