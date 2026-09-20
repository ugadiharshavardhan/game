import { useEffect, useRef } from 'react';
import { MIN_X, MIN_Z, paintBase, paintPlayer, paintSpots, paintTempleMarker, WORLD_H, WORLD_W, type Transform } from './draw';
import { mapState, subscribeMap } from './mapStore';

/** How much of the village the corner map shows, metres across. */
const WINDOW_M = 70;
/** Pixels per metre of the painted base the window is cut from. */
const BASE_PPM = 3;
const SIZE = 116;

/**
 * The corner map: a small window of the village round the player, north always at the top. It
 * opens the full map when pressed. Drawn on a canvas from a base painted once, ten times a second,
 * with no React work at all in between.
 */
export function Minimap({ onOpen }: { onOpen: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext('2d');
    if (!el || !g) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = el.height = Math.round(SIZE * dpr);

    // The whole village once, without names — the window is cut from this.
    const base = document.createElement('canvas');
    base.width = Math.ceil(WORLD_W * BASE_PPM);
    base.height = Math.ceil(WORLD_H * BASE_PPM);
    const bg = base.getContext('2d');
    if (!bg) return;
    paintBase(bg, { ppm: BASE_PPM, ox: 0, oz: 0 }, false);

    const draw = () => {
      const p = mapState.player;
      const view = el.width / WINDOW_M;
      // Top-left corner of the window, in world metres.
      const wx = p.x - WINDOW_M / 2;
      const wz = p.z - WINDOW_M / 2;
      g.fillStyle = '#0d120b';
      g.fillRect(0, 0, el.width, el.height);
      // The same rectangle in the base's pixels. Where it runs off the village the browser clips it.
      g.drawImage(base, (wx - MIN_X) * BASE_PPM, (wz - MIN_Z) * BASE_PPM, WINDOW_M * BASE_PPM, WINDOW_M * BASE_PPM, 0, 0, el.width, el.height);
      // World → window pixels is (x − wx)·view, which is this transform.
      const t: Transform = { ppm: view, ox: (MIN_X - wx) * view, oz: (MIN_Z - wz) * view };
      paintTempleMarker(g, t, el.width, el.height, 7 * dpr);
      paintSpots(g, t, mapState.spots, { pin: 4 * dpr, words: false, fontPx: 8 * dpr });
      paintPlayer(g, t, p, 6 * dpr);
    };
    draw();
    return subscribeMap(draw);
  }, []);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open the map"
      className="pointer-events-auto relative block overflow-hidden rounded-2xl border border-lamp-400/40 bg-night-950/70 shadow-lg shadow-black/40 active:scale-95"
      style={{ width: SIZE, height: SIZE }}
    >
      <canvas ref={canvas} style={{ width: SIZE, height: SIZE }} className="block" />
      <span aria-hidden className="pointer-events-none absolute left-1.5 top-0.5 text-[10px] font-bold tracking-widest text-lamp-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        N
      </span>
    </button>
  );
}
