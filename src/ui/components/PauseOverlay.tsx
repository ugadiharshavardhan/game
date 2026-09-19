export interface CameraSettings {
  sensitivity: number;
  invertY: boolean;
}

interface PauseOverlayProps {
  onResume: () => void;
  onQuit: () => void;
  camera: CameraSettings;
  onCameraChange: (settings: CameraSettings) => void;
}

/**
 * A modal over the canvas. Unlike the HUD (which will be pointer-events-none so
 * touches reach the game), this one deliberately captures every pointer event —
 * while it is up, nothing should reach the village underneath.
 */
export function PauseOverlay({ onResume, onQuit, camera, onCameraChange }: PauseOverlayProps) {
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

        <fieldset className="mt-6 space-y-3 rounded-xl border border-night-700 p-4 text-left">
          <legend className="px-1 text-[10px] uppercase tracking-[0.25em] text-dusk-400">Camera</legend>
          <label className="block text-xs text-lamp-200/80">
            <span className="flex justify-between">
              Look sensitivity <span className="tabular-nums text-lamp-200">{camera.sensitivity.toFixed(2)}×</span>
            </span>
            <input
              type="range"
              min={0.25}
              max={3}
              step={0.05}
              value={camera.sensitivity}
              onChange={(e) => onCameraChange({ ...camera, sensitivity: Number(e.target.value) })}
              className="mt-2 w-full accent-lamp-400"
            />
          </label>
          <label className="flex items-center justify-between text-xs text-lamp-200/80">
            Invert vertical look
            <input
              type="checkbox"
              checked={camera.invertY}
              onChange={(e) => onCameraChange({ ...camera, invertY: e.target.checked })}
              className="h-4 w-4 accent-lamp-400"
            />
          </label>
        </fieldset>

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
