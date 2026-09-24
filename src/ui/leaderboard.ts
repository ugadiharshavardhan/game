/**
 * The local best-scores list, kept in this browser. (An online board needs the backend from
 * GAME_DESIGN.md §1; until then a player's own runs are worth keeping.)
 */
import type { LeaderboardEntry } from '../shared/types';

const KEY = 'moonlight-seva.scores';
const KEEP = 8;

export function loadScores(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LeaderboardEntry[]) : [];
    if (!Array.isArray(list)) return [];

    // Deduplicate runs so identical games are only recorded once
    const seen = new Set<string>();
    const deduplicated: LeaderboardEntry[] = [];
    for (const item of list) {
      if (typeof item?.score !== 'number') continue;
      const key = item.playedAt
        ? `${Math.floor(item.playedAt / 2000)}_${item.score}_${item.durationMs}`
        : `${item.score}_${item.durationMs}_${item.displayName ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(item);
      }
    }
    return deduplicated.slice(0, KEEP);
  } catch {
    return [];
  }
}

/** Saves a run without duplicates and returns the list with it in place (and its rank, 1-based). */
export function saveScore(entry: LeaderboardEntry): { scores: LeaderboardEntry[]; rank: number } {
  const existing = loadScores();
  // Check if identical run is already recorded
  const isDuplicate = existing.some(
    (e) =>
      (entry.playedAt && e.playedAt && Math.abs(e.playedAt - entry.playedAt) < 3000 && e.score === entry.score) ||
      (e.score === entry.score && e.durationMs === entry.durationMs && e.playedAt === entry.playedAt),
  );

  const updated = isDuplicate ? existing : [...existing, entry];
  const scores = updated.sort((a, b) => b.score - a.score).slice(0, KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(scores));
  } catch {
    // Private mode: the run still shows its score, it just isn't kept.
  }
  const foundIdx = scores.findIndex(
    (e) => e.score === entry.score && Math.abs((e.playedAt ?? 0) - (entry.playedAt ?? 0)) < 3000,
  );
  return { scores, rank: foundIdx >= 0 ? foundIdx + 1 : 1 };
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
