import { useEffect, useRef, useState } from 'react';
import { useGameEvent } from '../hooks/useGameEvent';

/**
 * The bridge between React and the 3D engine — the only place the two meet.
 *
 *  - The engine is imported *dynamically*, keeping Three.js and Rapier out of the
 *    main bundle so the menu loads without paying for them.
 *  - `containerRef`'s div has no React children. The engine appends its canvas
 *    there; React must never also manage that node's children. Loading and error
 *    states are siblings.
 */
export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  useGameEvent('scene:ready', () => setReady(true));
  useGameEvent('preload:progress', ({ progress: p }) => setProgress(p));

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    let cancelled = false;
    let teardown: (() => void) | null = null;

    void (async () => {
      try {
        const engine = await import('../../game');
        // StrictMode may have already run the cleanup by the time this resolves.
        if (cancelled) return;
        teardown = engine.destroyGame;
        await engine.createGame(parent);
      } catch (error) {
        console.error('[Moonlight Seva] the game engine failed to start', error);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full touch-none select-none" />

      {!ready && !failed && (
        <div className="absolute inset-0 grid place-items-center bg-night-950">
          <div className="w-56 text-center">
            <p className="animate-pulse font-display text-lg text-lamp-400">Lighting the lamps…</p>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-night-700">
              <div
                className="h-full bg-lamp-400 transition-[width] duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-night-950 p-6 text-center">
          <p className="max-w-sm text-sm text-dusk-400">
            The game could not start. This usually means the browser has no WebGL support
            available. Try reloading, or open the page in another browser.
          </p>
        </div>
      )}
    </div>
  );
}
