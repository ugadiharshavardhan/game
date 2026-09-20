import { useEffect, useState } from 'react';
import { isTeamCode, normaliseTeamCode } from '../../shared/identity';
import type { TeamState } from '../../shared/multiplayer';
import { services, useObservable } from '../services';

/** Making a team: a name, and the code that comes back to share with friends. */
export function CreateTeam({ onBack }: { onBack: () => void }) {
  const { teams } = services();
  const team = useObservable(teams.team);
  const error = useObservable(teams.error);
  const [name, setName] = useState('');

  if (team) return <TeamLobby onLeave={onBack} />;

  return (
    <form
      className="w-full max-w-sm text-left"
      onSubmit={(e) => {
        e.preventDefault();
        teams.create(name);
      }}
    >
      <label className="block text-[10px] uppercase tracking-[0.3em] text-dusk-400" htmlFor="team-name">
        Team name
      </label>
      <input
        id="team-name"
        autoFocus
        value={name}
        maxLength={20}
        onChange={(e) => setName(e.target.value)}
        placeholder="Moon Warriors"
        className="mt-2 w-full rounded-xl border border-night-700 bg-night-950/70 px-4 py-3 font-display text-lg text-lamp-200 placeholder:text-dusk-400/50 focus:border-lamp-400 focus:outline-none"
      />
      {error && <p className="mt-3 text-xs text-[#d98a7a]">{error}</p>}
      <button type="submit" className="mt-6 w-full rounded-xl bg-lamp-400 px-6 py-3.5 font-display text-lg text-night-950 transition hover:bg-lamp-200 active:scale-[0.98]">
        Create team
      </button>
      <button type="button" onClick={onBack} className="mt-3 w-full rounded-xl border border-night-700 px-6 py-2.5 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200">
        Back
      </button>
    </form>
  );
}

/** Joining a team: four letters, however they were written down. */
export function JoinTeam({ onBack }: { onBack: () => void }) {
  const { teams } = services();
  const team = useObservable(teams.team);
  const error = useObservable(teams.error);
  const [code, setCode] = useState('');
  const tidy = normaliseTeamCode(code);

  if (team) return <TeamLobby onLeave={onBack} />;

  return (
    <form
      className="w-full max-w-sm text-left"
      onSubmit={(e) => {
        e.preventDefault();
        teams.join(code);
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
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => setCode(e.target.value)}
        placeholder="MOON-7K4P"
        className="mt-2 w-full rounded-xl border border-night-700 bg-night-950/70 px-4 py-3 text-center font-display text-2xl tracking-[0.3em] text-lamp-200 placeholder:text-dusk-400/40 focus:border-lamp-400 focus:outline-none"
      />
      {error && <p className="mt-3 text-xs text-[#d98a7a]">{error}</p>}
      <button
        type="submit"
        disabled={!isTeamCode(tidy)}
        className="mt-6 w-full rounded-xl bg-lamp-400 px-6 py-3.5 font-display text-lg text-night-950 transition hover:bg-lamp-200 disabled:bg-night-700 disabled:text-dusk-400 active:scale-[0.98]"
      >
        Join team
      </button>
      <button type="button" onClick={onBack} className="mt-3 w-full rounded-xl border border-night-700 px-6 py-2.5 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200">
        Back
      </button>
    </form>
  );
}

/**
 * The lobby: the code to share, who has arrived, who is ready, and the button that opens the
 * village for all of them at once.
 */
export function TeamLobby({ onLeave }: { onLeave: () => void }) {
  const { teams, lobby, net } = services();
  const team = useObservable(teams.team);
  const error = useObservable(teams.error);
  const status = useObservable(net.status);
  const playerId = useObservable(teams.playerId);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  if (!team) return null;
  const me = team.members.find((m) => m.playerId === playerId);
  const check = lobby.status(team);
  const config = lobby.config;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(team.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="w-full max-w-sm text-left">
      <p className="text-[10px] uppercase tracking-[0.3em] text-dusk-400">Team</p>
      <h2 className="mt-1 font-display text-2xl text-lamp-200">{team.name}</h2>

      <button
        type="button"
        onClick={copy}
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-lamp-400/30 bg-night-950/60 px-4 py-3 text-left transition hover:border-lamp-400"
      >
        <span>
          <span className="block text-[10px] uppercase tracking-[0.3em] text-dusk-400">Team code</span>
          <span className="font-display text-2xl tracking-[0.2em] text-lamp-400">{team.code}</span>
        </span>
        <span className="text-[11px] uppercase tracking-widest text-dusk-400">{copied ? 'Copied' : 'Copy'}</span>
      </button>
      <p className="mt-2 text-[11px] text-dusk-400">
        Share this code with your friends{net.networked ? '' : ' — they can join from another tab on this device'}.
      </p>

      <ul className="mt-5 space-y-1.5">
        {team.members.map((m) => (
          <li key={m.playerId} className="flex items-center gap-3 rounded-lg bg-night-900/60 px-3 py-2 text-sm">
            <span className={`h-2 w-2 shrink-0 rounded-full ${m.online ? 'bg-lamp-400' : 'bg-night-700'}`} />
            <span className="flex-1 truncate text-lamp-200">
              {m.displayName}
              {m.playerId === team.hostId && <span className="ml-2 text-[10px] uppercase tracking-widest text-dusk-400">host</span>}
            </span>
            <span className={`text-[10px] uppercase tracking-[0.2em] ${m.ready ? 'text-lamp-400' : 'text-dusk-400'}`}>{m.ready ? 'Ready' : 'Not ready'}</span>
          </li>
        ))}
        {Array.from({ length: Math.max(0, config.minPlayers - team.members.length) }).map((_, i) => (
          <li key={`empty-${i}`} className="rounded-lg border border-dashed border-night-700 px-3 py-2 text-xs text-dusk-400/70">
            Waiting for a friend…
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-dusk-400">
        {team.members.length} of {config.maxPlayers} · everyone plays their own puja in the same village
      </p>

      {error && <p className="mt-3 text-xs text-[#d98a7a]">{error}</p>}
      {status !== 'online' && <p className="mt-3 text-xs text-[#d98a7a]">Reconnecting…</p>}

      <button
        type="button"
        onClick={() => lobby.setReady(!me?.ready)}
        className={`mt-5 w-full rounded-xl px-6 py-3 font-display text-lg transition active:scale-[0.98] ${
          me?.ready ? 'border border-lamp-400/50 text-lamp-200' : 'bg-lamp-400 text-night-950 hover:bg-lamp-200'
        }`}
      >
        {me?.ready ? 'Ready ✓' : 'Ready'}
      </button>

      <button
        type="button"
        onClick={() => lobby.start()}
        disabled={!check.canStart}
        className="mt-3 w-full rounded-xl border border-lamp-400/40 bg-lamp-400/10 px-6 py-3 font-display text-lg text-lamp-200 transition hover:bg-lamp-400/20 disabled:border-night-700 disabled:bg-transparent disabled:text-dusk-400/70 active:scale-[0.98]"
      >
        Start game
      </button>
      {!check.canStart && check.reason && <p className="mt-2 text-center text-[11px] text-dusk-400">{check.reason}</p>}

      <button
        type="button"
        onClick={() => {
          teams.leave();
          onLeave();
        }}
        className="mt-4 w-full rounded-xl border border-night-700 px-6 py-2.5 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200"
      >
        Leave team
      </button>
    </div>
  );
}

export type { TeamState };
