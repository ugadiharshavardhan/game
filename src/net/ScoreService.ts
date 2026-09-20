/**
 * Sending a finished run to be counted, and hearing back what it was actually worth.
 *
 * The client's own total is sent along, but only so the referee can notice when the two disagree;
 * the number that reaches a leaderboard is the one the referee works out for itself.
 */
import type { RunAccepted, RunSubmission } from '../shared/multiplayer';
import type { RunResult } from '../shared/types';
import type { NetConnection } from './NetConnection';
import { Observable } from './Observable';

export class ScoreService {
  /** The last run the referee accepted — the official version of the results screen. */
  readonly accepted = new Observable<RunAccepted | null>(null);
  readonly rejected = new Observable<string | null>(null);
  private readonly net: NetConnection;

  constructor(net: NetConnection) {
    this.net = net;
    this.net.on((message) => {
      if (message.type === 'run-accepted') {
        this.rejected.set(null);
        this.accepted.set(message.result);
      } else if (message.type === 'error' && (message.code === 'bad-run' || message.code === 'duplicate-run')) {
        this.rejected.set(message.code === 'duplicate-run' ? 'Already counted.' : 'Not counted.');
      }
    });
  }

  submit(playerId: string, sessionId: string | null, result: RunResult): void {
    this.accepted.set(null);
    this.rejected.set(null);
    const run: RunSubmission = { playerId, sessionId, stats: result.stats, claimedScore: result.breakdown.total };
    this.net.send({ type: 'submit-run', run });
  }

  clear(): void {
    this.accepted.set(null);
    this.rejected.set(null);
  }
}
