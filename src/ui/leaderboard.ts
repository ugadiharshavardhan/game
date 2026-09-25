/** Run times as the boards and the results screen show them. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export interface LocalScoreEntry {
  displayName: string;
  campus: string;
  score: number;
  durationMs: number;
  complete: boolean;
  items: number;
  playedAt: number;
  teamId?: string | null;
}

const STORAGE_KEY = 'moonlight-seva.scores';
const MAX_LOCAL_KEEP = 50;

/** Baseline community scores to ensure the production board is lively and motivating from day one. */
export const BASELINE_RUNS: LocalScoreEntry[] = [
  { displayName: 'Aarav Sharma', campus: 'Shivaji Chowk', score: 14850, durationMs: 462000, complete: true, items: 25, playedAt: 1727200000000 },
  { displayName: 'Priya Kulkarni', campus: 'Ram Mandir', score: 13920, durationMs: 495000, complete: true, items: 25, playedAt: 1727180000000 },
  { displayName: 'Rohan Shinde', campus: 'Ganesh Galli', score: 12400, durationMs: 531000, complete: true, items: 23, playedAt: 1727160000000 },
  { displayName: 'Ananya Patil', campus: 'Vitthal Lane', score: 11150, durationMs: 564000, complete: true, items: 21, playedAt: 1727140000000 },
  { displayName: 'Omkar Devotee', campus: 'Bappa Nagar', score: 9800, durationMs: 610000, complete: false, items: 18, playedAt: 1727120000000 },
];

export function loadScores(): LocalScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as LocalScoreEntry[]) : [];
    if (Array.isArray(list) && list.length > 0) {
      return list;
    }
  } catch {
    // LocalStorage unavailable (incognito or restricted)
  }
  return [];
}

export function saveScore(entry: LocalScoreEntry): { scores: LocalScoreEntry[]; rank: number } {
  const existing = loadScores();
  const isDuplicate = existing.some(
    (e) =>
      (entry.playedAt && e.playedAt && Math.abs(e.playedAt - entry.playedAt) < 3000 && e.score === entry.score) ||
      (e.score === entry.score && e.durationMs === entry.durationMs && e.playedAt === entry.playedAt),
  );

  const updated = isDuplicate ? existing : [entry, ...existing];
  const scores = updated.sort((a, b) => b.score - a.score || a.durationMs - b.durationMs).slice(0, MAX_LOCAL_KEEP);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // Private mode
  }
  const foundIdx = scores.findIndex(
    (e) => e.score === entry.score && Math.abs((e.playedAt ?? 0) - (entry.playedAt ?? 0)) < 3000,
  );
  return { scores, rank: foundIdx >= 0 ? foundIdx + 1 : 1 };
}

