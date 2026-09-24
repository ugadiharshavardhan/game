import { useState } from 'react';
import { EventBus } from '../../shared/EventBus';
import type { PlayerStateName } from '../../shared/types';

interface MovementDebugOverlayProps {
  playerState: PlayerStateName;
  character?: string;
}

export function MovementDebugOverlay({ playerState, character = 'character.glb' }: MovementDebugOverlayProps) {
  const [minimized, setMinimized] = useState(false);
  const [activeAction, setActiveAction] = useState<string>('idle');
  const [debugVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.has('debug') || Boolean(import.meta.env.DEV);
  });

  if (!debugVisible) return null;

  const triggerAnimation = (name: string) => {
    setActiveAction(name);
    EventBus.emit('game:debug-animation' as any, { animation: name });
    setTimeout(() => {
      setActiveAction('idle');
    }, 3000);
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 font-mono text-xs select-none">
      <div className="rounded-xl border border-lamp-400/40 bg-black/85 p-3 text-white shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-bold text-lamp-300">ANIMATION RIG v2</span>
          </div>
          <button
            type="button"
            onClick={() => setMinimized(!minimized)}
            className="text-[10px] text-white/60 hover:text-white"
          >
            {minimized ? '▲ SHOW' : '▼ HIDE'}
          </button>
        </div>

        {!minimized && (
          <div className="mt-2.5 space-y-2">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <span className="text-white/60">Model:</span>
              <span className="text-lamp-200 font-semibold truncate">{character}</span>

              <span className="text-white/60">Locomotion:</span>
              <span className="text-emerald-300 font-semibold">{playerState}</span>

              <span className="text-white/60">Rig Bones:</span>
              <span className="text-white">65 Mixamo</span>

              <span className="text-white/60">Active Pose:</span>
              <span className="text-yellow-300 font-medium">{activeAction}</span>
            </div>

            <div className="border-t border-white/10 pt-2">
              <span className="text-[10px] uppercase tracking-wider text-white/50 block mb-1">
                Trigger Animation Clips
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => triggerAnimation('Walk')}
                  className="rounded border border-white/20 bg-white/10 px-2 py-1 text-center hover:bg-white/20"
                >
                  🚶 Walk
                </button>
                <button
                  type="button"
                  onClick={() => triggerAnimation('Run')}
                  className="rounded border border-white/20 bg-white/10 px-2 py-1 text-center hover:bg-white/20"
                >
                  🏃 Run
                </button>
                <button
                  type="button"
                  onClick={() => triggerAnimation('Jump')}
                  className="rounded border border-white/20 bg-white/10 px-2 py-1 text-center hover:bg-white/20"
                >
                  🦘 Jump
                </button>
                <button
                  type="button"
                  onClick={() => triggerAnimation('Sit')}
                  className="rounded border border-white/20 bg-white/10 px-2 py-1 text-center hover:bg-white/20"
                >
                  🧘 Sit
                </button>
                <button
                  type="button"
                  onClick={() => triggerAnimation('Sleep')}
                  className="rounded border border-white/20 bg-white/10 px-2 py-1 text-center hover:bg-white/20"
                >
                  🛌 Sleep
                </button>
                <button
                  type="button"
                  onClick={() => triggerAnimation('Pickup')}
                  className="rounded border border-white/20 bg-white/10 px-2 py-1 text-center hover:bg-white/20"
                >
                  🎒 Collect
                </button>
                <button
                  type="button"
                  onClick={() => triggerAnimation('Talk')}
                  className="rounded border border-white/20 bg-white/10 px-2 py-1 text-center hover:bg-white/20"
                >
                  🗣️ Talk
                </button>
                <button
                  type="button"
                  onClick={() => triggerAnimation('Offer')}
                  className="rounded border border-white/20 bg-white/10 px-2 py-1 text-center hover:bg-white/20"
                >
                  🪔 Offer
                </button>
                <button
                  type="button"
                  onClick={() => triggerAnimation('Pranam')}
                  className="rounded border border-white/20 bg-white/10 px-2 py-1 text-center hover:bg-white/20"
                >
                  🙏 Pranam
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
