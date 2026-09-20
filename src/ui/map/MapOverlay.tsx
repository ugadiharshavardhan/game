import { useEffect, useRef, useState } from 'react';
import { ITEMS } from '../../shared/items';
import type { MapSpot } from '../../shared/map';
import { useGameEvent } from '../hooks/useGameEvent';
import { paintBase, paintPlayer, paintSpots, WORLD_H, WORLD_W, type Transform } from './draw';
import { mapState, subscribeMap } from './mapStore';

/**
 * The full map: the whole village, north at the top, with the temple, home and every shop and
 * house named — so "near the Patils’ house" can be found by reading it. What the player knows of
 * the offerings is drawn over it: a faint glow where someone has said "about there", a clear pin
 * where it has been seen. Beside it, the same in words.
 */
export function MapOverlay({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [spots, setSpots] = useState<MapSpot[]>(mapState.spots);
  useGameEvent('ui:map-spots', ({ spots: s }) => setSpots(s));

  useEffect(() => {
    const el = canvas.current;
    const holder = box.current;
    const g = el?.getContext('2d');
    if (!el || !holder || !g) return;
    let base: HTMLCanvasElement | null = null;
    let t: Transform = { ppm: 1, ox: 0, oz: 0 };
    let fontPx = 10;

    const draw = () => {
      if (!base) return;
      g.clearRect(0, 0, el.width, el.height);
      g.drawImage(base, 0, 0);
      paintSpots(g, t, mapState.spots, { pin: fontPx * 1.0, words: true, fontPx });
      paintPlayer(g, t, mapState.player, fontPx * 0.9);
    };

    const layout = () => {
      const cw = holder.clientWidth;
      const ch = holder.clientHeight;
      if (cw < 10 || ch < 10) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const ppm = Math.min(cw / WORLD_W, ch / WORLD_H);
      el.style.width = `${WORLD_W * ppm}px`;
      el.style.height = `${WORLD_H * ppm}px`;
      el.width = Math.round(WORLD_W * ppm * dpr);
      el.height = Math.round(WORLD_H * ppm * dpr);
      t = { ppm: ppm * dpr, ox: 0, oz: 0 };
      fontPx = Math.min(Math.max(ppm * 2.7, 9), 14) * dpr;
      base = document.createElement('canvas');
      base.width = el.width;
      base.height = el.height;
      const bg = base.getContext('2d');
      if (bg) paintBase(bg, t, true, fontPx);
      draw();
    };

    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(holder);
    const unsubscribe = subscribeMap(draw);
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, []);

  return (
    <div role="dialog" aria-label="Village map" className="safe-top safe-bottom absolute inset-0 z-40 flex flex-col bg-night-950/95 px-3 pb-3 pt-3 sm:px-6">
      <header className="flex items-center justify-between gap-3 pb-2">
        <div>
          <p className="font-display text-lg leading-none text-lamp-200">Village map</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-dusk-400">North is up · the temple is in the north</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the map"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-lamp-200/25 bg-night-950/80 text-xl leading-none text-lamp-200 transition hover:border-lamp-400 active:scale-95"
        >
          <span aria-hidden>×</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 landscape:flex-row sm:flex-row">
        <div ref={box} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center">
          <canvas ref={canvas} className="rounded-xl border border-night-700" />
          <Compass />
        </div>

        <aside className="min-h-0 shrink-0 overflow-y-auto rounded-xl border border-night-800 bg-night-900/50 p-3 text-left landscape:w-64 sm:w-64 max-h-[34%] landscape:max-h-none sm:max-h-none">
          <p className="text-[10px] uppercase tracking-[0.25em] text-dusk-400">Offerings you know of</p>
          {spots.length === 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-dusk-400">
              Nothing yet. Talk to the villagers and walk the lanes — where offerings are will appear here.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {spots.map((s) => (
                <li key={s.id} className="flex gap-2">
                  <span aria-hidden className="text-lg leading-none">
                    {ITEMS[s.item].glyph}
                  </span>
                  <span className="min-w-0 text-xs leading-snug">
                    <span className="text-lamp-200">
                      {ITEMS[s.item].name} ×{s.quantity}
                    </span>{' '}
                    <span className={s.state === 'found' ? 'text-lamp-400' : 'text-dusk-400'}>{s.state === 'found' ? '· seen' : '· heard of'}</span>
                    <span className="block text-dusk-400">{s.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-night-800 pt-2 text-[11px] leading-relaxed text-dusk-400">
            <span className="text-lamp-200">Temple</span> — north. Offer everything here.
            <br />
            <span className="text-lamp-200">Home</span> — south, where you began.
          </p>
        </aside>
      </div>
    </div>
  );
}

/** A small compass in the corner of the map: N is up, and the map never turns. */
function Compass() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden className="pointer-events-none absolute right-1 top-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
      <circle cx="22" cy="22" r="19" fill="rgba(8,10,20,0.7)" stroke="rgba(242,196,106,0.45)" />
      <path d="M22 6 L27 22 L22 19 L17 22 Z" fill="#f2c46a" />
      <path d="M22 38 L27 22 L22 25 L17 22 Z" fill="rgba(255,240,210,0.35)" />
      <text x="22" y="5.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff0d2">
        N
      </text>
      <text x="22" y="43" textAnchor="middle" fontSize="6" fill="rgba(255,240,210,0.6)">
        S
      </text>
    </svg>
  );
}
