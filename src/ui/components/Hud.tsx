import { useEffect, useState } from 'react';
import { EventBus } from '../../shared/EventBus';
import type { InputDevice } from '../../shared/events';
import { ITEMS, type InventorySnapshot, type ItemId } from '../../shared/items';
import type { MoonPhase, PlayerStateName } from '../../shared/types';
import { useGameEvent } from '../hooks/useGameEvent';
import { InteractionPrompt } from './InteractionPrompt';
import { ItemIcon } from './InventoryUI';

const STATE_LABEL: Record<PlayerStateName, string> = {
  idle: 'Still',
  walking: 'Walking',
  running: 'Running',
  sneaking: 'Sneaking',
  interacting: 'Busy',
  hidden: 'Hidden indoors',
};

/** What the sky is doing, in words — never a countdown. */
const MOON_LABEL: Record<MoonPhase, string> = {
  day: 'Clouds over the moon',
  dusk: 'The clouds are thinning',
  moonrise: 'Moonrise — find a door',
  moonlight: 'Moonlight',
  moonset: 'The clouds gather',
};

interface HudProps {
  device: InputDevice;
  snapshot: InventorySnapshot;
  icons: Partial<Record<ItemId, string>>;
  onOpenBag: () => void;
}

interface Toast {
  key: number;
  text: string;
  tone: 'info' | 'warn' | 'good';
}

/**
 * In-game HUD. The wrapper is pointer-events-none so touches reach the canvas;
 * only real controls opt back in.
 */
export function Hud({ device, snapshot, icons, onOpenBag }: HudProps) {
  const [state, setState] = useState<PlayerStateName>('idle');
  const [locked, setLocked] = useState(false);
  const [area, setArea] = useState<{ name: string; open: boolean; key: number } | null>(null);
  const [moon, setMoon] = useState<{ phase: MoonPhase; dangerous: boolean }>({ phase: 'day', dangerous: false });
  const [purity, setPurity] = useState({ value: 100, exposed: false });
  const [shelter, setShelter] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [speech, setSpeech] = useState<{ speaker: string; text: string; key: number } | null>(null);
  const [pickup, setPickup] = useState<{ id: ItemId; quantity: number; key: number } | null>(null);
  const [complete, setComplete] = useState(false);
  const touch = device === 'touch';

  // Place names, adventure-game style: fade in on arrival, fade out after a few seconds.
  useGameEvent('ui:area', (a) => {
    if (a) setArea({ ...a, key: Date.now() });
  });
  useEffect(() => {
    if (!area) return;
    const t = setTimeout(() => setArea(null), 3200);
    return () => clearTimeout(t);
  }, [area]);
  useGameEvent('ui:player-state', ({ state: s }) => setState(s));
  useGameEvent('ui:pointer-lock', ({ locked: l }) => setLocked(l));
  useGameEvent('ui:moon', ({ phase, dangerous }) => setMoon((m) => (m.phase === phase && m.dangerous === dangerous ? m : { phase, dangerous })));
  useGameEvent('ui:purity', (p) => setPurity((q) => (q.value === p.value && q.exposed === p.exposed ? q : p)));
  useGameEvent('ui:shelter', ({ inside, family }) => setShelter(inside ? family : null));
  useGameEvent('ui:toast', ({ text, tone }) => {
    const key = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { key, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.key !== key)), 3800);
  });
  useGameEvent('ui:speech', (s) => setSpeech({ ...s, key: Date.now() }));
  useEffect(() => {
    if (!speech) return;
    const t = setTimeout(() => setSpeech(null), 5600);
    return () => clearTimeout(t);
  }, [speech]);
  useGameEvent('ui:pickup', ({ id, quantity }) => setPickup({ id, quantity, key: Date.now() }));
  useEffect(() => {
    if (!pickup) return;
    const t = setTimeout(() => setPickup(null), 1800);
    return () => clearTimeout(t);
  }, [pickup]);
  useGameEvent('ui:puja-complete', () => setComplete(true));

  const low = purity.value < 35;
  const full = snapshot.used >= snapshot.capacity;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* Moonlight on the skin: the screen's edges go cold while it drains. */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: purity.exposed ? 0.45 + 0.55 * (1 - purity.value / 100) : 0,
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(90,120,210,0.28) 75%, rgba(40,60,140,0.6) 100%)',
        }}
      />

      <div className="safe-top absolute left-4 top-4 flex flex-col items-start gap-2">
        <div className="flex items-center gap-2 rounded-full border border-night-700/80 bg-night-950/55 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-lamp-200/90 backdrop-blur-md">
          <span className={`h-1.5 w-1.5 rounded-full ${state === 'running' ? 'bg-lamp-400' : 'bg-lamp-200/70'}`} />
          {STATE_LABEL[state]}
        </div>
      </div>

      {/* The sky, in words, and purity — and SAFE under it while indoors. On a narrow phone the
          column drops below the corner pills. */}
      <div className="safe-top absolute inset-x-0 top-16 flex flex-col items-center gap-2 sm:top-4">
        <div
          className={`flex flex-col items-center gap-1.5 rounded-2xl border px-4 py-2 backdrop-blur-md transition-colors ${
            moon.dangerous ? 'border-dusk-400/70 bg-[#101a3a]/75' : moon.phase === 'moonrise' ? 'border-dusk-400/60 bg-night-950/70' : 'border-night-700/70 bg-night-950/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <MoonGlyph phase={moon.phase} />
            <span className={`text-[11px] tracking-[0.12em] ${moon.phase === 'moonrise' ? 'animate-pulse text-dusk-400' : moon.dangerous ? 'text-[#c9d6ff]' : 'text-lamp-200/80'}`}>
              {MOON_LABEL[moon.phase]}
            </span>
          </div>
          <div className="flex items-center gap-2" aria-label={`Purity ${purity.value}`}>
            <span className="text-[9px] uppercase tracking-[0.25em] text-dusk-400">Purity</span>
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-night-700 sm:w-36">
              <div
                className={`h-full rounded-full transition-[width] duration-200 ${purity.exposed ? 'bg-[#9fb4ff]' : low ? 'bg-dusk-400' : 'bg-lamp-400'} ${purity.exposed ? 'animate-pulse' : ''}`}
                style={{ width: `${purity.value}%` }}
              />
            </div>
          </div>
        </div>
        {shelter && (
          <div className="flex animate-[prompt-in_220ms_ease-out] items-center gap-2 rounded-full border border-lamp-400/50 bg-night-950/70 px-3 py-1.5 text-[11px] text-lamp-200 backdrop-blur-md">
            <span className="rounded-sm bg-lamp-400 px-1.5 text-[10px] font-bold tracking-[0.2em] text-night-950">SAFE</span>
            <span className="text-lamp-200/80">Inside {shelter}</span>
          </div>
        )}
      </div>

      {area && (
        <div key={area.key} className="safe-top absolute inset-x-0 top-36 flex justify-center sm:top-28">
          <div className="animate-[area-in_3.2s_ease-in-out_forwards] text-center">
            <p className="font-display text-2xl tracking-wide text-lamp-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] sm:text-3xl">{area.name}</p>
            <div className="mx-auto mt-2 h-px w-24 bg-linear-to-r from-transparent via-lamp-400/70 to-transparent" />
            {area.open && <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-dusk-400/90">Open ground · no cover</p>}
          </div>
        </div>
      )}

      <InteractionPrompt device={device} />

      {/* Messages. */}
      <div className="safe-bottom absolute inset-x-0 bottom-28 flex flex-col items-center gap-1.5 px-4">
        {toasts.map((t) => (
          <p
            key={t.key}
            className={`max-w-md animate-[prompt-in_200ms_ease-out] rounded-full px-4 py-1.5 text-center text-xs backdrop-blur-md ${
              t.tone === 'warn' ? 'bg-[#1a2450]/80 text-[#d7e0ff]' : t.tone === 'good' ? 'bg-night-950/75 text-lamp-400' : 'bg-night-950/70 text-lamp-200/90'
            }`}
          >
            {t.text}
          </p>
        ))}
      </div>

      {speech && (
        <div key={speech.key} className="safe-bottom absolute inset-x-0 bottom-40 flex justify-center px-4">
          <div className="max-w-md animate-[prompt-in_220ms_ease-out] rounded-2xl border border-lamp-400/25 bg-night-950/80 px-4 py-3 shadow-xl shadow-black/40 backdrop-blur-md">
            <p className="text-[10px] uppercase tracking-[0.25em] text-lamp-400">{speech.speaker}</p>
            <p className="mt-1 font-display text-sm leading-snug text-lamp-200">“{speech.text}”</p>
          </div>
        </div>
      )}

      {/* The bag. */}
      <div className={`safe-bottom absolute flex flex-col items-end gap-2 ${touch ? 'bottom-28 right-5' : 'bottom-6 right-5'}`}>
        {pickup && (
          <div key={pickup.key} className="flex animate-[pickup-in_1.8s_ease-out_forwards] items-center gap-1.5 rounded-full bg-night-950/70 py-1 pl-1 pr-3 text-xs text-lamp-200 backdrop-blur-md">
            <ItemIcon id={pickup.id} icons={icons} className="h-7 w-7 text-lg" />+{pickup.quantity} {ITEMS[pickup.id].name}
          </div>
        )}
        <button
          type="button"
          onClick={onOpenBag}
          aria-label={`Open the bag: ${snapshot.used} of ${snapshot.capacity}`}
          className={`pointer-events-auto flex items-center gap-2 rounded-full border bg-night-950/65 backdrop-blur-md transition active:scale-95 ${
            full ? 'border-dusk-400/70' : 'border-lamp-400/40'
          } ${touch ? 'h-14 px-4' : 'px-3 py-1.5'}`}
        >
          <BagGlyph />
          <span className="text-xs tabular-nums text-lamp-200">
            {snapshot.used}
            <span className="text-dusk-400">/{snapshot.capacity}</span>
          </span>
          {!touch && <kbd className="rounded bg-night-700 px-1.5 font-sans text-[10px] text-lamp-200/80">{device === 'gamepad' ? 'Y' : 'I'}</kbd>}
        </button>
      </div>

      {!touch && !locked && (
        <p className="absolute inset-x-0 bottom-8 text-center text-xs tracking-wide text-lamp-200/60">
          Click to look around · WASD move · Shift run · Ctrl slow walk · C crouch · E interact · I bag · Wheel zoom
        </p>
      )}

      {touch && (
        <button
          type="button"
          onClick={() => EventBus.emit('input:action', { action: 'crouch' })}
          className="safe-bottom pointer-events-auto absolute bottom-8 right-6 grid h-14 w-14 place-items-center rounded-full border border-lamp-200/30 bg-night-950/60 text-[10px] uppercase tracking-widest text-lamp-200 backdrop-blur-md active:scale-95"
        >
          Crouch
        </button>
      )}

      {complete && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-night-950/40 px-6">
          <div className="pointer-events-auto max-w-sm animate-[prompt-in_400ms_ease-out] rounded-3xl border border-lamp-400/50 bg-night-900/90 p-6 text-center shadow-2xl shadow-black/60">
            <p className="text-[10px] uppercase tracking-[0.35em] text-dusk-400">The puja is complete</p>
            <p className="mt-3 font-display text-3xl text-lamp-400">Ganpati Bappa Morya!</p>
            <p className="mt-3 text-sm leading-relaxed text-lamp-200/80">
              Every offering is before Bappa — flowers, durva, coconut, bananas, rice, diyas and modaks.
            </p>
            <button type="button" onClick={() => setComplete(false)} className="mt-6 rounded-xl bg-lamp-400 px-6 py-2.5 font-display text-night-950 transition hover:bg-lamp-200 active:scale-95">
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A small moon: hidden behind a cloud by day, bare in moonlight. */
function MoonGlyph({ phase }: { phase: MoonPhase }) {
  const cloud = phase === 'day' ? 1 : phase === 'dusk' ? 0.6 : phase === 'moonset' ? 0.5 : 0;
  const lit = phase === 'moonlight' || phase === 'moonrise';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="6" fill={lit ? '#dbe4ff' : '#8b9bd4'} opacity={lit ? 1 : 0.7} />
      {lit && <circle cx="9" cy="9" r="8.2" fill="none" stroke="#9fb4ff" strokeOpacity="0.45" />}
      <g opacity={cloud} fill="#232c4a">
        <ellipse cx="7" cy="12" rx="6" ry="3.2" />
        <ellipse cx="12" cy="11" rx="5" ry="3.6" />
      </g>
    </svg>
  );
}

function BagGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="text-lamp-400">
      <path d="M7 8c0-3 2-5 5-5s5 2 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4.5 8.5h15l-1.2 11a2 2 0 0 1-2 1.8H7.7a2 2 0 0 1-2-1.8z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 12.5c1.8 1.2 4.2 1.2 6 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
