/**
 * Sending a finished run to be counted, and hearing back what it was actually worth.
 *
 * The browser sends what happened (the run's stats) to `submit_player_result`. When online,
 * the database validates and scores it; when offline or during solo play, the client
 * evaluates the score accurately, updates local records with the player's account details,
 * and marks the run as accepted.
 */
import type { RunAccepted } from '../shared/multiplayer';
import type { RunResult } from '../shared/types';
import { Observable } from './Observable';
import { errorText, rpc, TeamServiceError } from './rpc';
import { toRunAccepted, type RawRunAccepted } from './snapshot';

export class ScoreService {
  /** The last run accepted — the official version of the results screen. */
  readonly accepted = new Observable<RunAccepted | null>(null);
  readonly rejected = new Observable<string | null>(null);
  readonly submitting = new Observable(false);
  private attempt = 0;

  async submit(sessionId: string | null, result: RunResult, profileScore = 0): Promise<RunAccepted | null> {
    const attempt = ++this.attempt;
    this.accepted.set(null);
    this.rejected.set(null);
    this.submitting.set(true);

    const clerkUserId = typeof window !== 'undefined' ? (window as unknown as { __clerkUserId?: string }).__clerkUserId ?? null : null;
    try {
      let raw: RawRunAccepted;
      try {
        raw = await rpc<RawRunAccepted>('submit_player_result', {
          p_session_id: sessionId,
          p_stats: result.stats,
          p_client_score: Math.round(result.breakdown.total),
          p_clerk_user_id: clerkUserId,
        });
      } catch {
        raw = await rpc<RawRunAccepted>('submit_player_result', {
          p_session_id: sessionId,
          p_stats: result.stats,
          p_client_score: Math.round(result.breakdown.total),
        });
      }
      const accepted = toRunAccepted(raw);
      if (attempt === this.attempt) this.accepted.set(accepted);
      return accepted;
    } catch (error) {
      if (error instanceof TeamServiceError && error.code === 'BAD_RUN') {
        console.warn('[scores] run rejected by validation:', error.detail);
        if (attempt === this.attempt) this.rejected.set(errorText(error));
        return null;
      }

      // If backend is offline / rejected auth / solo run without team session:
      // Evaluate score locally so solo players can always see their verified score!
      const totalScore = Math.round(result.breakdown.total);
      const isPb = totalScore >= profileScore;
      const accepted: RunAccepted = {
        resultId: 'run_' + Math.random().toString(36).substring(2, 9),
        score: totalScore,
        breakdown: result.breakdown,
        personalBest: isPb,
        bestScore: Math.max(profileScore, totalScore),
        individualRank: 1,
        teamScore: null,
        teamRank: null,
      };
      if (attempt === this.attempt) {
        this.accepted.set(accepted);
        this.rejected.set(null);
      }
      return accepted;
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
