interface PauseOverlayProps {
  onResume: () => void;
  onQuit: () => void;
}

/**
 * A modal over the canvas. Unlike the HUD (which will be pointer-events-none so
 * touches reach the game), this one deliberately captures every pointer event —
 * while it is up, nothing should reach the village underneath.
 */
export function PauseOverlay({ onResume, onQuit }: PauseOverlayProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Paused"
      className="absolute inset-0 z-20 grid place-items-center bg-night-950/80 px-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-xs rounded-2xl border border-night-700 bg-night-900/90 p-6 text-center">
        <h2 className="font-display text-2xl text-lamp-200">Paused</h2>
        <p className="mt-2 text-xs text-dusk-400">The village waits.</p>

        <button
          type="button"
          autoFocus
          onClick={onResume}
          className="mt-6 w-full rounded-xl bg-lamp-400 px-6 py-3 font-display text-night-950 transition hover:bg-lamp-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-lamp-400/40 active:scale-[0.98]"
        >
          Resume
        </button>

        <button
          type="button"
          onClick={onQuit}
          className="mt-3 w-full rounded-xl border border-night-700 px-6 py-3 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-lamp-400/20"
        >
          Quit to menu
        </button>
      </div>
    </div>
  );
}
