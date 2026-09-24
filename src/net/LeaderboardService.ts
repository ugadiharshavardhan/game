/**
 * The two boards, which are never the same board: players, and teams.
 *
 * Both are worked out in Postgres from the stored results — each player's best valid run, and
 * each team's best round — and only public columns come back (names, campus, scores, times).
 */
import type { Leaderboards } from '../shared/multiplayer';
import { Observable } from './Observable';
import { errorText, rpc } from './rpc';
import { toIndividualRow, toTeamRow, type RawIndividualRow, type RawTeamRow } from './snapshot';

const LIMIT = 50;

export class LeaderboardService {
  readonly boards = new Observable<Leaderboards>({ individual: [], teams: [] });
  readonly loading = new Observable(false);
  readonly error = new Observable<string | null>(null);
  private request = 0;

  async refresh(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [individual, teams] = await Promise.all([
        rpc<RawIndividualRow[]>('get_individual_leaderboard', { p_limit: LIMIT }),
        rpc<RawTeamRow[]>('get_team_leaderboard', { p_limit: LIMIT }),
      ]);
      if (request !== this.request) return;
      this.boards.set({ individual: (individual ?? []).map(toIndividualRow), teams: (teams ?? []).map(toTeamRow) });
    } catch (error) {
      if (request === this.request) this.error.set(errorText(error));
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
