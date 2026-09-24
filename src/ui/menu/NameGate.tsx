/**
 * The whole of signing in: Google via Clerk, then a display name (and optional campus).
 *
 * Clerk owns the account; the name and campus are saved to the player's row in `profiles`,
 * keyed by the Clerk user id, so they follow the account to every device.
 */
import { Show, SignInButton, UserButton, useUser } from '@clerk/react';
import { useEffect, useState } from 'react';
import { CAMPUSES } from './campuses';

interface NameGateProps {
  initialName?: string;
  initialCampus?: string;
  /** The saved profile is still being read. */
  loading?: boolean;
  saving?: boolean;
  error?: string | null;
  onEnter: (name: string, campus: string) => void;
}

export function NameGate({ initialName = '', initialCampus = '', loading = false, saving = false, error = null, onEnter }: NameGateProps) {
  const { isLoaded, user } = useUser();
  const googleName = user?.fullName?.trim() || user?.firstName?.trim() || '';
  const [name, setName] = useState(initialName || googleName);
  const [campus, setCampus] = useState(initialCampus);
  const ready = name.trim().length > 0 && !saving;

  useEffect(() => {
    if (!initialName && googleName) setName(googleName);
  }, [googleName, initialName]);

  if (!isLoaded || (user && loading)) {
    return <p className="text-center text-sm text-dusk-400">Loading…</p>;
  }

  return (
    <div className="w-full max-w-sm text-left">
      <Show when="signed-out">
        <p className="text-[10px] uppercase tracking-[0.3em] text-dusk-400">Sign in</p>
        <p className="mt-2 text-sm leading-relaxed text-lamp-200/70">
          Use your Google account to enter the village. Your score stays with you across devices.
        </p>
        <SignInButton mode="modal" forceRedirectUrl="/" signUpForceRedirectUrl="/">
          <button
            type="button"
            className="mt-7 w-full rounded-xl bg-lamp-400 px-6 py-3.5 font-display text-lg text-night-950 transition hover:bg-lamp-200 active:scale-[0.98]"
          >
            Continue with Google
          </button>
        </SignInButton>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-dusk-400/80">
          Google sign-in via Clerk. Email sign-in is also available in the modal.
        </p>
      </Show>

      <Show when="signed-in">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.3em] text-dusk-400">Signed in</p>
            <p className="truncate text-sm text-lamp-200/80">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
          <UserButton />
        </div>

        <form
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

          {error && <p className="mt-4 text-xs text-[#d98a7a]">{error}</p>}
          <button
            type="submit"
            disabled={!ready}
            className="mt-7 w-full rounded-xl bg-lamp-400 px-6 py-3.5 font-display text-lg text-night-950 transition hover:bg-lamp-200 disabled:cursor-not-allowed disabled:bg-night-700 disabled:text-dusk-400 active:scale-[0.98]"
          >
            {saving ? 'Saving…' : 'Enter the village'}
          </button>
        </form>
      </Show>
    </div>
  );
}
