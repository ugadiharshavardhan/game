import { useEffect, useState } from 'react';
import { formatDuration } from '../leaderboard';
import { services, useObservable } from '../services';

/**
 * Two boards that are never the same board: players, and teams. The individual one is a player's
 * single best valid run; the team one is its members' bests added up.
 */
export function Boards({ onBack, initial = 'individual' }: { onBack: () => void; initial?: 'individual' | 'teams' }) {
  const { boards, profiles } = services();
  const data = useObservable(boards.boards);
  const me = useObservable(profiles.profile)?.playerId;
  const loading = useObservable(boards.loading);
  const [tab, setTab] = useState(initial);

  useEffect(() => {
    boards.refresh();
  }, [boards]);

  const tabs: Array<['individual' | 'teams', string]> = [
    ['individual', 'Players'],
    ['teams', 'Teams'],
  ];

  return (
    <div className="w-full max-w-md text-left">
      <div className="flex gap-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg px-4 py-2 text-[11px] uppercase tracking-[0.25em] transition ${
              tab === id ? 'bg-lamp-400/15 text-lamp-200' : 'text-dusk-400 hover:text-lamp-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-[13rem]">
        {tab === 'individual' ? (
          data.individual.length === 0 ? (
            <Empty loading={loading} what="No runs yet. Play a night — finished or not, it will show up here." />
          ) : (
            <ol className="space-y-1">
              {data.individual.map((row) => (
                <li
                  key={row.playerId}
                  className={`flex items-baseline gap-3 rounded-lg px-3 py-2 text-sm ${row.playerId === me ? 'bg-lamp-400/15 ring-1 ring-lamp-400/40' : 'bg-night-900/60'}`}
                >
                  <span className="w-6 shrink-0 tabular-nums text-dusk-400">{row.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lamp-200">
                      {row.displayName}
                      {row.playerId === me && <span className="ml-1.5 text-[10px] uppercase tracking-[0.2em] text-lamp-400">you</span>}
                    </span>
                    {row.complete === false && (
                      <span className="block text-[10px] uppercase tracking-[0.18em] text-dusk-400">
                        Unfinished{typeof row.items === 'number' ? ` · ${row.items} offering${row.items === 1 ? '' : 's'} gathered` : ''}
                      </span>
                    )}
                  </span>
                  <span className="hidden w-28 truncate text-xs text-dusk-400 sm:block">{row.campus || '—'}</span>
                  <span className="w-16 text-right font-display tabular-nums text-lamp-400">{row.score}</span>
                  <span className="w-12 text-right text-xs tabular-nums text-dusk-400">{formatDuration(row.durationMs)}</span>
                </li>
              ))}
            </ol>
          )
        ) : data.teams.length === 0 ? (
          <Empty loading={loading} what="No teams have finished a run yet." />
        ) : (
          <ol className="space-y-1">
            {data.teams.map((row) => (
              <li key={row.code} className="flex items-baseline gap-3 rounded-lg bg-night-900/60 px-3 py-2 text-sm">
                <span className="w-6 shrink-0 tabular-nums text-dusk-400">{row.rank}</span>
                <span className="flex-1 truncate text-lamp-200">{row.name}</span>
                <span className="w-20 text-xs text-dusk-400">
                  {row.members} player{row.members === 1 ? '' : 's'}
                </span>
                <span className="w-16 text-right font-display tabular-nums text-lamp-400">{row.teamScore}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <button type="button" onClick={onBack} className="mt-5 w-full rounded-xl border border-night-700 px-6 py-2.5 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200">
        Back
      </button>
    </div>
  );
}

function Empty({ loading, what }: { loading: boolean; what: string }) {
  return <p className="px-3 py-10 text-center text-sm text-dusk-400">{loading ? 'Reading the board…' : what}</p>;
}
