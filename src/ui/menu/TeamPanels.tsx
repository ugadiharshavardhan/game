import { useEffect, useState } from 'react';
import { isTeamCode, normaliseTeamCode, TEAM_CODE_LENGTH } from '../../shared/identity';
import { useTeam } from '../hooks/useTeam';
import { services } from '../services';

/** Making a team: a name, and — once the database has it — the code to share. */
export function CreateTeam({ onBack }: { onBack: () => void }) {
  const { team, busy, error, createTeam } = useTeam();
  const [name, setName] = useState('');
  const creating = busy === 'creating';

  useEffect(() => services().teams.clearError(), []);

  if (team) return <TeamLobby onLeave={onBack} />;

  return (
    <form
      className="w-full max-w-sm text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (!creating) void createTeam(name);
      }}
    >
      <label className="block text-[10px] uppercase tracking-[0.3em] text-dusk-400" htmlFor="team-name">
        Team name
      </label>
      <input
        id="team-name"
        autoFocus
        value={name}
        maxLength={24}
        disabled={creating}
        onChange={(e) => setName(e.target.value)}
        placeholder="Moon Walkers"
        className="mt-2 w-full rounded-xl border border-night-700 bg-night-950/70 px-4 py-3 font-display text-lg text-lamp-200 placeholder:text-dusk-400/50 focus:border-lamp-400 focus:outline-none"
      />
      {error && <p className="mt-3 text-xs text-[#d98a7a]">{error}</p>}
      <button
        type="submit"
        disabled={creating}
        className="mt-6 w-full rounded-xl bg-lamp-400 px-6 py-3.5 font-display text-lg text-night-950 transition hover:bg-lamp-200 disabled:cursor-wait disabled:bg-night-700 disabled:text-dusk-400 active:scale-[0.98]"
      >
        {creating ? 'Creating…' : 'Create team'}
      </button>
      <button type="button" onClick={onBack} className="mt-3 w-full rounded-xl border border-night-700 px-6 py-2.5 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200">
        Back
      </button>
    </form>
  );
}

/** Joining a team: six characters, however they were written down. */
export function JoinTeam({ onBack }: { onBack: () => void }) {
  const { team, busy, error, joinTeam } = useTeam();
  const [code, setCode] = useState('');
  const tidy = normaliseTeamCode(code);
  const joining = busy === 'joining';

  useEffect(() => services().teams.clearError(), []);

  if (team) return <TeamLobby onLeave={onBack} />;

  return (
    <form
      className="w-full max-w-sm text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (!joining && isTeamCode(tidy)) void joinTeam(tidy);
      }}
    >
      <label className="block text-[10px] uppercase tracking-[0.3em] text-dusk-400" htmlFor="team-code">
        Team code
      </label>
      <input
        id="team-code"
        autoFocus
        value={code}
        maxLength={12}
        disabled={joining}
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setCode(e.target.value)}
        placeholder="MS7K2P"
        className="mt-2 w-full rounded-xl border border-night-700 bg-night-950/70 px-4 py-3 text-center font-display text-2xl uppercase tracking-[0.3em] text-lamp-200 placeholder:text-dusk-400/40 focus:border-lamp-400 focus:outline-none"
      />
      {!error && tidy.length > 0 && tidy.length < TEAM_CODE_LENGTH && (
        <p className="mt-2 text-[11px] text-dusk-400">{TEAM_CODE_LENGTH - tidy.length} more character{TEAM_CODE_LENGTH - tidy.length === 1 ? '' : 's'}</p>
      )}
      {error && <p className="mt-3 text-xs text-[#d98a7a]">{error}</p>}
      <button
        type="submit"
        disabled={!isTeamCode(tidy) || joining}
        className="mt-6 w-full rounded-xl bg-lamp-400 px-6 py-3.5 font-display text-lg text-night-950 transition hover:bg-lamp-200 disabled:bg-night-700 disabled:text-dusk-400 active:scale-[0.98]"
      >
        {joining ? 'Joining…' : 'Join team'}
      </button>
      <button type="button" onClick={onBack} className="mt-3 w-full rounded-xl border border-night-700 px-6 py-2.5 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200">
        Back
      </button>
    </form>
  );
}

/**
 * The lobby: the code to share, who has arrived, who is ready, and the button that opens the
 * village for all of them at once. Everything on it is the database's, refreshed live.
 */
export function TeamLobby({ onLeave }: { onLeave: () => void }) {
  const { team, members, me, isHost, lobby, online, channelStatus, busy, error, notice, teamResult, session, setReady, startGame, leaveTeam } = useTeam();
  const [copied, setCopied] = useState<'code' | 'shared' | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  if (!team) return null;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(team.code);
      setCopied('code');
    } catch (error) {
      console.warn('[lobby] clipboard unavailable', error);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: 'Moonlight Seva', text: `Join my team "${team.name}" in Moonlight Seva with code ${team.code}` });
      setCopied('shared');
    } catch {
      // Dismissed.
    }
  };

  const roleLabel = (role: string, userId: string) =>
    role === 'creator' ? 'Creator' : userId === team.hostId || role === 'host' ? 'Host' : null;

  return (
    <div className="w-full max-w-sm text-left">
      {notice && (
        <p role="status" className="mb-4 rounded-lg border border-lamp-400/30 bg-lamp-400/10 px-3 py-2 text-center text-xs text-lamp-200">
          {notice}
        </p>
      )}

      <p className="text-[10px] uppercase tracking-[0.3em] text-dusk-400">Team</p>
      <h2 className="mt-1 font-display text-2xl uppercase text-lamp-200">{team.name}</h2>
      {team.creatorName && <p className="mt-0.5 text-[11px] text-dusk-400">Created by {team.creatorName}</p>}

      <div className="mt-4 flex items-stretch gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex flex-1 items-center justify-between rounded-xl border border-lamp-400/30 bg-night-950/60 px-4 py-3 text-left transition hover:border-lamp-400"
        >
          <span>
            <span className="block text-[10px] uppercase tracking-[0.3em] text-dusk-400">Team code</span>
            <span className="font-display text-2xl tracking-[0.2em] text-lamp-400">{team.code}</span>
          </span>
          <span className="text-[11px] uppercase tracking-widest text-dusk-400">{copied === 'code' ? 'Copied' : 'Copy'}</span>
        </button>
        {canShare && (
          <button
            type="button"
            onClick={share}
            className="rounded-xl border border-lamp-400/30 bg-night-950/60 px-4 text-[11px] uppercase tracking-widest text-dusk-400 transition hover:border-lamp-400 hover:text-lamp-200"
          >
            {copied === 'shared' ? 'Sent' : 'Share'}
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-dusk-400">Share this code with your friends — they can join from any device.</p>

      <div className="mt-5 flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[0.3em] text-dusk-400">Players</p>
        <p className="text-xs tabular-nums text-lamp-200">
          {members.length} / {team.maxMembers}
        </p>
      </div>
      <ul className="mt-2 space-y-1.5">
        {members.map((m) => {
          const label = roleLabel(m.role, m.userId);
          const here = online.has(m.userId);
          return (
            <li key={m.userId} className="flex items-center gap-3 rounded-lg bg-night-900/60 px-3 py-2 text-sm">
              <span className={`w-4 shrink-0 text-center ${m.isReady ? 'text-lamp-400' : 'text-dusk-400'}`} aria-label={m.isReady ? 'Ready' : 'Not ready'}>
                {m.isReady ? '✓' : '○'}
              </span>
              <span className="flex-1 truncate text-lamp-200">
                {m.displayName}
                {m.userId === me?.userId && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-lamp-400">you</span>}
                {label && <span className="ml-2 text-[10px] uppercase tracking-widest text-dusk-400">— {label}</span>}
              </span>
              <span
                title={here ? 'Online' : 'Offline'}
                className={`h-2 w-2 shrink-0 rounded-full ${here ? 'bg-lamp-400' : 'bg-night-700'}`}
              />
              <span className={`w-16 text-right text-[10px] uppercase tracking-[0.2em] ${m.isReady ? 'text-lamp-400' : 'text-dusk-400'}`}>
                {m.isReady ? 'Ready' : 'Joined'}
              </span>
            </li>
          );
        })}
        {Array.from({ length: Math.max(0, team.maxMembers - members.length) }).map((_, i) => (
          <li key={`empty-${i}`} className="flex items-center gap-3 rounded-lg border border-dashed border-night-700 px-3 py-2 text-xs text-dusk-400/70">
            <span className="w-4 text-center">○</span>
            Waiting for player…
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-dusk-400">Everyone plays their own puja in the same village.</p>

      {teamResult && session && session.status !== 'lobby' && (
        <p className="mt-3 rounded-lg bg-night-900/60 px-3 py-2 text-[11px] text-dusk-400">
          {session.status === 'in_progress' ? 'This round so far' : 'Last round'}: team score{' '}
          <span className="font-display text-sm tabular-nums text-lamp-400">{teamResult.teamScore}</span> · {teamResult.completedPlayers} completed
        </p>
      )}

      {error && <p className="mt-3 text-xs text-[#d98a7a]">{error}</p>}
      {channelStatus === 'offline' && <p className="mt-3 text-xs text-[#d98a7a]">Reconnecting to your team…</p>}

      <button
        type="button"
        disabled={busy === 'readying'}
        onClick={() => void setReady(!me?.isReady)}
        className={`mt-5 w-full rounded-xl px-6 py-3 font-display text-lg transition active:scale-[0.98] disabled:opacity-60 ${
          me?.isReady ? 'border border-lamp-400/50 text-lamp-200' : 'bg-lamp-400 text-night-950 hover:bg-lamp-200'
        }`}
      >
        {me?.isReady ? 'Ready ✓ — tap to undo' : 'Ready'}
      </button>

      {isHost ? (
        <button
          type="button"
          onClick={() => void startGame()}
          disabled={!lobby.canStart || busy === 'starting'}
          className="mt-3 w-full rounded-xl border border-lamp-400/40 bg-lamp-400/10 px-6 py-3 font-display text-lg text-lamp-200 transition hover:bg-lamp-400/20 disabled:border-night-700 disabled:bg-transparent disabled:text-dusk-400/70 active:scale-[0.98]"
        >
          {busy === 'starting' ? 'Starting…' : 'Start game'}
        </button>
      ) : null}
      {!lobby.canStart && lobby.reason && <p className="mt-2 text-center text-[11px] text-dusk-400">{lobby.reason}</p>}

      <button
        type="button"
        disabled={busy === 'leaving'}
        onClick={async () => {
          if (await leaveTeam()) onLeave();
        }}
        className="mt-4 w-full rounded-xl border border-night-700 px-6 py-2.5 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200 disabled:opacity-60"
      >
        {busy === 'leaving' ? 'Leaving…' : 'Leave team'}
      </button>
    </div>
  );
}