import { useState } from 'react';
import type { NightPhase } from '../../shared/types';
import { useGameEvent } from '../hooks/useGameEvent';

interface Night {
  label: string;
  t: number;
  phase: NightPhase;
  minutesLeft: number;
}

/**
 * The one number the game is allowed to count down.
 *
 * The moon is read from the sky — that is the whole point of it — but 05:00 is a promise the run
 * makes to the player in its first minute, and a promise you cannot see is just a trap. So: the
 * hour on the village's own clock, and a bar that fills once across the night, from the last of
 * the evening to the first of the morning.
 *
 * It only ever raises its voice at the end, when the sky has already started to do it too.
 */
export function NightClockUI() {
  const [night, setNight] = useState<Night>({ label: '6:30 PM', t: 0, phase: 'evening', minutesLeft: 630 });

  useGameEvent('ui:night', (n) =>
    setNight((prev) => (prev.phase === n.phase && Math.abs(prev.t - n.t) < 0.002 && prev.label === n.label ? prev : n)),
  );

  const dawn = night.phase === 'dawn';
  const hoursLeft = Math.floor(night.minutesLeft / 60);
  const left = hoursLeft > 0 ? `${hoursLeft}h ${night.minutesLeft % 60}m` : `${night.minutesLeft}m`;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 backdrop-blur-md transition-colors duration-700 ${
        dawn ? 'border-lamp-400/60 bg-[#2a1c1a]/70' : 'border-night-700/60 bg-night-950/45'
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className={dawn ? 'text-lamp-300' : 'text-dusk-400'}>
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.3" />
        <path d="M8 4.2V8l2.6 1.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>

      <span className="leading-tight">
        <span className={`block text-[11px] tabular-nums tracking-[0.12em] ${dawn ? 'text-lamp-200' : 'text-lamp-200/85'}`}>
          {night.label}
        </span>
        <span className={`block text-[10px] uppercase tracking-[0.18em] ${dawn ? 'animate-pulse text-lamp-300' : 'text-dusk-400'}`}>
          {dawn ? `${left} to sunrise` : `${left} till 5 AM`}
        </span>
      </span>

      {/* The night, filling once, left to right. */}
      <span className="relative h-1 w-16 overflow-hidden rounded-full bg-night-700/70">
        <span
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-linear ${
            dawn ? 'bg-lamp-400' : 'bg-dusk-400/80'
          }`}
          style={{ width: `${Math.min(Math.max(night.t, 0), 1) * 100}%` }}
        />
      </span>
    </div>
  );
}
