/**
 * The two boards, which are never the same board: players, and teams.
 */
import type { Leaderboards } from '../shared/multiplayer';
import type { NetConnection } from './NetConnection';
import { Observable } from './Observable';

export class LeaderboardService {
  readonly boards = new Observable<Leaderboards>({ individual: [], teams: [] });
  readonly loading = new Observable(false);
  private readonly net: NetConnection;

  constructor(net: NetConnection) {
    this.net = net;
    this.net.on((message) => {
      if (message.type === 'leaderboards') {
        this.boards.set(message.boards);
        this.loading.set(false);
      }
    });
  }

  refresh(): void {
    this.loading.set(true);
    this.net.send({ type: 'leaderboards' });
  }
}
