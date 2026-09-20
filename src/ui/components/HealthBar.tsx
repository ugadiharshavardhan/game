import { useState } from 'react';
import type { HealthLevel } from '../../shared/types';
import { useGameEvent } from '../hooks/useGameEvent';

interface Health {
  value: number;
  level: HealthLevel;
  draining: boolean;
}

/** Warm and steady while you are well; colder and paler the more the moon has taken. */
const TONE: Record<HealthLevel, { bar: string; text: string; word: string }> = {
  well: { bar: 'bg-lamp-400', text: 'text-lamp-200/80', word: 'Steady' },
  grazed: { bar: 'bg-lamp-300', text: 'text-lamp-200/80', word: 'Weathered' },
  hurt: { bar: 'bg-[#9fb4ff]', text: 'text-[#cfd9ff]', word: 'The moon is in you' },
  critical: { bar: 'bg-[#dce5ff]', text: 'text-[#dce5ff]', word: 'Get inside' },
};

/**
 * What the moonlight has cost you.
 *
 * It falls only when you are out of doors with the moon on you, and it comes back only behind a
 * door — which makes the bar an instruction as much as a number. It stays quiet while it is full
 * (this is a game about a festival, not a firefight) and grows more insistent as it empties:
 * the word underneath appears once the moon has actually taken something, and the bar pulses
 * while it is going down.
 */
export function HealthBar() {
  const [health, setHealth] = useState<Health>({ value: 100, level: 'well', draining: false });

  useGameEvent('ui:health', (h) =>
    setHealth((prev) => (prev.value === h.value && prev.level === h.level && prev.draining === h.draining ? prev : h)),
  );

  const tone = TONE[health.level];
  const whole = health.level === 'well' && !health.draining;

  return (
    <div className={`transition-opacity duration-700 ${whole ? 'opacity-55' : 'opacity-100'}`}>
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[0.28em] text-dusk-400">Strength</p>
        <p className={`text-[10px] tabular-nums tracking-[0.1em] ${tone.text}`}>{health.value}</p>
      </div>

      <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full border border-night-700/70 bg-night-950/60">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out ${tone.bar} ${
            health.draining ? 'animate-pulse' : ''
          }`}
          style={{ width: `${Math.min(Math.max(health.value, 0), 100)}%` }}
        />
      </div>

      {!whole && (
        <p className={`mt-1 text-[10px] tracking-[0.16em] ${tone.text} ${health.level === 'critical' ? 'animate-pulse' : ''}`}>
          {health.draining ? 'Get inside — the moonlight is taking it' : tone.word}
        </p>
      )}
    </div>
  );
}
