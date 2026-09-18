import { useEffect, useRef, useState } from 'react';
import { useGameEvent } from '../hooks/useGameEvent';

/**
 * The bridge between React and Phaser — and the only place the two meet.
 *
 * Two details here are load-bearing:
 *
 *  - The engine is imported *dynamically*. That is what keeps Phaser out of the
 *    main bundle so the menu loads without paying for it.
 *  - `containerRef`'s div has no React children. Phaser appends its canvas
 *    there, and React must never also try to manage that node's children or the
 *    two will fight over the DOM. The loading and error states are siblings.
 */
export function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useGameEvent('scene:ready', () => setReady(true));

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
        engine.createGame(parent);
        teardown = engine.destroyGame;
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
          <p className="animate-pulse font-display text-lg text-lamp-400">Lighting the lamps…</p>
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-night-950 p-6 text-center">
          <p className="max-w-sm text-sm text-dusk-400">
            The game could not start. This usually means the browser has no WebGL or Canvas
            support available. Try reloading, or open the page in another browser.
          </p>
        </div>
      )}
    </div>
  );
}
