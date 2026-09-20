import { useMemo, useState } from 'react';
import type { LeaderboardEntry, RunResult } from '../../shared/types';
import { formatDuration, saveScore } from '../leaderboard';

interface ResultsScreenProps {
  result: RunResult;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

/**
 * The run is over: what happened, what it scored, and what to do next. The numbers are the ones
 * the player felt — offerings gathered, doors reached in time, how far they walked, how long it
 * took — so the total reads as a story rather than a formula.
 */
export function ResultsScreen({ result, onPlayAgain, onMainMenu }: ResultsScreenProps) {
  const { stats, breakdown } = result;
  // Saved once, on the way in.
  const saved = useMemo(() => saveScore({ score: breakdown.total, durationMs: stats.durationMs, playedAt: result.completedAt }), [breakdown.total, stats.durationMs, result.completedAt]);
  const [showBoard, setShowBoard] = useState(false);

  const rows: [string, number][] = [
    ['Items', breakdown.items],
    ['Shelter', breakdown.shelter],
    ['Efficiency', breakdown.efficiency],
    ['Time bonus', breakdown.timeBonus],
    ['Penalties', breakdown.penalties],
  ];

  const facts: [string, string][] = [
    ['Offerings collected', `${stats.itemsCollected}`],
    ['Offerings lost', `${stats.itemsLost}`],
    ['Sheltered in time', `${stats.shelterEvents}`],
    ['Moonlight encounters', `${stats.moonlightEncounters}`],
    ['Time taken', formatDuration(stats.durationMs)],
    ['Route efficiency', `${Math.round(result.efficiency * 100)}%`],
  ];

  return (
    <main className="safe-top safe-bottom absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-night-950/95 px-5 py-8">
      <div className="w-full max-w-lg text-center">
        <p className="text-[10px] uppercase tracking-[0.45em] text-dusk-400">Moonlight Seva</p>
        <h1 className="mt-3 font-display text-3xl text-lamp-200 sm:text-4xl">
          Puja complete <span aria-hidden>🙏</span>
        </h1>
        <p className="mt-2 text-sm text-lamp-200/70">Every offering is before Bappa. Ganpati Bappa Morya!</p>

        {showBoard ? (
          <Board scores={saved.scores} rank={saved.rank} />
        ) : (
          <>
            <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-2 text-left text-xs">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-night-800/80 pb-1.5">
                  <dt className="text-dusk-400">{k}</dt>
                  <dd className="tabular-nums text-lamp-200">{v}</dd>
                </div>
              ))}
            </dl>

            <table className="mt-7 w-full text-left text-sm">
              <tbody>
                {rows.map(([label, value]) => (
                  <tr key={label} className="border-b border-night-800/60">
                    <th scope="row" className="py-1.5 font-normal uppercase tracking-[0.2em] text-[11px] text-dusk-400">
                      {label}
                    </th>
                    <td className={`py-1.5 text-right tabular-nums ${value < 0 ? 'text-[#d98a7a]' : 'text-lamp-200'}`}>{value}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="pt-3 font-display text-base text-lamp-200">
                    Total
                  </th>
                  <td className="pt-3 text-right font-display text-2xl tabular-nums text-lamp-400">{breakdown.total}</td>
                </tr>
              </tbody>
            </table>
            {saved.rank > 0 && <p className="mt-3 text-xs text-dusk-400">Your best-of-{saved.scores.length} rank on this device: #{saved.rank}</p>}
          </>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            autoFocus
            onClick={onPlayAgain}
            className="w-full rounded-xl bg-lamp-400 px-6 py-3.5 font-display text-lg text-night-950 transition hover:bg-lamp-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-lamp-400/40 active:scale-[0.98]"
          >
            Play again
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowBoard((v) => !v)}
              className="flex-1 rounded-xl border border-night-700 px-4 py-3 text-sm text-lamp-200/90 transition hover:border-lamp-400 active:scale-[0.98]"
            >
              {showBoard ? 'Back to results' : 'Leaderboard'}
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="flex-1 rounded-xl border border-night-700 px-4 py-3 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200 active:scale-[0.98]"
            >
              Main menu
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function Board({ scores, rank }: { scores: LeaderboardEntry[]; rank: number }) {
  return (
    <section className="mt-7 text-left">
      <h2 className="text-[10px] uppercase tracking-[0.3em] text-dusk-400">Best on this device</h2>
      <ol className="mt-3 space-y-1.5">
        {scores.map((s, i) => (
          <li
            key={`${s.playedAt}-${i}`}
            className={`flex items-baseline justify-between rounded-lg px-3 py-2 text-sm ${i + 1 === rank ? 'bg-lamp-400/15 text-lamp-200' : 'bg-night-900/60 text-lamp-200/75'}`}
          >
            <span className="tabular-nums text-dusk-400">#{i + 1}</span>
            <span className="font-display text-lg tabular-nums">{s.score}</span>
            <span className="text-xs tabular-nums text-dusk-400">
              {formatDuration(s.durationMs)} · {new Date(s.playedAt).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[11px] leading-relaxed text-dusk-400">
        Scores are kept in this browser. A shared leaderboard arrives with the backend.
      </p>
    </section>
  );
}
