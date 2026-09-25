import { useEffect, useState } from 'react';
import type { RemotePeer } from '../../shared/multiplayer';
import { TOTAL_REQUIRED } from '../../shared/items';
import type { InventorySnapshot } from '../../shared/items';
import { services, useObservable } from '../services';

interface TeamHUDProps {
  snapshot: InventorySnapshot;
}

export function TeamHUD({ snapshot }: TeamHUDProps) {
  const { teams, sync, profiles } = services();
  const team = useObservable(teams.snapshot);
  const profile = useObservable(profiles.profile);
  const onlineUsers = useObservable(teams.channel.online);
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  // Poll peer state periodically from PlayerSyncService
  useEffect(() => {
    if (!team) return;
    const updatePeers = () => {
      setPeers(sync.peers());
    };
    updatePeers();
    const timer = setInterval(updatePeers, 350);
    return () => clearInterval(timer);
  }, [team, sync]);

  // If not in a team, don't render anything
  if (!team || !team.team) return null;

  const members = team.members ?? [];
  const maxMembers = team.team.maxMembers ?? 4;
  const teamCode = team.team.code;

  // Local player statistics
  let localOffered = 0;
  for (const count of Object.values(snapshot.offered)) {
    localOffered += count;
  }
  const localPercent = snapshot.pujaComplete ? 100 : Math.min(100, Math.round((localOffered / TOTAL_REQUIRED) * 100));
  const localCollected = snapshot.used;

  return (
    <aside
      aria-label="Team Players and Progress"
      className="safe-top pointer-events-none absolute right-3 top-[12.5rem] z-20 w-60 select-none sm:right-4 sm:top-[12.5rem] sm:w-68"
    >
      <div className="pointer-events-auto rounded-2xl border border-lamp-400/35 bg-night-950/85 p-3 shadow-2xl shadow-black/60 backdrop-blur-md transition-all duration-200">
        {/* Header: Team name, joined count, and collapse button */}
        <div className="flex items-center justify-between gap-1 border-b border-night-800 pb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">👥</span>
              <h2 className="truncate font-display text-xs font-bold tracking-wide text-lamp-200">
                {team.team.name || 'Team Seva'}
              </h2>
            </div>
            <p className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-dusk-400">
              Code: <span className="font-mono font-bold text-lamp-400">{teamCode}</span> ·{' '}
              <span className="text-lamp-300 font-semibold">{members.length}/{maxMembers} Joined</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand team roster' : 'Collapse team roster'}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-night-700 bg-night-900/80 text-[10px] text-dusk-300 transition hover:border-lamp-400/40 hover:text-lamp-200"
          >
            {collapsed ? '▼' : '▲'}
          </button>
        </div>

        {/* Collapsed summary pill */}
        {collapsed ? (
          <div className="pt-2 text-center">
            <p className="text-[11px] font-medium text-lamp-200">
              You: <span className="font-bold text-lamp-400">{localPercent}%</span> · {members.length} player{members.length === 1 ? '' : 's'}
            </p>
          </div>
        ) : (
          /* Full player list with usernames, collected items, offering completion percentage, and online/offline status */
          <ul className="mt-2.5 space-y-2.5">
            {members.map((member) => {
              const isLocal = member.userId === profile?.id;
              const peer = isLocal ? null : peers.find((p) => p.playerId === member.userId);

              // Live online vs offline status
              const isOnline = isLocal || onlineUsers.has(member.userId) || (peer !== undefined && peer !== null && peer.presence > 0.05);
              const isPlaying = isLocal || (isOnline && peer !== undefined && peer !== null && peer.presence > 0.05);

              // Gather player stats
              const displayName = isLocal
                ? profile?.displayName || member.displayName || 'You'
                : member.displayName || peer?.displayName || 'Teammate';

              const collected = isLocal ? localCollected : (peer?.collected ?? 0);
              const offered = isLocal ? localOffered : (peer?.given ?? 0);
              const percent = isLocal ? localPercent : (peer?.completionPercent ?? Math.min(100, Math.round((offered / TOTAL_REQUIRED) * 100)));
              const isComplete = percent >= 100;
              const isHost = member.userId === team.team.creatorId;

              // Live activity tag
              const activityLabel = isLocal
                ? isComplete
                  ? '🙏 Complete'
                  : 'Active'
                : !isOnline
                  ? 'Went Offline'
                  : peer?.indoors
                    ? '🏠 In Shelter'
                    : isComplete
                      ? '🙏 Complete'
                      : peer
                        ? '🌿 In Village'
                        : 'Connecting...';

              return (
                <li
                  key={member.userId}
                  className={`rounded-xl border p-2 text-xs transition ${
                    isLocal
                      ? 'border-lamp-400/50 bg-lamp-400/10 shadow-sm shadow-lamp-400/10'
                      : !isOnline
                        ? 'border-rose-900/40 bg-night-950/80 opacity-75'
                        : isPlaying
                          ? 'border-emerald-500/30 bg-night-900/80'
                          : 'border-night-800 bg-night-900/60'
                  }`}
                >
                  {/* Top row: username, online status indicator & completion percentage */}
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-semibold text-lamp-200">
                        {displayName}
                      </span>
                      {isLocal && (
                        <span className="rounded bg-lamp-400/25 px-1 py-0.2 text-[8px] font-bold uppercase tracking-wider text-lamp-300">
                          You
                        </span>
                      )}
                      {isHost && !isLocal && (
                        <span className="text-[10px]" title="Team Host">
                          👑
                        </span>
                      )}

                      {/* Online / Playing status indicator badge */}
                      {isLocal ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Playing
                        </span>
                      ) : isPlaying ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Playing
                        </span>
                      ) : isOnline ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-semibold text-amber-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[8px] font-bold text-rose-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                          Went Offline
                        </span>
                      )}
                    </div>

                    <span
                      className={`font-display text-xs font-bold tabular-nums ${
                        isComplete ? 'text-amber-300' : 'text-lamp-400'
                      }`}
                    >
                      {percent}%
                    </span>
                  </div>

                  {/* Progress Bar based on temple offerings */}
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-night-800">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isComplete
                          ? 'bg-gradient-to-r from-amber-400 to-yellow-300 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                          : 'bg-gradient-to-r from-amber-600 via-lamp-400 to-amber-300'
                      }`}
                      style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
                    />
                  </div>

                  {/* Bottom row: collected things and offerings in temple */}
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-dusk-300">
                    <span className="flex items-center gap-1">
                      <span title="Collected items in bag">🎒 {collected}</span>
                      <span className="text-dusk-400">·</span>
                      <span title="Offerings completed in temple">{offered}/{TOTAL_REQUIRED} offered</span>
                    </span>

                    <span className="text-[9px] uppercase tracking-wider text-dusk-400">
                      {activityLabel}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
