import { useEffect, useMemo, useState } from 'react';
import type { PlayerProfile, SessionPlayer, TeamSnapshot } from '../../shared/multiplayer';
import type { LeaderboardEntry, RunResult } from '../../shared/types';
import { formatDuration, saveScore } from '../leaderboard';
import { Boards } from '../menu/Boards';
import { services, useObservable } from '../services';

interface ResultsScreenProps {
  result: RunResult;
  profile: PlayerProfile | null;
  team: TeamSnapshot | null;
  /** The team round this run belonged to, or null for a solo run. */
  sessionId: string | null;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

/**
 * The run is over: what happened, what it scored, and what to do next.
 *
 * The number shown is the database's, not this browser's — the client's own arithmetic is only a
 * placeholder until the run comes back accepted, which is what stops a modified client writing
 * its own leaderboard entry. Alone, that is the local board; in a team, it is the player's score,
 * their team's total, and where the team stands.
 */
export function ResultsScreen({ result, profile, team, sessionId, onPlayAgain, onMainMenu }: ResultsScreenProps) {
  const { scores, sync } = services();
  const accepted = useObservable(scores.accepted);
  const rejected = useObservable(scores.rejected);
  const submitting = useObservable(scores.submitting);
  const { stats } = result;
  const breakdown = accepted?.breakdown ?? result.breakdown;
  const [view, setView] = useState<'result' | 'players' | 'teams'>('result');
  // The round's own roster, kept live by the team channel while teammates finish.
  const round = sessionId && team?.session?.id === sessionId ? team : null;

  // The device's own list is kept whatever the network does, so a solo player always has one.
  const local = useMemo(
    () => saveScore({ score: result.breakdown.total, durationMs: stats.durationMs, playedAt: result.completedAt }),
    [result.breakdown.total, stats.durationMs, result.completedAt],
  );

  // While you are reading your score your teammates are still out there. Their ghosts keep
  // arriving, so the panel below can show what they are doing rather than a row of dashes.
  const [live, setLive] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!round) return;
    const tick = setInterval(() => {
      const seen: Record<string, number> = {};
      for (const peer of sync.peers()) seen[peer.playerId] = Math.round(peer.presence * 100) / 100;
      setLive(seen);
    }, 1000);
    return () => clearInterval(tick);
  }, [round, sync]);

  if (view !== 'result') {
    return (
      <main className="safe-top safe-bottom absolute inset-0 z-40 flex overflow-y-auto bg-night-950/95 px-5">
        <div className="m-auto flex w-full max-w-md shrink-0 flex-col items-center py-8">
          <p className="mb-5 text-[10px] uppercase tracking-[0.45em] text-dusk-400">Moonlight Seva</p>
          <Boards initial={view === 'teams' ? 'teams' : 'individual'} onBack={() => setView('result')} />
        </div>
      </main>
    );
  }

  // Dawn ended the run instead of the puja doing it. Everything gathered still counts; the two
  // things that only a finished puja earns are shown as the zeroes they are, not hidden.
  const done = stats.pujaComplete;

  const rows: [string, number][] = [
    ['Items', breakdown.items],
    ['Shelter', breakdown.shelter],
    ['Efficiency', breakdown.efficiency],
    ['Puja complete', breakdown.completion],
    ['Time bonus', breakdown.timeBonus],
    ['Penalties', breakdown.penalties],
  ];

  const facts: [string, string][] = [
    ['Puja', done ? 'Completed' : 'Unfinished'],
    ['Offerings collected', `${stats.itemsCollected}`],
    ['Offerings lost', `${stats.itemsLost}`],
    ['Sheltered in time', `${stats.shelterEvents}`],
    ['Moonlight encounters', `${stats.moonlightEncounters}`],
    ['Time taken', formatDuration(stats.durationMs)],
    ['Route efficiency', `${Math.round(result.efficiency * 100)}%`],
  ];

  return (
    <main className="safe-top safe-bottom absolute inset-0 z-40 flex overflow-y-auto bg-night-950/95 px-5 py-8">
      <div className="m-auto w-full max-w-lg shrink-0 text-center">
        <p className="text-[10px] uppercase tracking-[0.45em] text-dusk-400">Moonlight Seva</p>
        <h1 className="mt-3 font-display text-3xl text-lamp-200 sm:text-4xl">
          {done ? (
            <>
              Puja complete <span aria-hidden>🙏</span>
            </>
          ) : (
            <>
              Dawn broke first <span aria-hidden>🌅</span>
            </>
          )}
        </h1>
        <p className="mt-2 text-sm text-lamp-200/70">
          {done
            ? `${profile ? `${profile.displayName} — every` : 'Every'} offering is before Bappa. Ganpati Bappa Morya!`
            : `It is five o’clock and the village is waking. ${missingKinds(stats)} Come back tonight.`}
        </p>

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
                <th scope="row" className="py-1.5 text-[11px] font-normal uppercase tracking-[0.2em] text-dusk-400">
                  {label}
                </th>
                <td className={`py-1.5 text-right tabular-nums ${value < 0 ? 'text-[#d98a7a]' : 'text-lamp-200'}`}>{value}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="pt-3 font-display text-base text-lamp-200">
                Your score
              </th>
              <td className="pt-3 text-right font-display text-2xl tabular-nums text-lamp-400">{breakdown.total}</td>
            </tr>
          </tbody>
        </table>

        {accepted && (
          <p className="mt-2 text-[11px] text-dusk-400">
            {accepted.personalBest ? 'A new personal best.' : `Your best is still ${accepted.bestScore}.`}
            {accepted.individualRank ? ` · #${accepted.individualRank} on the players’ board.` : ''}
          </p>
        )}
        {submitting && <p className="mt-2 text-[11px] text-dusk-400">Saving your score…</p>}
        {!submitting && !accepted && !rejected && !profile && <p className="mt-2 text-[11px] text-dusk-400">Sign in to put your runs on the board.</p>}
        {rejected && <p className="mt-2 text-[11px] text-[#d98a7a]">{rejected}</p>}
        {!round && local.rank > 0 && <p className="mt-1 text-[11px] text-dusk-400">Best of {local.scores.length} on this device: #{local.rank}</p>}

        {round && (
          <section className="mt-6 rounded-2xl border border-lamp-400/20 bg-night-900/50 p-4 text-left">
            <div className="flex items-baseline justify-between">
              <p className="font-display text-lg text-lamp-200">{round.team.name}</p>
              <p className="font-display text-xl tabular-nums text-lamp-400">{round.teamResult?.teamScore ?? accepted?.teamScore ?? '—'}</p>
            </div>
            <ul className="mt-3 space-y-1 text-xs">
              {round.sessionPlayers.map((p) => {
                const me = p.userId === profile?.id;
                return (
                  <li key={p.userId} className="flex items-baseline justify-between gap-3">
                    <span className={me ? 'text-lamp-200' : 'text-dusk-400'}>{p.displayName}</span>
                    <RoundState player={p} live={!me && (live[p.userId] ?? 0) > 0.05} />
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] text-dusk-400">
              {round.teamResult?.isFinal
                ? `Final: ${round.teamResult.completedPlayers} of ${round.sessionPlayers.length} completed the puja.`
                : 'Your team’s score grows as they finish — this stays up to date while you wait.'}
            </p>
            {accepted?.teamRank && <p className="mt-3 text-[11px] text-dusk-400">Your team is #{accepted.teamRank} on the team board.</p>}
          </section>
        )}

        <div className="mt-8 flex flex-col gap-3">
          {/* A team round is counted once per player; the next one starts from the lobby. */}
          <button
            type="button"
            autoFocus
            onClick={sessionId ? onMainMenu : onPlayAgain}
            className="w-full rounded-xl bg-lamp-400 px-6 py-3.5 font-display text-lg text-night-950 transition hover:bg-lamp-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-lamp-400/40 active:scale-[0.98]"
          >
            {sessionId ? 'Back to lobby' : 'Play again'}
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={() => setView('players')} className="flex-1 rounded-xl border border-night-700 px-4 py-3 text-sm text-lamp-200/90 transition hover:border-lamp-400 active:scale-[0.98]">
              Players
            </button>
            <button type="button" onClick={() => setView('teams')} className="flex-1 rounded-xl border border-night-700 px-4 py-3 text-sm text-lamp-200/90 transition hover:border-lamp-400 active:scale-[0.98]">
              Teams
            </button>
            {!sessionId && (
              <button type="button" onClick={onMainMenu} className="flex-1 rounded-xl border border-night-700 px-4 py-3 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200 active:scale-[0.98]">
                {team ? 'Lobby' : 'Menu'}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export type { LeaderboardEntry };

function RoundState({ player, live }: { player: SessionPlayer; live: boolean }) {
  if (player.score !== null) {
    return (
      <span className="tabular-nums text-lamp-200/80">
        {player.score}
        {player.completed === false && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-dusk-400">dawn</span>}
      </span>
    );
  }
  if (player.completionState === 'abandoned') return <span className="text-dusk-400/60">left the round</span>;
  return <span className={live ? 'text-lamp-400/80' : 'text-dusk-400/60'}>{live ? 'still out there' : 'not finished'}</span>;
}

/** One plain sentence about how close the run got, for a night that ran out. */
function missingKinds(stats: { itemsCollected: number }): string {
  if (stats.itemsCollected === 0) return 'You gathered nothing before the moon and the hours took the night.';
  return `You gathered ${stats.itemsCollected} ${stats.itemsCollected === 1 ? 'offering' : 'offerings'}, but they never reached the temple.`;
}
