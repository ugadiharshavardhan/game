import { useState } from 'react';
import type { ExposureLevel, MoonStateName } from '../../shared/types';
import { useGameEvent } from '../hooks/useGameEvent';

interface MoonInfo {
  state: MoonStateName;
  label: string;
  note?: string;
  progress: number;
  dangerous: boolean;
}

/**
 * The moon, quietly: a disc that clouds cover and uncover as the night turns, the sky in words,
 * and — only when it matters — the accessibility line ("Moonrise approaching", "Find shelter").
 * The village itself is the real warning; this is the small, readable confirmation of it.
 *
 * Exposure appears as a thin arc round the moon, and only once the moon has begun to catch you.
 */
export function MoonUI() {
  const [moon, setMoon] = useState<MoonInfo>({ state: 'safe', label: 'Clouds over the moon', progress: 0, dangerous: false });
  const [exposure, setExposure] = useState<{ value: number; level: ExposureLevel }>({ value: 0, level: 'calm' });

  useGameEvent('ui:moon', (m) => setMoon((prev) => (prev.state === m.state && Math.abs(prev.progress - m.progress) < 0.02 ? prev : m)));
  useGameEvent('ui:exposure', (e) =>
    setExposure((prev) => (prev.value === e.value && prev.level === e.level ? prev : { value: e.value, level: e.level })),
  );

  // How much of the moon is out: clouds thin through WARNING, clear by MOON_ACTIVE.
  const open =
    moon.state === 'safe' ? 0 : moon.state === 'warning' ? 0.25 * moon.progress : moon.state === 'rising' ? 0.25 + 0.75 * moon.progress : moon.state === 'fading' ? 1 - moon.progress : 1;
  const urgent = moon.state === 'rising' || exposure.level === 'warn' || exposure.level === 'danger';
  const ring = exposure.value > 1;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 backdrop-blur-md transition-colors duration-500 ${
        moon.dangerous ? 'border-[#5b6a9e]/70 bg-[#0d1530]/70' : 'border-night-700/60 bg-night-950/45'
      }`}
    >
      <span className="relative grid h-6 w-6 place-items-center">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="7" fill={open > 0.5 ? '#dce5ff' : '#9aa8d6'} opacity={0.35 + 0.65 * open} />
          {/* The clouds drawing back. */}
          <g fill="#1b2136" opacity={1 - open}>
            <ellipse cx="9" cy="15" rx="8" ry="4" />
            <ellipse cx="15" cy="13.5" rx="7" ry="4.5" />
          </g>
          {ring && (
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke={exposure.level === 'danger' ? '#9fb4ff' : '#c9d6ff'}
              strokeOpacity="0.9"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${(exposure.value / 100) * 62} 62`}
              transform="rotate(-90 12 12)"
            />
          )}
        </svg>
      </span>
      <span className="leading-tight">
        <span className={`block text-[11px] tracking-[0.12em] ${moon.dangerous ? 'text-[#cfd9ff]' : 'text-lamp-200/80'}`}>{moon.label}</span>
        {moon.note && (
          <span className={`block text-[10px] tracking-[0.18em] uppercase ${urgent ? 'animate-pulse text-[#9fb4ff]' : 'text-dusk-400'}`}>{moon.note}</span>
        )}
      </span>
    </div>
  );
}
