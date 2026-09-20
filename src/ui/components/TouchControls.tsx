import { useEffect, useRef, useState } from 'react';
import { EventBus } from '../../shared/EventBus';
import { useGameEvent } from '../hooks/useGameEvent';

interface TouchControlsProps {
  onOpenBag: () => void;
  onOpenMap: () => void;
  onPause: () => void;
  /** The verb the action button would do right now, if anything. */
  action: { verb: string; enabled: boolean } | null;
  sneaking: boolean;
}

/**
 * The phone's controls: a thumb joystick on the left, a drag area on the right for the camera
 * (the canvas handles both; this only draws the joystick), and big, quiet buttons — INTERACT,
 * SNEAK, BAG, PAUSE. Everything is a real button with a thumb-sized target; the middle of the
 * screen is left clear.
 *
 * The joystick's position comes from the engine every frame and goes straight to the element's
 * transform, so dragging never re-renders React.
 */
export function TouchControls({ onOpenBag, onOpenMap, onPause, action, sneaking }: TouchControlsProps) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useGameEvent('ui:touch-stick', (s) => {
    const b = base.current;
    const k = knob.current;
    if (!b || !k) return;
    if (s.active) {
      b.style.left = `${s.originX}px`;
      b.style.top = `${s.originY}px`;
      k.style.transform = `translate(${s.dx}px, ${s.dy}px)`;
    }
    setActive((was) => (was === s.active ? was : s.active));
  });

  // Nothing on this layer should ever scroll or zoom the page.
  useEffect(() => {
    const stop = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener('touchmove', stop, { passive: false });
    return () => document.removeEventListener('touchmove', stop);
  }, []);

  const tap = (action: 'interact' | 'crouch') => () => EventBus.emit('input:action', { action });

  return (
    <div className="pointer-events-none absolute inset-0 z-20 touch-none select-none">
      {/* Where the thumb goes, until it goes there: a ring you can see but never look at. */}
      <div
        aria-hidden
        className={`safe-bottom absolute bottom-8 left-8 h-24 w-24 rounded-full border border-lamp-200/15 transition-opacity duration-200 ${active ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className="grid h-full w-full place-items-center">
          <span className="text-[9px] uppercase tracking-[0.3em] text-lamp-200/30">move</span>
        </div>
      </div>

      {/* The joystick: drawn where the thumb landed. */}
      <div
        ref={base}
        className={`absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`}
        style={{ left: '20%', top: '75%' }}
      >
        <div className="grid h-28 w-28 place-items-center rounded-full border border-lamp-200/25 bg-night-950/25 backdrop-blur-[2px]">
          <div ref={knob} className="h-12 w-12 rounded-full border border-lamp-200/40 bg-lamp-200/20" />
        </div>
      </div>

      {/* Top right: bag and pause, clear of the moon indicator. */}
      <div className="safe-top pointer-events-auto absolute right-4 top-4 flex gap-2">
        <button
          type="button"
          onClick={onOpenMap}
          aria-label="Open the map"
          className="grid h-11 w-11 place-items-center rounded-full border border-lamp-400/35 bg-night-950/60 text-lamp-400 backdrop-blur-md active:scale-95"
        >
          <MapGlyph />
        </button>
        <button
          type="button"
          onClick={onOpenBag}
          aria-label="Open the bag"
          className="grid h-11 w-11 place-items-center rounded-full border border-lamp-400/35 bg-night-950/60 text-lamp-400 backdrop-blur-md active:scale-95"
        >
          <BagGlyph />
        </button>
        <button
          type="button"
          onClick={onPause}
          aria-label="Pause"
          className="grid h-11 w-11 place-items-center rounded-full border border-night-700 bg-night-950/60 text-lamp-200/80 backdrop-blur-md active:scale-95"
        >
          <svg width="14" height="14" viewBox="0 0 12 14" aria-hidden fill="currentColor">
            <rect x="0" y="0" width="4" height="14" rx="1.5" />
            <rect x="8" y="0" width="4" height="14" rx="1.5" />
          </svg>
        </button>
      </div>

      {/* Bottom right: the action, with sneak above it. */}
      <div className="safe-bottom pointer-events-auto absolute bottom-8 right-5 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={tap('crouch')}
          aria-pressed={sneaking}
          className={`grid h-14 w-14 place-items-center rounded-full border text-[10px] uppercase tracking-widest backdrop-blur-md transition active:scale-95 ${
            sneaking ? 'border-lamp-400 bg-lamp-400/20 text-lamp-200' : 'border-lamp-200/25 bg-night-950/55 text-lamp-200/80'
          }`}
        >
          Sneak
        </button>
        <button
          type="button"
          onClick={tap('interact')}
          disabled={!action}
          className={`grid h-20 w-20 place-items-center rounded-full border-2 text-center text-[11px] font-semibold uppercase leading-tight tracking-[0.12em] backdrop-blur-md transition active:scale-95 ${
            action?.enabled ? 'border-lamp-400/80 bg-lamp-400/20 text-lamp-200' : action ? 'border-night-700 bg-night-950/55 text-dusk-400' : 'border-lamp-200/15 bg-night-950/35 text-lamp-200/30'
          }`}
        >
          {action ? action.verb : 'Interact'}
        </button>
      </div>
    </div>
  );
}

function MapGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5L3.5 20z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 4v13.5M15 6.5V20" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function BagGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M7 8c0-3 2-5 5-5s5 2 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4.5 8.5h15l-1.2 11a2 2 0 0 1-2 1.8H7.7a2 2 0 0 1-2-1.8z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
