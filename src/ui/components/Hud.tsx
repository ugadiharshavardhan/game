import { useState } from 'react';
import { EventBus } from '../../shared/EventBus';
import type { PlayerStateName } from '../../shared/types';
import { useGameEvent } from '../hooks/useGameEvent';

const STATE_LABEL: Record<PlayerStateName, string> = {
  idle: 'Still',
  walking: 'Walking',
  running: 'Running',
  sneaking: 'Sneaking',
  interacting: 'Busy',
  hidden: 'Hidden indoors',
};

const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/**
 * In-game HUD. The wrapper is pointer-events-none so touches reach the canvas;
 * only real controls opt back in.
 */
export function Hud() {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [state, setState] = useState<PlayerStateName>('idle');
  const [locked, setLocked] = useState(false);

  useGameEvent('ui:prompt', (p) => setPrompt(p?.text ?? null));
  useGameEvent('ui:player-state', ({ state: s }) => setState(s));
  useGameEvent('ui:pointer-lock', ({ locked: l }) => setLocked(l));

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      <div className="safe-top absolute left-4 top-4 flex items-center gap-2 rounded-full border border-night-700/80 bg-night-950/55 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-lamp-200/90 backdrop-blur-md">
        <span
          className={`h-1.5 w-1.5 rounded-full ${state === 'hidden' ? 'bg-dusk-400' : state === 'running' ? 'bg-lamp-400' : 'bg-lamp-200/70'}`}
        />
        {STATE_LABEL[state]}
      </div>

      {prompt && (
        <div className="safe-bottom absolute inset-x-0 bottom-24 flex justify-center">
          <button
            type="button"
            onClick={() => EventBus.emit('input:action', { action: 'interact' })}
            className="pointer-events-auto flex items-center gap-3 rounded-full border border-lamp-400/40 bg-night-950/70 py-2 pl-2 pr-5 text-sm text-lamp-200 shadow-lg shadow-black/30 backdrop-blur-md transition active:scale-95"
          >
            <kbd className="grid h-7 w-7 place-items-center rounded-full bg-lamp-400 font-sans text-xs font-bold text-night-950">
              {isTouch ? '✋' : 'E'}
            </kbd>
            {prompt}
          </button>
        </div>
      )}

      {!isTouch && !locked && (
        <p className="absolute inset-x-0 bottom-8 text-center text-xs tracking-wide text-lamp-200/60">
          Click to look around · WASD move · Shift run · Ctrl slow walk · C crouch · E interact
        </p>
      )}

      {isTouch && (
        <button
          type="button"
          onClick={() => EventBus.emit('input:action', { action: 'crouch' })}
          className="safe-bottom pointer-events-auto absolute bottom-8 right-6 grid h-14 w-14 place-items-center rounded-full border border-lamp-200/30 bg-night-950/60 text-[10px] uppercase tracking-widest text-lamp-200 backdrop-blur-md active:scale-95"
        >
          Crouch
        </button>
      )}
    </div>
  );
}
