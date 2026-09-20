import { useState } from 'react';
import { CAMPUSES } from './campuses';

interface NameGateProps {
  initialName?: string;
  initialCampus?: string;
  onEnter: (name: string, campus: string) => void;
}

/**
 * The whole of signing in: a name, and a campus if the player wants one.
 *
 * No account, no password, no email, no verification — you type a name and you are playing. The
 * id that tells two Harshas apart is made quietly in the background and never shown unless asked
 * for.
 */
export function NameGate({ initialName = '', initialCampus = '', onEnter }: NameGateProps) {
  const [name, setName] = useState(initialName);
  const [campus, setCampus] = useState(initialCampus);
  const ready = name.trim().length > 0;

  return (
    <form
      className="w-full max-w-sm text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onEnter(name, campus);
      }}
    >
      <label className="block text-[10px] uppercase tracking-[0.3em] text-dusk-400" htmlFor="player-name">
        Your name
      </label>
      <input
        id="player-name"
        autoFocus
        value={name}
        maxLength={16}
        onChange={(e) => setName(e.target.value)}
        placeholder="Harsha"
        className="mt-2 w-full rounded-xl border border-night-700 bg-night-950/70 px-4 py-3 font-display text-lg text-lamp-200 placeholder:text-dusk-400/50 focus:border-lamp-400 focus:outline-none"
      />

      <label className="mt-5 block text-[10px] uppercase tracking-[0.3em] text-dusk-400" htmlFor="player-campus">
        Campus <span className="tracking-normal text-dusk-400/60">· optional</span>
      </label>
      <input
        id="player-campus"
        list="campus-list"
        value={campus}
        maxLength={24}
        onChange={(e) => setCampus(e.target.value)}
        placeholder="Hyderabad"
        className="mt-2 w-full rounded-xl border border-night-700 bg-night-950/70 px-4 py-2.5 text-sm text-lamp-200 placeholder:text-dusk-400/50 focus:border-lamp-400 focus:outline-none"
      />
      <datalist id="campus-list">
        {CAMPUSES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <button
        type="submit"
        disabled={!ready}
        className="mt-7 w-full rounded-xl bg-lamp-400 px-6 py-3.5 font-display text-lg text-night-950 transition hover:bg-lamp-200 disabled:cursor-not-allowed disabled:bg-night-700 disabled:text-dusk-400 active:scale-[0.98]"
      >
        Enter the village
      </button>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-dusk-400/80">
        No account, no password. Your name is kept in this browser.
      </p>
    </form>
  );
}
