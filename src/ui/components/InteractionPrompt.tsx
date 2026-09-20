import { useRef, useState } from 'react';
import type { InputDevice, PromptInfo } from '../../shared/events';
import { useGameEvent } from '../hooks/useGameEvent';

const KEY: Record<InputDevice, string> = { keyboard: 'E', gamepad: 'A', touch: '' };

/**
 * The world-space interaction prompt: floats over the thing it acts on, following it as the camera
 * moves. Position updates arrive every frame and go straight to the element's transform — React
 * only re-renders when the words change.
 *
 *   keyboard   [E] COLLECT        · Marigolds ×3
 *   controller (A) ENTER HOUSE    · The Patils’ home
 *   touch      the verb over the object; the thumb button is in TouchControls
 *
 * When the anchor is off screen (or behind the camera) the prompt rests at the bottom centre.
 */
export function InteractionPrompt({ device }: { device: InputDevice }) {
  const [prompt, setPrompt] = useState<PromptInfo | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useGameEvent('ui:prompt', (p) => setPrompt(p));
  useGameEvent('ui:prompt-position', ({ x, y, visible }) => {
    const el = ref.current;
    if (!el) return;
    // Keep it on screen, clear of the HUD's edges.
    const px = visible ? Math.min(Math.max(x, 0.1), 0.9) : 0.5;
    const py = visible ? Math.min(Math.max(y, 0.16), 0.84) : 0.8;
    el.style.left = `${px * 100}%`;
    el.style.top = `${py * 100}%`;
  });

  if (!prompt) return null;
  // On a phone the big INTERACT button lives with the other touch controls; here we only name
  // what it would do, floating over the thing itself.
  const touch = device === 'touch';

  return (
    <div ref={ref} className="pointer-events-none absolute z-10" style={{ left: '50%', top: '80%' }}>
      <div key={prompt.id} className="-translate-x-1/2 -translate-y-full animate-[prompt-in_180ms_ease-out] pb-3">
        {touch ? (
          <div
            className={`flex flex-col items-center rounded-2xl border px-4 py-1.5 shadow-lg shadow-black/40 backdrop-blur-md ${
              prompt.enabled ? 'border-lamp-400/50 bg-night-950/70 text-lamp-200' : 'border-night-700 bg-night-950/65 text-dusk-400/80'
            }`}
          >
            <span className="text-xs font-semibold tracking-[0.2em]">{prompt.mobileVerb}</span>
            {prompt.detail && <span className="mt-0.5 max-w-44 truncate text-[10px] tracking-wide opacity-75">{prompt.detail}</span>}
          </div>
        ) : (
          <div
            className={`flex items-center gap-2.5 whitespace-nowrap rounded-full border py-1.5 pl-1.5 pr-4 shadow-lg shadow-black/40 backdrop-blur-md ${
              prompt.enabled ? 'border-lamp-400/40 bg-night-950/70' : 'border-night-700 bg-night-950/65'
            }`}
          >
            <kbd
              className={`grid h-7 min-w-7 place-items-center font-sans text-xs font-bold ${device === 'gamepad' ? 'rounded-full' : 'rounded-md'} ${
                prompt.enabled ? 'bg-lamp-400 text-night-950' : 'bg-night-700 text-dusk-400'
              }`}
            >
              {KEY[device]}
            </kbd>
            <span className="leading-tight">
              <span className={`block text-xs font-semibold tracking-[0.18em] ${prompt.enabled ? 'text-lamp-200' : 'text-dusk-400'}`}>{prompt.verb.toUpperCase()}</span>
              {prompt.detail && <span className="block text-[10px] tracking-wide text-lamp-200/60">{prompt.detail}</span>}
            </span>
          </div>
        )}
        {!prompt.enabled && prompt.note && <p className="mt-1.5 text-center text-[10px] tracking-wide text-dusk-400 drop-shadow">{prompt.note}</p>}
        <div className={`mx-auto mt-1 h-2 w-px ${prompt.enabled ? 'bg-lamp-400/60' : 'bg-dusk-400/40'}`} />
      </div>
    </div>
  );
}
