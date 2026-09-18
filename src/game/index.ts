/**
 * The 3D engine's only entry point.
 *
 * Imported *dynamically* by `ui/components/GameCanvas.tsx`, which keeps Three.js and
 * Rapier out of the main bundle: the menu loads instantly and the engine downloads
 * when the player presses Play.
 *
 * The module-level singleton guards two real bugs (GAME_DESIGN.md §8, risks 1–2):
 * React StrictMode mounting effects twice (two engines, two canvases), and HMR
 * re-running this module (leaked WebGL contexts, capped at ~16 per page).
 */
import { Engine } from './core/Engine';

let engine: Engine | null = null;

export async function createGame(parent: HTMLElement): Promise<void> {
  destroyGame();
  const current = new Engine(parent);
  engine = current;
  await current.start();
}

export function destroyGame(): void {
  engine?.dispose();
  engine = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => destroyGame());
}
