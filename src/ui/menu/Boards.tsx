import { useEffect, useMemo, useState } from 'react';
import { formatDuration, loadScores } from '../leaderboard';
import { services, useObservable } from '../services';

export type BoardTab = 'personal' | 'global' | 'teams';

/**
 * Three distinct boards:
 * 1. Personal: The player's own past runs on this device / account, deduplicated.
 * 2. Global: The worldwide individual players board.
 * 3. Teams: Each team's single best round.
 */
export function Boards({ onBack, initial = 'global' }: { onBack: () => void; initial?: BoardTab | 'individual' }) {
  const { boards } = services();
  const data = useObservable(boards.boards);
  const loading = useObservable(boards.loading);
  const error = useObservable(boards.error);
  const [tab, setTab] = useState<BoardTab>(initial === 'individual' ? 'global' : initial);

  useEffect(() => {
    void boards.refresh();
  }, [boards]);

  // Load deduplicated local personal runs
  const personalRuns = useMemo(() => {
    const list = loadScores();
    const seen = new Set<string>();
    return list.filter((item) => {
      const key = `${item.score}_${item.durationMs}_${item.playedAt ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  const tabs: Array<[BoardTab, string]> = [
    ['personal', 'Personal'],
    ['global', 'Global'],
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
            className={`flex-1 rounded-lg px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] transition ${
              tab === id
                ? 'bg-lamp-400 text-night-950 shadow-md font-bold'
                : 'border border-night-700 bg-night-950/60 text-dusk-400 hover:border-lamp-400/50 hover:text-lamp-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-[14rem]">
        {error && tab !== 'personal' ? (
          <div className="px-3 py-10 text-center text-sm text-[#d98a7a]">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void boards.refresh()}
              className="mt-3 text-xs text-dusk-400 underline decoration-dotted underline-offset-2 hover:text-lamp-200"
            >
              Try again
            </button>
          </div>
        ) : tab === 'personal' ? (
          personalRuns.length === 0 ? (
            <Empty loading={false} what="No personal runs recorded yet. Complete a night's seva to see your score!" />
          ) : (
            <ol className="space-y-1.5">
              {personalRuns.map((run, idx) => (
                <li
                  key={`personal-${idx}-${run.playedAt ?? run.score}`}
                  className="flex items-baseline gap-3 rounded-lg border border-night-700/60 bg-night-900/70 px-3.5 py-2.5 text-sm transition hover:border-lamp-400/40"
                >
                  <span className="w-6 shrink-0 font-bold tabular-nums text-lamp-400/80">#{idx + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-lamp-200">
                      {run.displayName || 'You'}
                    </span>
                    <span className="block text-[10px] uppercase tracking-[0.18em] text-dusk-400">
                      {run.pujaComplete ? 'Puja Complete 🙏' : 'Unfinished Run'}
                      {run.campus ? ` · ${run.campus}` : ''}
                    </span>
                  </span>
                  <span className="w-16 text-right font-display text-base font-bold tabular-nums text-lamp-400">
                    {run.score}
                  </span>
                  <span className="w-12 text-right text-xs tabular-nums text-dusk-400">
                    {formatDuration(run.durationMs)}
                  </span>
                </li>
              ))}
            </ol>
          )
        ) : tab === 'global' ? (
          data.individual.length === 0 ? (
            <Empty loading={loading} what="No runs yet on the global board. Play a night — finished or not, it will show up here." />
          ) : (
            <ol className="space-y-1.5">
              {data.individual.map((row) => (
                <li
                  key={`global-${row.rank}-${row.displayName}`}
                  className={`flex items-baseline gap-3 rounded-lg px-3.5 py-2.5 text-sm transition ${
                    row.isMe
                      ? 'border border-lamp-400/50 bg-lamp-400/15 ring-1 ring-lamp-400/30'
                      : 'border border-night-700/50 bg-night-900/60'
                  }`}
                >
                  <span className="w-6 shrink-0 font-bold tabular-nums text-dusk-400">#{row.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-lamp-200">
                      {row.displayName}
                      {row.isMe && (
                        <span className="ml-1.5 rounded bg-lamp-400/20 px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider text-lamp-400">
                          you
                        </span>
                      )}
                    </span>
                    <span className="block text-[10px] uppercase tracking-[0.18em] text-dusk-400">
                      {row.complete ? 'Completed' : `Unfinished · ${row.items} offering${row.items === 1 ? '' : 's'}`}
                      {row.attempts > 1 ? ` · best of ${row.attempts}` : ''}
                    </span>
                  </span>
                  <span className="hidden w-24 truncate text-xs text-dusk-400 sm:block">{row.campus || '—'}</span>
                  <span className="w-16 text-right font-display text-base font-bold tabular-nums text-lamp-400">
                    {row.score}
                  </span>
                  <span className="w-12 text-right text-xs tabular-nums text-dusk-400">
                    {formatDuration(row.durationMs)}
                  </span>
                </li>
              ))}
            </ol>
          )
        ) : data.teams.length === 0 ? (
          <Empty loading={loading} what="No teams have finished a round yet." />
        ) : (
          <ol className="space-y-1.5">
            {data.teams.map((row) => (
              <li
                key={row.teamId}
                className={`flex items-baseline gap-3 rounded-lg px-3.5 py-2.5 text-sm transition ${
                  row.isMine
                    ? 'border border-lamp-400/50 bg-lamp-400/15 ring-1 ring-lamp-400/30'
                    : 'border border-night-700/50 bg-night-900/60'
                }`}
              >
                <span className="w-6 shrink-0 font-bold tabular-nums text-dusk-400">#{row.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-lamp-200">
                    {row.name}
                    {row.isMine && (
                      <span className="ml-1.5 rounded bg-lamp-400/20 px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider text-lamp-400">
                        yours
                      </span>
                    )}
                  </span>
                  <span className="block text-[10px] uppercase tracking-[0.18em] text-dusk-400">
                    {row.completedPlayers}/{row.players} completed
                  </span>
                </span>
                <span className="w-16 text-right font-display text-base font-bold tabular-nums text-lamp-400">
                  {row.teamScore}
                </span>
                <span className="w-12 text-right text-xs tabular-nums text-dusk-400">
                  {row.completionTimeMs === null ? '—' : formatDuration(row.completionTimeMs)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-5 w-full rounded-xl border border-night-700 bg-night-950/60 px-6 py-2.5 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200 active:scale-[0.98]"
      >
        Back
      </button>
    </div>
  );
}

function Empty({ loading, what }: { loading: boolean; what: string }) {
  return <p className="px-3 py-10 text-center text-sm text-dusk-400">{loading ? 'Reading the board…' : what}</p>;
}
