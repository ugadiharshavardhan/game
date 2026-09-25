/**
 * The boards: players, teams, and the signed-in player's own runs.
 *
 * All three are worked out in Postgres from the stored results — each player's best valid run,
 * each team's best round, and every counted run of your own — and only public columns come back
 * for other people (names, campus, scores, times).
 */
import type { Leaderboards, MyRun } from '../shared/multiplayer';
import { Observable } from './Observable';
import { errorText, rpc } from './rpc';
import { toIndividualRow, toMyRun, toTeamRow, type RawIndividualRow, type RawMyRun, type RawTeamRow } from './snapshot';

const LIMIT = 50;

export class LeaderboardService {
  readonly boards = new Observable<Leaderboards>({ individual: [], teams: [] });
  /** The signed-in player's own counted runs, best first. */
  readonly mine = new Observable<MyRun[]>([]);
  readonly loading = new Observable(false);
  readonly error = new Observable<string | null>(null);
  private request = 0;

  async refresh(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [individual, teams, mine] = await Promise.all([
        rpc<RawIndividualRow[]>('get_individual_leaderboard', { p_limit: LIMIT }),
        rpc<RawTeamRow[]>('get_team_leaderboard', { p_limit: LIMIT }),
        rpc<RawMyRun[]>('get_my_runs', { p_limit: LIMIT }),
      ]);
      if (request !== this.request) return;
      this.boards.set({ individual: (individual ?? []).map(toIndividualRow), teams: (teams ?? []).map(toTeamRow) });
      this.mine.set((mine ?? []).map(toMyRun));
    } catch (error) {
      if (request === this.request) this.error.set(errorText(error));
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
