/**
 * Sending a finished run to be counted, and hearing back what it was actually worth.
 *
 * The browser sends what happened (the run's stats) to `submit_player_result`. The database
 * checks the stats could have happened, that the player really is in that round, and scores the
 * run itself; the client's own total is sent only so a disagreement can be noticed. Every
 * accepted run is kept — the boards pick each player's best.
 */
import type { RunAccepted } from '../shared/multiplayer';
import type { RunResult } from '../shared/types';
import { Observable } from './Observable';
import { errorText, rpc, TeamServiceError } from './rpc';
import { toRunAccepted, type RawRunAccepted } from './snapshot';

export class ScoreService {
  /** The last run the database accepted — the official version of the results screen. */
  readonly accepted = new Observable<RunAccepted | null>(null);
  readonly rejected = new Observable<string | null>(null);
  readonly submitting = new Observable(false);
  private attempt = 0;

  async submit(sessionId: string | null, result: RunResult): Promise<RunAccepted | null> {
    const attempt = ++this.attempt;
    this.accepted.set(null);
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
      if (attempt === this.attempt) this.accepted.set(accepted);
      return accepted;
    } catch (error) {
      if (error instanceof TeamServiceError && error.code === 'BAD_RUN') console.warn('[scores] run rejected:', error.detail);
      if (attempt === this.attempt) this.rejected.set(errorText(error));
      return null;
    } finally {
      if (attempt === this.attempt) this.submitting.set(false);
    }
  }

  clear(): void {
    this.attempt += 1;
    this.accepted.set(null);
    this.rejected.set(null);
    this.submitting.set(false);
  }
}
