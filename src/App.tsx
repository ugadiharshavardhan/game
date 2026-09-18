import { useCallback, useEffect, useState } from 'react';
import { EventBus } from './shared/EventBus';
import type { AppState } from './shared/types';
import { MainMenu } from './ui/components/MainMenu';
import { PauseOverlay } from './ui/components/PauseOverlay';
import { GameCanvas } from './ui/components/GameCanvas';
import { Hud } from './ui/components/Hud';
import { useGameEvent } from './ui/hooks/useGameEvent';

/**
 * The app-level state machine (GAME_DESIGN.md §3.1).
 *
 * Implements `menu` and `playing`; `briefing`, `results` and `leaderboard`
 * join as their phases land. The 3D engine is mounted only while playing —
 * quitting unmounts `GameCanvas`, which destroys the engine.
 */
export default function App() {
  const [appState, setAppState] = useState<AppState>('menu');
  const [paused, setPaused] = useState(false);

  const startRun = useCallback(() => {
    setPaused(false);
    setAppState('playing');
  }, []);

  const quitToMenu = useCallback(() => {
    setPaused(false);
    setAppState('menu');
  }, []);

  // Escape/P toggles pause; losing the tab always pauses. This lives here rather
  // than in the engine because a paused engine stops reading its own input — an
  // engine-side handler could pause the game but never un-pause it.
  useEffect(() => {
    if (appState !== 'playing') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key.toLowerCase() === 'p') {
        setPaused((value) => !value);
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) setPaused(true);
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [appState]);

  // While the mouse is captured the browser swallows Esc and just releases the
  // pointer, so losing the pointer lock is the desktop "pause" signal.
  useGameEvent('ui:pointer-lock', ({ locked }) => {
    if (!locked && appState === 'playing') setPaused(true);
  });

  // React owns pause state; the engine only obeys. One owner, one direction.
  useEffect(() => {
    if (appState !== 'playing') return;
    EventBus.emit(paused ? 'game:pause' : 'game:resume');
  }, [appState, paused]);

  if (appState === 'menu') {
    return <MainMenu onPlay={startRun} />;
  }

  return (
    <main className="relative h-full w-full overflow-hidden bg-night-950">
      <GameCanvas />
      {!paused && <Hud />}

      {/*
        The HUD wrapper is pointer-events-none so that touches pass through to
        the canvas and drive the virtual joystick; only real controls opt back in.
      */}
      {!paused && (
        <div className="safe-top pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-end p-3">
          <button
            type="button"
            onClick={() => setPaused(true)}
            aria-label="Pause"
            className="pointer-events-auto rounded-lg border border-night-700 bg-night-950/70 px-4 py-2 text-xs uppercase tracking-widest text-lamp-200 backdrop-blur-sm transition hover:border-lamp-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-lamp-400/30"
          >
            Pause
          </button>
        </div>
      )}

      {paused && <PauseOverlay onResume={() => setPaused(false)} onQuit={quitToMenu} />}
    </main>
  );
}
