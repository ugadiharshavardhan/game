/**
 * Modal viewer for the 3D Ganesh Murti in the village pandal.
 * Embeds the 3D model with 360-degree inspection and credits.
 */
import { useEffect } from 'react';

interface GaneshModelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GaneshModelModal({ isOpen, onClose }: GaneshModelModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 select-none">
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Dialog container */}
      <div className="relative z-10 flex w-full max-w-3xl flex-col rounded-2xl border border-lamp-400/40 bg-night-950/95 p-4 sm:p-6 shadow-[0_16px_60px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-lamp-400/20 pb-3">
          <div>
            <span className="rounded bg-lamp-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lamp-300">
              Village Pandal · Darshan
            </span>
            <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold tracking-wide text-lamp-100">
              Shree Ganesha Murti
            </h2>
            <p className="text-xs text-lamp-300/70">
              Vakratunda Mahakaya Suryakoti Samaprabha · Nirvighnam Kuru Me Deva Sarva-Karyeshu Sarvada
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:border-lamp-400/40 hover:bg-white/10 hover:text-white"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* 3D Model Embed */}
        <div className="sketchfab-embed-wrapper my-4 overflow-hidden rounded-xl border border-lamp-400/30 bg-black shadow-inner">
          <iframe
            title="Ganesh GG"
            frameBorder="0"
            allowFullScreen
            allow="autoplay; fullscreen; xr-spatial-tracking"
            src="https://sketchfab.com/models/22b7770a58a74d1f9cbf5e5a4081f29e/embed?autostart=1&ui_theme=dark"
            className="h-[380px] sm:h-[480px] w-full border-0"
          />
        </div>

        {/* Footer info & credits */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-lamp-400/20 pt-3 text-xs">
          <p className="text-dusk-400 text-center sm:text-left">
            <span className="text-lamp-300 font-semibold">Ganesh GG</span> 3D Model by{' '}
            <a
              href="https://sketchfab.com/topfrank2013"
              target="_blank"
              rel="noreferrer nofollow"
              className="text-lamp-400 underline underline-offset-2 hover:text-lamp-200"
            >
              Francesco Coldesina
            </a>{' '}
            on{' '}
            <a
              href="https://sketchfab.com/3d-models/ganesh-gg-22b7770a58a74d1f9cbf5e5a4081f29e"
              target="_blank"
              rel="noreferrer nofollow"
              className="text-lamp-400 underline underline-offset-2 hover:text-lamp-200"
            >
              Sketchfab
            </a>
          </p>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl bg-lamp-400 px-6 py-2.5 font-display text-sm font-semibold tracking-wide text-night-950 shadow-md transition hover:bg-lamp-300 active:scale-95"
          >
            Ganpati Bappa Morya! 🙏
          </button>
        </div>
      </div>
    </div>
  );
}
