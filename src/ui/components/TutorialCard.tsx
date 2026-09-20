import { EventBus } from '../../shared/EventBus';
import { useGameEvent } from '../hooks/useGameEvent';
import { useState } from 'react';

interface TutorialCardProps {
  onPlay: () => void;
  onMenu: () => void;
}

/**
 * The guided walk's one piece of interface: what to do now, in a line, low on the screen where
 * the game's own prompts live. It never blocks the view and never stops the game.
 */
export function TutorialCard({ onPlay, onMenu }: TutorialCardProps) {
  const [step, setStep] = useState<{ step: number; total: number; title: string; hint: string; done?: boolean } | null>(null);
  useGameEvent('ui:tutorial', setStep);
  if (!step) return null;

  if (step.done) {
    return (
      <div className="safe-bottom absolute inset-0 z-30 grid place-items-center bg-night-950/70 px-6 backdrop-blur-sm">
        <div className="w-full max-w-sm text-center">
          <p className="text-[10px] uppercase tracking-[0.4em] text-dusk-400">Ganesh Chaturthi</p>
          <h2 className="mt-3 font-display text-3xl text-lamp-200">You’re ready</h2>
          <p className="mt-2 text-sm text-lamp-200/75">Complete the puja.</p>
          <button
            type="button"
            autoFocus
            onClick={onPlay}
            className="mt-7 w-full rounded-xl bg-lamp-400 px-6 py-3.5 font-display text-lg text-night-950 transition hover:bg-lamp-200 active:scale-[0.98]"
          >
            Begin
          </button>
          <button type="button" onClick={onMenu} className="mt-3 w-full rounded-xl border border-night-700 px-6 py-2.5 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200">
            Main menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="safe-top pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-6 sm:top-24">
      <div className="pointer-events-auto w-full max-w-sm animate-[prompt-in_240ms_ease-out] rounded-2xl border border-lamp-400/25 bg-night-950/80 px-4 py-3 text-center backdrop-blur-md">
        <p className="text-[10px] uppercase tracking-[0.3em] text-dusk-400">
          Step {step.step} of {step.total}
        </p>
        <p className="mt-1 font-display text-lg text-lamp-200">{step.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-lamp-200/70">{step.hint}</p>
        <button
          type="button"
          onClick={() => EventBus.emit('game:skip-tutorial')}
          className="mt-2 text-[10px] uppercase tracking-[0.25em] text-dusk-400 transition hover:text-lamp-200"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
