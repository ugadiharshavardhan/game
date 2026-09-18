interface MainMenuProps {
  onPlay: () => void;
}

/**
 * The menu is React, not a Phaser scene.
 *
 * It renders before Phaser is downloaded at all, which makes first paint nearly
 * instant, and it gets real buttons — focusable, screen-reader friendly, and
 * correctly sized for a thumb — for free.
 */
export function MainMenu({ onPlay }: MainMenuProps) {
  return (
    <main className="safe-top safe-bottom flex h-full w-full flex-col items-center justify-center bg-linear-to-b from-night-950 via-night-900 to-night-800 px-6">
      <div className="w-full max-w-sm text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-dusk-400">Ganesh Chaturthi</p>

        <h1 className="mt-3 font-display text-4xl leading-tight text-lamp-200 sm:text-5xl">
          Moonlight Seva
        </h1>

        <p className="mt-5 text-sm leading-relaxed text-dusk-400">
          Gather the offerings the puja asks for and carry them to the temple. The village will
          tell you when the moon is rising — watch the sky, listen, and step inside a house before
          its light falls.
        </p>

        <button
          type="button"
          onClick={onPlay}
          className="mt-9 w-full rounded-xl bg-lamp-400 px-8 py-4 font-display text-lg text-night-950 transition hover:bg-lamp-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-lamp-400/40 active:scale-[0.98]"
        >
          Play
        </button>

        <dl className="mt-10 space-y-2 text-left text-xs text-dusk-400/80">
          <div className="flex justify-between gap-4">
            <dt>Move</dt>
            <dd className="text-lamp-200/70">Arrow keys or WASD · drag anywhere on touch</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Pause</dt>
            <dd className="text-lamp-200/70">Esc or P · the button on screen</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
