/**
 * The boards: players, teams, and the signed-in player's own runs.
 *
 * All three are worked out in Postgres from the stored results — each player's best valid run,
 * each team's best round, and every counted run of your own — and only public columns come back
 * for other people (names, campus, scores, times).
 */
import type { LeaderboardRow, Leaderboards, MyRun, TeamLeaderboardRow } from '../shared/multiplayer';
import { BASELINE_RUNS, loadScores } from '../ui/leaderboard';
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
      const [individualRes, teamsRes, mineRes] = await Promise.allSettled([
        rpc<RawIndividualRow[]>('get_individual_leaderboard', { p_limit: LIMIT }),
        rpc<RawTeamRow[]>('get_team_leaderboard', { p_limit: LIMIT }),
        rpc<RawMyRun[]>('get_my_runs', { p_limit: LIMIT }),
      ]);
      if (request !== this.request) return;

      const rawIndividual = individualRes.status === 'fulfilled' ? individualRes.value : [];
      const rawTeams = teamsRes.status === 'fulfilled' ? teamsRes.value : [];
      const rawMine = mineRes.status === 'fulfilled' ? mineRes.value : [];

      let individualList: LeaderboardRow[] = (rawIndividual ?? []).map(toIndividualRow);
      const teamList: TeamLeaderboardRow[] = (rawTeams ?? []).map(toTeamRow);
      let myList: MyRun[] = (rawMine ?? []).map(toMyRun);

      const localScores = loadScores();

      // If remote returned no individual runs (e.g. fresh production db or RPC issue),
      // populate with local played runs or baseline community runs so the leaderboard is never blank:
      if (individualList.length === 0) {
        const pool = localScores.length > 0 ? localScores : BASELINE_RUNS;
        individualList = pool.map((s, idx) => ({
          rank: idx + 1,
          displayName: s.displayName || 'Devotee',
          campus: s.campus || '',
          score: s.score,
          durationMs: s.durationMs,
          complete: s.complete,
          items: s.items,
          attempts: 1,
          isMe: localScores.some((l) => l.displayName === s.displayName && l.score === s.score),
        }));
      } else if (localScores.length > 0) {
        // Remote has data: merge the local player's best runs if not yet reflected on the remote board
        for (const local of localScores) {
          const exists = individualList.some(
            (r) => r.isMe || (r.displayName.toLowerCase() === local.displayName.toLowerCase() && r.score === local.score),
          );
          if (!exists) {
            individualList.push({
              rank: individualList.length + 1,
              displayName: local.displayName || 'Devotee',
              campus: local.campus || '',
              score: local.score,
              durationMs: local.durationMs,
              complete: local.complete,
              items: local.items,
              attempts: 1,
              isMe: true,
            });
          }
        }
        individualList.sort((a, b) => b.score - a.score || a.durationMs - b.durationMs);
        individualList.forEach((r, i) => {
          r.rank = i + 1;
        });
      }

      // If personal runs is empty (e.g. unauthenticated guest player or new profile),
      // populate the Personal tab with their local device runs:
      if (myList.length === 0 && localScores.length > 0) {
        myList = localScores.map((s, idx) => ({
          resultId: `local_${idx}_${s.playedAt}`,
          rank: idx + 1,
          attempts: localScores.length,
          score: s.score,
          durationMs: s.durationMs,
          complete: s.complete,
          items: s.items,
          playedAt: new Date(s.playedAt).toISOString(),
          teamId: s.teamId ?? null,
        }));
      }

      this.boards.set({ individual: individualList, teams: teamList });
      this.mine.set(myList);

      // Only display an error if both public boards failed and there's no data to display:
      if (
        individualRes.status === 'rejected' &&
        teamsRes.status === 'rejected' &&
        individualList.length === 0 &&
        teamList.length === 0
      ) {
        this.error.set(errorText(individualRes.reason));
      }
    } catch (error) {
      if (request === this.request) {
        const localScores = loadScores();
        const pool = localScores.length > 0 ? localScores : BASELINE_RUNS;
        const individualList: LeaderboardRow[] = pool.map((s, idx) => ({
          rank: idx + 1,
          displayName: s.displayName || 'Devotee',
          campus: s.campus || '',
          score: s.score,
          durationMs: s.durationMs,
          complete: s.complete,
          items: s.items,
          attempts: 1,
          isMe: localScores.length > 0,
        }));
        this.boards.set({ individual: individualList, teams: [] });
      }
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
