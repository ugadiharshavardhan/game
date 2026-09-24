import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { EventBus } from '../../shared/EventBus';
import type { PosturePhase } from '../../shared/events';
import { useGameEvent } from '../hooks/useGameEvent';

interface TouchControlsProps {
  onOpenBag: () => void;
  onOpenMap: () => void;
  onPause: () => void;
  /** The verb the action button would do right now, if anything. */
  action: { verb: string; enabled: boolean } | null;
  sneaking: boolean;
}

type Tap = 'interact' | 'crouch' | 'jump' | 'sit' | 'sleep';

/**
 * The phone's controls, landscape-first.
 *
 *  - Left thumb: the canvas's floating joystick (the engine owns the touch; this only draws it).
 *  - Right thumb: drag anywhere on the canvas to turn the camera — and, in the corner, a cluster:
 *
 *            JUMP
 *      SIT          RUN
 *           SLEEP
 *
 *    with the context action (COLLECT, ENTER, OFFER…) beside it when there is something to use.
 *
 * Every button acts on pointer-down, not on click: a click is only synthesised for a lone tap, so
 * with a thumb already on the joystick a click-based button can simply never fire. Pointer events
 * are per finger, so the joystick, the camera drag and any button all work at once. RUN is held
 * (pointer capture keeps it held if the thumb slides off); the rest are taps.
 *
 * Seated, only STAND is live; asleep, the cluster goes and a single WAKE UP remains.
 */
export function TouchControls({ onOpenBag, onOpenMap, onPause, action, sneaking }: TouchControlsProps) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [posture, setPosture] = useState<{ phase: PosturePhase; sheltered: boolean }>({ phase: 'standing', sheltered: false });
  const [running, setRunning] = useState(false);

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
  useGameEvent('ui:posture', (p) => setPosture(p));

  // Nothing on this layer should ever scroll or zoom the page.
  useEffect(() => {
    const stop = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener('touchmove', stop, { passive: false });
    return () => document.removeEventListener('touchmove', stop);
  }, []);

  const standing = posture.phase === 'standing';
  const seated = posture.phase === 'sitting-down' || posture.phase === 'sitting' || posture.phase === 'standing-up';
  const asleep = posture.phase === 'lying-down' || posture.phase === 'sleeping' || posture.phase === 'waking';

  // Let go of RUN whenever it stops making sense (sitting down, pausing, unmounting).
  const runHeld = running && standing;
  useEffect(() => {
    EventBus.emit('input:hold', { action: 'run', down: runHeld });
  }, [runHeld]);
  useEffect(() => () => EventBus.emit('input:hold', { action: 'run', down: false }), []);

  const tap = (a: Tap) => () => EventBus.emit('input:action', { action: a });

  return (
    <div className="pointer-events-none absolute inset-0 z-20 touch-none select-none [-webkit-touch-callout:none]" onContextMenu={(e) => e.preventDefault()}>
      {/* Where the thumb goes, until it goes there: a ring you can see but never look at. */}
      {!asleep && (
        <div
          aria-hidden
          className={`safe-bottom safe-left absolute bottom-8 left-8 h-24 w-24 rounded-full border border-lamp-200/15 transition-opacity duration-200 ${active ? 'opacity-0' : 'opacity-100'}`}
        >
          <div className="grid h-full w-full place-items-center">
            <span className="text-[9px] uppercase tracking-[0.3em] text-lamp-200/30">move</span>
          </div>
        </div>
      )}

      {/* The joystick: drawn where the thumb landed; the knob springs back to centre on release. */}
      <div
        ref={base}
        className={`absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200 ${active && standing ? 'opacity-100' : 'opacity-0'}`}
        style={{ left: '20%', top: '75%' }}
      >
        <div className="grid h-28 w-28 place-items-center rounded-full border border-lamp-200/25 bg-night-950/25 backdrop-blur-[2px]">
          <div ref={knob} className="h-12 w-12 rounded-full border border-lamp-200/40 bg-lamp-200/20" />
        </div>
      </div>

      {/* Top right: map, bag and pause, clear of the moon indicator. */}
      <div className="safe-top safe-right pointer-events-auto absolute right-4 top-4 flex gap-2">
        <RoundButton label="Open the map" onPress={onOpenMap}>
          <MapGlyph />
        </RoundButton>
        <RoundButton label="Open the bag" onPress={onOpenBag}>
          <BagGlyph />
        </RoundButton>
        <RoundButton label="Pause" onPress={onPause} quiet>
          <svg width="14" height="14" viewBox="0 0 12 14" aria-hidden fill="currentColor">
            <rect x="0" y="0" width="4" height="14" rx="1.5" />
            <rect x="8" y="0" width="4" height="14" rx="1.5" />
          </svg>
        </RoundButton>
      </div>

      {asleep ? (
        <div className="safe-bottom pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center gap-3">
          <p className="rounded-full bg-night-950/55 px-3 py-1 text-[11px] tracking-[0.2em] text-lamp-200/75 backdrop-blur-md">
            {posture.phase === 'waking' ? 'Waking…' : 'Sleeping…'}
            {posture.sheltered ? <span className="text-lamp-400"> · safe indoors</span> : null}
          </p>
          {posture.phase !== 'waking' && (
            <PadButton label="Wake up" onPress={tap('sleep')} className="pointer-events-auto h-14 w-44 rounded-full text-xs" strong>
              Wake up
            </PadButton>
          )}
        </div>
      ) : (
        <div className="safe-bottom safe-right pointer-events-none absolute bottom-5 right-5 flex items-center gap-3 [--cell:clamp(48px,15vh,66px)]">
          {/* The thing in front of you: COLLECT, ENTER, OFFER. Only when standing and there is something. */}
          <div className="w-[calc(var(--cell)*1.25)]">
            {standing && action && (
              <PadButton
                label={action.verb}
                onPress={tap('interact')}
                disabled={!action.enabled}
                strong
                className="pointer-events-auto h-[calc(var(--cell)*1.25)] w-[calc(var(--cell)*1.25)] rounded-full text-[11px] leading-tight"
              >
                {action.verb}
              </PadButton>
            )}
          </div>
          <div className="pointer-events-auto grid grid-cols-[repeat(3,var(--cell))] grid-rows-[repeat(3,var(--cell))] gap-1">
            <PadButton label="Sneak" onPress={tap('crouch')} disabled={!standing} pressed={sneaking} className="col-start-3 row-start-1 m-auto h-11 w-11 rounded-full text-[9px]">
              Sneak
            </PadButton>
            <PadButton label="Jump" onPress={tap('jump')} disabled={!standing} className="col-start-2 row-start-1 h-full w-full rounded-full text-[10px]">
              Jump
            </PadButton>
            <PadButton label={seated ? 'Stand' : 'Sit'} onPress={tap('sit')} disabled={posture.phase === 'standing-up'} pressed={seated} className="col-start-1 row-start-2 h-full w-full rounded-full text-[10px]">
              {seated ? 'Stand' : 'Sit'}
            </PadButton>
            <PadButton
              label="Run"
              onPress={() => setRunning(true)}
              onRelease={() => setRunning(false)}
              disabled={!standing}
              pressed={runHeld}
              className="col-start-3 row-start-2 h-full w-full rounded-full text-[10px]"
            >
              {runHeld ? 'Running' : 'Run'}
            </PadButton>
            <PadButton label="Sleep" onPress={tap('sleep')} disabled={!standing} className="col-start-2 row-start-3 h-full w-full rounded-full text-[10px]">
              Sleep
            </PadButton>
          </div>
        </div>
      )}

      {/* Landscape-first: a phone held upright is asked to turn. */}
      <div className="pointer-events-auto absolute inset-0 z-50 hidden place-items-center bg-night-950/92 px-8 text-center portrait:grid">
        <div>
          <svg width="56" height="56" viewBox="0 0 24 24" className="mx-auto animate-[rotate-hint_2.4s_ease-in-out_infinite] text-lamp-400" aria-hidden>
            <rect x="7" y="2.5" width="10" height="19" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="mt-4 font-display text-lg text-lamp-200">Rotate your device</p>
          <p className="mt-1 text-xs text-dusk-400">Moonlight Seva plays in landscape.</p>
        </div>
      </div>
    </div>
  );
}

interface PadButtonProps {
  label: string;
  onPress: () => void;
  /** For a held button: called when the finger lifts (or is cancelled). */
  onRelease?: () => void;
  disabled?: boolean;
  /** Latched on (SNEAK, seated, RUNNING). */
  pressed?: boolean;
  strong?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * A thumb-sized button that acts on pointer-down and lights at once. Multi-touch safe: it only
 * ever looks at its own pointer.
 */
function PadButton({ label, onPress, onRelease, disabled = false, pressed = false, strong = false, className = '', children }: PadButtonProps) {
  const [down, setDown] = useState(false);
  const start = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (disabled) return;
    if (onRelease) e.currentTarget.setPointerCapture(e.pointerId);
    setDown(true);
    onPress();
  };
  const end = () => {
    if (!down) return;
    setDown(false);
    onRelease?.();
  };
  const lit = down || pressed;
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled}
      aria-pressed={onRelease || pressed ? lit : undefined}
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      // Keyboard and switch access: the same action for a real click with no pointer-down before it.
      onClick={(e) => {
        if (e.detail === 0 && !disabled) onPress();
      }}
      className={`grid touch-none select-none place-items-center border text-center font-semibold uppercase tracking-[0.14em] backdrop-blur-md transition-[transform,background-color,border-color] duration-75 ${
        disabled
          ? 'border-lamp-200/10 bg-night-950/30 text-lamp-200/25'
          : lit
            ? 'scale-95 border-lamp-400 bg-lamp-400/30 text-lamp-200'
            : strong
              ? 'border-2 border-lamp-400/80 bg-lamp-400/15 text-lamp-200'
              : 'border-lamp-200/30 bg-night-950/55 text-lamp-200/85'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Map, bag and pause open an overlay, so they act on click like any button: on pointer-down, the
 * lifting finger would land its click on whatever the overlay just put under it.
 */
function RoundButton({ label, onPress, quiet = false, children }: { label: string; onPress: () => void; quiet?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      className={`grid h-11 w-11 place-items-center rounded-full border bg-night-950/60 backdrop-blur-md active:scale-95 ${quiet ? 'border-night-700 text-lamp-200/80' : 'border-lamp-400/35 text-lamp-400'}`}
    >
      {children}
    </button>
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
