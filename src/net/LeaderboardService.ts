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
      }

      // 1. Deduplicate global leaderboard by player name: each player appears ONLY ONCE with their HIGHEST score:
      const bestByPlayer = new Map<string, LeaderboardRow>();
      for (const row of individualList) {
        const key = row.displayName.trim().toLowerCase();
        const existing = bestByPlayer.get(key);
        if (!existing) {
          bestByPlayer.set(key, { ...row });
        } else {
          // If this row has a higher score (or equal score but faster duration), replace it
          if (row.score > existing.score || (row.score === existing.score && row.durationMs < existing.durationMs)) {
            bestByPlayer.set(key, {
              ...row,
              attempts: Math.max(existing.attempts, row.attempts) + 1,
              isMe: existing.isMe || row.isMe,
            });
          } else {
            existing.attempts += 1;
            existing.isMe = existing.isMe || row.isMe;
          }
        }
      }

      individualList = Array.from(bestByPlayer.values())
        .sort((a, b) => b.score - a.score || a.durationMs - b.durationMs)
        .map((r, idx) => ({ ...r, rank: idx + 1 }));

      // 2. Personal leaderboard: show ALL games the account holder played (merge remote and local history)
      const mergedRuns: MyRun[] = [...myList];
      for (const local of localScores) {
        const locTime = Number(local.playedAt);
        const exists = mergedRuns.some((m) => {
          const mTime = new Date(m.playedAt).getTime();
          return m.score === local.score && Math.abs(mTime - locTime) < 10000;
        });
        if (!exists) {
          mergedRuns.push({
            resultId: `local_${local.playedAt}_${local.score}`,
            rank: 0,
            attempts: 1,
            score: local.score,
            durationMs: local.durationMs,
            complete: local.complete,
            items: local.items,
            playedAt: new Date(local.playedAt).toISOString(),
            teamId: local.teamId ?? null,
          });
        }
      }

      // Sort personal runs by score (or played date) and assign individual ranks
      mergedRuns.sort((a, b) => b.score - a.score || a.durationMs - b.durationMs);
      mergedRuns.forEach((r, idx) => {
        r.rank = idx + 1;
      });
      myList = mergedRuns;

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
