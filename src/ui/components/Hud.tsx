import { useEffect, useState } from 'react';
import type { InputDevice } from '../../shared/events';
import { ITEM_IDS, ITEMS, type InventorySnapshot, type ItemId } from '../../shared/items';
import type { ExposureLevel, PlayerStateName } from '../../shared/types';
import { useGameEvent } from '../hooks/useGameEvent';
import { InteractionPrompt } from './InteractionPrompt';
import { ItemIcon } from './InventoryUI';
import { MoonUI } from './MoonUI';
import { NightClockUI } from './NightClockUI';

interface HudProps {
  device: InputDevice;
  snapshot: InventorySnapshot;
  icons: Partial<Record<ItemId, string>>;
  onOpenBag: () => void;
  cinematic: boolean;
}

interface Toast {
  key: number;
  text: string;
  tone: 'info' | 'warn' | 'good';
}

/**
 * The HUD: an objective in one line, the moon overhead, and the thing in front of you. Everything
 * else stays out of the way — no meters across the screen, no shooter furniture. Exposure is told
 * by the picture (the edges of the screen go cold) and by the arc on the moon.
 *
 * The wrapper is pointer-events-none so touches reach the canvas; only real controls opt back in.
 */
export function Hud({ device, snapshot, icons, onOpenBag, cinematic }: HudProps) {
  const [state, setState] = useState<PlayerStateName>('idle');
  const [locked, setLocked] = useState(false);
  const [area, setArea] = useState<{ name: string; open: boolean; key: number } | null>(null);
  const [exposure, setExposure] = useState<{ value: number; level: ExposureLevel }>({ value: 0, level: 'calm' });
  const [shelter, setShelter] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [speech, setSpeech] = useState<{ speaker: string; text: string; key: number } | null>(null);
  const [pickup, setPickup] = useState<{ id: ItemId; quantity: number; key: number } | null>(null);
  const [atTemple, setAtTemple] = useState(false);
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
  useGameEvent('ui:exposure', (e) => setExposure((q) => (q.value === e.value && q.level === e.level ? q : { value: e.value, level: e.level })));
  useGameEvent('ui:shelter', ({ inside, family }) => setShelter(inside ? family : null));
  useGameEvent('ui:at-temple', ({ inside }) => setAtTemple(inside));
  useGameEvent('ui:toast', ({ text, tone }) => {
    const key = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { key, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.key !== key)), 3800);
  });
  useGameEvent('ui:speech', (s) => setSpeech({ ...s, key: Date.now() }));
  useEffect(() => {
    if (!speech) return;
    const t = setTimeout(() => setSpeech(null), 5200);
    return () => clearTimeout(t);
  }, [speech]);
  useGameEvent('ui:pickup', ({ id, quantity }) => setPickup({ id, quantity, key: Date.now() }));
  useEffect(() => {
    if (!pickup) return;
    const t = setTimeout(() => setPickup(null), 1800);
    return () => clearTimeout(t);
  }, [pickup]);

  if (cinematic) return null;

  const missing = ITEM_IDS.map((id) => ({ id, count: Math.max(ITEMS[id].required - snapshot.offered[id], 0) })).filter((m) => m.count > 0);
  const kindsDone = ITEM_IDS.length - missing.length;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* The moon on your skin: the screen's edges go cold as exposure climbs. */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: Math.min(exposure.value / 70, 1) * (exposure.level === 'danger' ? 1 : 0.8),
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 42%, rgba(90,120,210,0.22) 74%, rgba(35,55,130,0.6) 100%)',
        }}
      />

      {/* Top left: what you are here to do. */}
      <div className="safe-top absolute left-4 top-4 max-w-[13rem]">
        <p className="text-[10px] uppercase tracking-[0.28em] text-dusk-400">Objective</p>
        <p className="mt-1 text-sm leading-snug text-lamp-200">
          Collect 7 offerings <span className="text-dusk-400">· {kindsDone}/7 given</span>
        </p>
        <ul className="mt-2 flex gap-1">
          {ITEM_IDS.map((id) => {
            const done = snapshot.offered[id] >= ITEMS[id].required;
            const carried = snapshot.stacks.find((s) => s.id === id)?.quantity ?? 0;
            return (
              <li key={id} title={`${ITEMS[id].name}: ${snapshot.offered[id]} of ${ITEMS[id].required} given`} className="relative">
                <ItemIcon id={id} icons={icons} className={`h-6 w-6 text-sm ${done ? '' : carried ? 'opacity-80' : 'opacity-30 grayscale'}`} />
                {done && <span className="absolute -right-0.5 -top-0.5 text-[9px] text-lamp-400">✓</span>}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Top centre: the sky, and SAFE when you are out of it. On a narrow screen it sits below
          the objective and the buttons rather than fighting them for the same row. */}
      <div className="safe-top absolute inset-x-0 top-20 flex flex-col items-center gap-2 sm:top-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <MoonUI />
          <NightClockUI />
        </div>
        {shelter && (
          <div className="flex animate-[prompt-in_220ms_ease-out] items-center gap-2 rounded-full border border-lamp-400/50 bg-night-950/70 px-3 py-1.5 text-[11px] text-lamp-200 backdrop-blur-md">
            <span className="rounded-sm bg-lamp-400 px-1.5 text-[10px] font-bold tracking-[0.2em] text-night-950">SAFE</span>
            <span className="text-lamp-200/80">Inside {shelter}</span>
          </div>
        )}
      </div>

      {area && (
        <div key={area.key} className="safe-top absolute inset-x-0 top-40 flex justify-center sm:top-28">
          <div className="animate-[area-in_3.2s_ease-in-out_forwards] text-center">
            <p className="font-display text-2xl tracking-wide text-lamp-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] sm:text-3xl">{area.name}</p>
            <div className="mx-auto mt-2 h-px w-24 bg-linear-to-r from-transparent via-lamp-400/70 to-transparent" />
            {area.open && <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-dusk-400/90">Open ground · no cover</p>}
          </div>
        </div>
      )}

      {/* What the puja still wants — shown where it matters, at the temple. */}
      {atTemple && missing.length > 0 && (
        <div className="safe-top absolute right-4 top-20 w-44 animate-[prompt-in_240ms_ease-out] rounded-2xl border border-lamp-400/25 bg-night-950/70 p-3 backdrop-blur-md sm:top-16">
          <p className="text-[10px] uppercase tracking-[0.25em] text-dusk-400">Still needed</p>
          <ul className="mt-2 space-y-1.5">
            {missing.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-xs text-lamp-200">
                <ItemIcon id={m.id} icons={icons} className="h-6 w-6 text-base" />
                <span className="flex-1 truncate">{ITEMS[m.id].name}</span>
                <span className="tabular-nums text-lamp-400">×{m.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <InteractionPrompt device={device} />

      {/* Messages, above the prompt. */}
      <div className={`safe-bottom absolute inset-x-0 flex flex-col items-center gap-1.5 px-4 ${touch ? 'bottom-40' : 'bottom-28'}`}>
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
        <div key={speech.key} className={`safe-bottom absolute inset-x-0 flex justify-center px-4 ${touch ? 'bottom-52' : 'bottom-40'}`}>
          <div className="max-w-md animate-[prompt-in_220ms_ease-out] rounded-2xl border border-lamp-400/25 bg-night-950/80 px-4 py-3 shadow-xl shadow-black/40 backdrop-blur-md">
            <p className="text-[10px] uppercase tracking-[0.25em] text-lamp-400">{speech.speaker}</p>
            <p className="mt-1 font-display text-sm leading-snug text-lamp-200">“{speech.text}”</p>
          </div>
        </div>
      )}

      {/* The bag: a chip on desktop (the phone has its own button). */}
      {!touch && (
        <div className="safe-bottom absolute bottom-6 right-5 flex flex-col items-end gap-2">
          {pickup && (
            <div key={pickup.key} className="flex animate-[pickup-in_1.8s_ease-out_forwards] items-center gap-1.5 rounded-full bg-night-950/70 py-1 pl-1 pr-3 text-xs text-lamp-200 backdrop-blur-md">
              <ItemIcon id={pickup.id} icons={icons} className="h-7 w-7 text-lg" />+{pickup.quantity} {ITEMS[pickup.id].name}
            </div>
          )}
          <button
            type="button"
            onClick={onOpenBag}
            aria-label={`Open the bag: ${snapshot.used} of ${snapshot.capacity}`}
            className={`pointer-events-auto flex items-center gap-2 rounded-full border bg-night-950/60 px-3 py-1.5 backdrop-blur-md transition active:scale-95 ${
              snapshot.used >= snapshot.capacity ? 'border-dusk-400/70' : 'border-lamp-400/35'
            }`}
          >
            <span className="text-xs tabular-nums text-lamp-200">
              {snapshot.used}
              <span className="text-dusk-400">/{snapshot.capacity}</span>
            </span>
            <kbd className="rounded bg-night-700 px-1.5 font-sans text-[10px] text-lamp-200/80">{device === 'gamepad' ? 'Y' : 'I'}</kbd>
          </button>
        </div>
      )}

      {touch && pickup && (
        <div key={pickup.key} className="safe-top absolute right-4 top-20 flex animate-[pickup-in_1.8s_ease-out_forwards] items-center gap-1.5 rounded-full bg-night-950/70 py-1 pl-1 pr-3 text-xs text-lamp-200 backdrop-blur-md">
          <ItemIcon id={pickup.id} icons={icons} className="h-7 w-7 text-lg" />+{pickup.quantity} {ITEMS[pickup.id].name}
        </div>
      )}

      {!touch && !locked && (
        <p className="absolute inset-x-0 bottom-8 text-center text-xs tracking-wide text-lamp-200/60">
          Click to look around · WASD move · Shift run · Ctrl slow walk · C sneak · E interact · I bag · Wheel zoom
        </p>
      )}

      {/* Sneaking is worth knowing about: it keeps you out of the light. */}
      {state === 'sneaking' && !touch && (
        <p className="absolute inset-x-0 bottom-20 text-center text-[10px] uppercase tracking-[0.3em] text-dusk-400">Sneaking · low and quiet</p>
      )}
    </div>
  );
}
