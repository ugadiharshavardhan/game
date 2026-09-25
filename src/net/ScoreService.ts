/**
 * Sending a finished run to be counted, and hearing back what it was actually worth.
 *
 * The browser sends what happened (the run's stats) to `submit_player_result`. The database
 * checks the stats could have happened, that the player really is in that round, and scores the
 * run itself; the client's own total is sent only so a disagreement can be noticed. Every
 * accepted run is kept — the boards pick each player's best.
 */
import type { MyRun, RunAccepted } from '../shared/multiplayer';
import type { RunResult } from '../shared/types';
import { Observable } from './Observable';
import { errorText, rpc, TeamServiceError } from './rpc';
import { toMyRun, toRunAccepted, type RawMyRun, type RawRunAccepted } from './snapshot';

/** Enough of the player's history to place almost any run among it. */
const HISTORY_LIMIT = 100;

export class ScoreService {
  /** The last run the database accepted — the official version of the results screen. */
  readonly accepted = new Observable<RunAccepted | null>(null);
  /** The accepted run's place among all of this player's runs, from the database. */
  readonly placing = new Observable<MyRun | null>(null);
  readonly rejected = new Observable<string | null>(null);
  readonly submitting = new Observable(false);
  private attempt = 0;
  private lastSubmission: { sessionId: string | null; result: RunResult } | null = null;

  async submit(sessionId: string | null, result: RunResult): Promise<RunAccepted | null> {
    const attempt = ++this.attempt;
    this.lastSubmission = { sessionId, result };
    this.accepted.set(null);
    this.placing.set(null);
    this.rejected.set(null);
    this.submitting.set(true);
    try {
      const raw = await rpc<RawRunAccepted>('submit_player_result', {
        p_session_id: sessionId,
        p_stats: result.stats,
        p_client_score: Math.round(result.breakdown.total),
      });
      const accepted = toRunAccepted(raw);
      if (accepted.score !== result.breakdown.total) {
        console.warn(`[scores] the database scored this run ${accepted.score}, the client ${result.breakdown.total}`);
      }
      if (attempt === this.attempt) {
        this.accepted.set(accepted);
        this.lastSubmission = null;
      }
      void this.place(attempt, accepted.resultId);
      return accepted;
    } catch (error) {
      if (error instanceof TeamServiceError && error.code === 'BAD_RUN') console.warn('[scores] run rejected:', error.detail);
      // A rule the run broke will break again; anything else (network, auth) is worth retrying.
      if (error instanceof TeamServiceError && (error.code === 'BAD_RUN' || error.code === 'DUPLICATE_RUN')) this.lastSubmission = null;
      if (attempt === this.attempt) this.rejected.set(errorText(error));
      return null;
    } finally {
      if (attempt === this.attempt) this.submitting.set(false);
    }
  }

  /** True when the last run failed for a reason that might not happen twice. */
  canRetry(): boolean {
    return this.lastSubmission !== null && !this.submitting.get() && this.accepted.get() === null;
  }

  retry(): Promise<RunAccepted | null> {
    const last = this.lastSubmission;
    return last ? this.submit(last.sessionId, last.result) : Promise.resolve(null);
  }

  private async place(attempt: number, resultId: string): Promise<void> {
    try {
      const runs = await rpc<RawMyRun[]>('get_my_runs', { p_limit: HISTORY_LIMIT });
      const mine = (runs ?? []).map(toMyRun).find((run) => run.resultId === resultId) ?? null;
      if (attempt === this.attempt) this.placing.set(mine);
    } catch (error) {
      console.warn('[scores] could not read the run history', error);
    }
  }

  clear(): void {
    this.attempt += 1;
    this.lastSubmission = null;
    this.accepted.set(null);
    this.placing.set(null);
    this.rejected.set(null);
    this.submitting.set(false);
  }
}
