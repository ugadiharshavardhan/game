/**
 * The two boards, which are never the same board: players, and teams.
 *
 * Both are worked out in Postgres from the stored results — each player's best valid run, and
 * each team's best round — and only public columns come back (names, campus, scores, times).
 */
import type { IndividualLeaderboardRow, Leaderboards } from '../shared/multiplayer';
import { loadScores } from '../ui/leaderboard';
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
      let rawIndividual: RawIndividualRow[] | null = null;
      let rawTeams: RawTeamRow[] | null = null;
      try {
        const [individual, teams] = await Promise.all([
          rpc<RawIndividualRow[]>('get_individual_leaderboard', { p_limit: LIMIT }),
          rpc<RawTeamRow[]>('get_team_leaderboard', { p_limit: LIMIT }),
        ]);
        rawIndividual = individual;
        rawTeams = teams;
      } catch (rpcErr) {
        console.warn('[leaderboards] RPC query failed, will display local evaluated scores:', rpcErr);
      }

      if (request !== this.request) return;

      let individualList: IndividualLeaderboardRow[] = (rawIndividual ?? []).map(toIndividualRow);
      const teamList = (rawTeams ?? []).map(toTeamRow);

      // If remote returned no individual runs, display the evaluated solo runs saved locally:
      if (individualList.length === 0) {
        const localScores = loadScores();
        individualList = localScores.map((s, idx) => ({
          rank: idx + 1,
          userId: 'local_' + idx,
          displayName: s.displayName || 'Devotee',
          campus: s.campus || '',
          score: s.score,
          durationMs: s.durationMs,
          complete: !!s.pujaComplete,
          items: Math.min(10, Math.floor(s.score / 200)),
          attempts: 1,
          isMe: true,
        }));
      }

      // Deduplicate so each individual player appears only once with their single best score
      const seen = new Set<string>();
      const dedupedIndividual: IndividualLeaderboardRow[] = [];
      for (const row of individualList) {
        const key = row.displayName.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          dedupedIndividual.push(row);
        }
      }
      dedupedIndividual.forEach((row, i) => {
        row.rank = i + 1;
      });

      // Deduplicate teams so each team appears only once
      const teamSeen = new Set<string>();
      const dedupedTeams = teamList.filter((tm) => {
        const key = tm.name.toLowerCase().trim();
        if (teamSeen.has(key)) return false;
        teamSeen.add(key);
        return true;
      });
      dedupedTeams.forEach((t, i) => {
        t.rank = i + 1;
      });

      this.boards.set({ individual: dedupedIndividual, teams: dedupedTeams });
    } catch (error) {
      if (request === this.request) {
        const localScores = loadScores();
        if (localScores.length > 0) {
          const seen = new Set<string>();
          const dedupedIndividual: IndividualLeaderboardRow[] = [];
          for (const s of localScores) {
            const key = (s.displayName || 'Devotee').toLowerCase().trim();
            if (!seen.has(key)) {
              seen.add(key);
              dedupedIndividual.push({
                rank: dedupedIndividual.length + 1,
                displayName: s.displayName || 'Devotee',
                campus: s.campus || '',
                score: s.score,
                durationMs: s.durationMs,
                complete: !!s.pujaComplete,
                items: Math.min(10, Math.floor(s.score / 200)),
                attempts: 1,
                isMe: true,
              });
            }
          }
          this.boards.set({ individual: dedupedIndividual, teams: [] });
        } else {
          this.error.set(errorText(error));
        }
      }
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
