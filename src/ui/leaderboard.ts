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
    return Array.isArray(list) ? list.filter((e) => typeof e?.score === 'number').slice(0, KEEP) : [];
  } catch {
    return [];
  }
}

/** Saves a run and returns the list with it in place (and its rank, 1-based). */
export function saveScore(entry: LeaderboardEntry): { scores: LeaderboardEntry[]; rank: number } {
  const scores = [...loadScores(), entry].sort((a, b) => b.score - a.score).slice(0, KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(scores));
  } catch {
    // Private mode: the run still shows its score, it just isn't kept.
  }
  return { scores, rank: scores.indexOf(entry) + 1 };
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
