import { useEffect, useState } from 'react';
import { formatDuration } from '../leaderboard';
import { services, useObservable } from '../services';

export type BoardTab = 'personal' | 'global' | 'teams';

/**
 * Three distinct boards, all from Postgres:
 * 1. Personal: the signed-in player's own counted runs, best first.
 * 2. Global: every player's single best valid run.
 * 3. Teams: each team's single best round.
 */
export function Boards({ onBack, initial = 'global' }: { onBack: () => void; initial?: BoardTab | 'individual' }) {
  const { boards, profiles, teams } = services();
  const data = useObservable(boards.boards);
  const personalRuns = useObservable(boards.mine);
  const loading = useObservable(boards.loading);
  const error = useObservable(boards.error);
  const profile = useObservable(profiles.profile);
  const currentTeam = useObservable(teams.snapshot);
  const [tab, setTab] = useState<BoardTab>(initial === 'individual' ? 'global' : initial);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  useEffect(() => {
    void boards.refresh();
  }, [boards]);

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
            onClick={() => {
              setTab(id);
              setSelectedTeamId(null);
            }}
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
        {error ? (
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
            <Empty loading={loading} what="No personal runs recorded yet. Complete a night's seva to see your score!" />
          ) : (
            <div>
              <div className="mb-2.5 flex items-center justify-between px-1 text-[11px] text-dusk-400">
                <span>All Games Played ({personalRuns.length})</span>
                <span className="text-lamp-400">Best: {Math.max(...personalRuns.map((r) => r.score))} pts</span>
              </div>
              <ol className="space-y-1.5">
                {personalRuns.map((run) => (
                  <li
                    key={run.resultId}
                    className="flex items-baseline gap-3 rounded-lg border border-night-700/60 bg-night-900/70 px-3.5 py-2.5 text-sm transition hover:border-lamp-400/40"
                  >
                    <span className="w-6 shrink-0 font-bold tabular-nums text-lamp-400/80">#{run.rank}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-lamp-200">
                        {profile?.displayName || 'You'}
                        {run.teamId && <span className="ml-1.5 rounded bg-night-800 px-1 py-0.5 text-[9px] uppercase tracking-wider text-lamp-300">team</span>}
                      </span>
                      <span className="block text-[10px] uppercase tracking-[0.18em] text-dusk-400">
                        {run.complete ? 'Puja Complete 🙏' : `Unfinished · ${run.items} item${run.items === 1 ? '' : 's'}`}
                        {' · '}
                        {new Date(run.playedAt).toLocaleDateString()}
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
            </div>
          )
        ) : tab === 'global' ? (
          data.individual.length === 0 ? (
            <Empty loading={loading} what="No runs yet on the global board. Play a night — finished or not, it will show up here." />
          ) : (
            <div>
              <div className="mb-2.5 flex items-center justify-between px-1 text-[11px] text-dusk-400">
                <span>Top Devotees (Single Best Score)</span>
                <span className="text-lamp-400 font-medium">{data.individual.length} Players</span>
              </div>
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
            </div>
          )
        ) : data.teams.length === 0 ? (
          <Empty loading={loading} what="No teams have finished a round yet." />
        ) : (
          <div>
            <div className="mb-2.5 px-1 text-[11px] text-dusk-400">
              <span>Click a team to view detailed member contributions</span>
            </div>
            <ol className="space-y-2">
              {data.teams.map((row) => {
                const isSelected = selectedTeamId === row.teamId;
                const completionRate = Math.round((row.completedPlayers / Math.max(1, row.players)) * 100);
                const avgScore = Math.round(row.teamScore / Math.max(1, row.players));
                const isCurrentActiveTeam = currentTeam?.team.id === row.teamId;

                return (
                  <li
                    key={row.teamId}
                    className={`overflow-hidden rounded-xl border transition-all ${
                      row.isMine
                        ? 'border-lamp-400/50 bg-lamp-400/15 shadow-sm shadow-lamp-400/10'
                        : 'border-night-700/60 bg-night-900/70 hover:border-lamp-400/30'
                    }`}
                  >
                    {/* Clickable Header Card */}
                    <button
                      type="button"
                      onClick={() => setSelectedTeamId(isSelected ? null : row.teamId)}
                      className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition"
                      aria-expanded={isSelected}
                    >
                      <span className="w-6 shrink-0 font-bold tabular-nums text-lamp-400/90">#{row.rank}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate font-medium text-lamp-200">
                          {row.name}
                          {row.isMine && (
                            <span className="rounded bg-lamp-400/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-lamp-300">
                              yours
                            </span>
                          )}
                        </span>
                        <span className="block text-[10px] uppercase tracking-[0.16em] text-dusk-400">
                          {row.completedPlayers}/{row.players} completed ({completionRate}%)
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-display text-base font-bold tabular-nums text-lamp-400">
                          {row.teamScore.toLocaleString()}
                        </span>
                        <span className="block text-[10px] tabular-nums text-dusk-400">
                          {row.completionTimeMs === null ? 'In progress' : formatDuration(row.completionTimeMs)}
                        </span>
                      </span>
                      <span className={`text-xs text-dusk-400 transition-transform duration-200 ${isSelected ? 'rotate-180 text-lamp-400' : ''}`}>
                        ▼
                      </span>
                    </button>

                    {/* Detailed expanded breakdown */}
                    {isSelected && (
                      <div className="border-t border-night-800 bg-night-950/70 p-3.5 text-xs text-dusk-300 space-y-2.5 animate-fadeIn">
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded-lg bg-night-900/80 p-2 border border-night-800">
                            <span className="block text-[9px] uppercase tracking-wider text-dusk-400">Total Team Score</span>
                            <span className="font-display text-sm font-bold text-lamp-400">{row.teamScore.toLocaleString()} pts</span>
                          </div>
                          <div className="rounded-lg bg-night-900/80 p-2 border border-night-800">
                            <span className="block text-[9px] uppercase tracking-wider text-dusk-400">Avg per Member</span>
                            <span className="font-display text-sm font-bold text-lamp-300">{avgScore.toLocaleString()} pts</span>
                          </div>
                          <div className="rounded-lg bg-night-900/80 p-2 border border-night-800">
                            <span className="block text-[9px] uppercase tracking-wider text-dusk-400">Completion Time</span>
                            <span className="font-semibold text-lamp-200">
                              {row.completionTimeMs ? formatDuration(row.completionTimeMs) : 'In progress'}
                            </span>
                          </div>
                          <div className="rounded-lg bg-night-900/80 p-2 border border-night-800">
                            <span className="block text-[9px] uppercase tracking-wider text-dusk-400">Round Date</span>
                            <span className="font-semibold text-lamp-200">
                              {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : 'Recent'}
                            </span>
                          </div>
                        </div>

                        {/* Completion Progress Bar */}
                        <div>
                          <div className="mb-1 flex justify-between text-[10px] text-dusk-400">
                            <span>Puja Completion Rate</span>
                            <span className="font-bold text-lamp-300">{completionRate}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-night-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-300"
                              style={{ width: `${Math.max(4, Math.min(100, completionRate))}%` }}
                            />
                          </div>
                        </div>

                        {/* Member Roster if active session or team */}
                        {isCurrentActiveTeam && currentTeam?.members && currentTeam.members.length > 0 && (
                          <div className="pt-1">
                            <span className="block mb-1 text-[10px] uppercase tracking-wider text-dusk-400">
                              Roster Members ({currentTeam.members.length}):
                            </span>
                            <ul className="space-y-1">
                              {currentTeam.members.map((m) => (
                                <li key={m.userId} className="flex items-center justify-between rounded bg-night-900/50 px-2 py-1 text-[11px]">
                                  <span className="font-medium text-lamp-200">
                                    {m.displayName || 'Devotee'}
                                    {m.userId === currentTeam.team.creatorId && ' (Host 👑)'}
                                  </span>
                                  <span className="text-[10px] text-lamp-400">
                                    {m.isReady ? 'Ready ✓' : 'Lobby'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
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
