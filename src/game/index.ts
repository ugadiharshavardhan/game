/**
 * The Phaser layer's only entry point.
 *
 * This module is imported *dynamically* by `ui/components/PhaserGame.tsx`, which
 * is what keeps ~1.3MB of engine out of the main bundle: the menu loads
 * instantly and Phaser downloads when the player presses Play.
 *
 * The module-level singleton is not laziness — it is the fix for two real bugs
 * (GAME_DESIGN.md §8, risks 1 and 2):
 *
 *   1. React StrictMode mounts effects twice in development. Without a guard
 *      you get two Phaser games and two stacked canvases.
 *   2. HMR re-runs this module on every edit. Without disposal, WebGL contexts
 *      leak; browsers cap them around 16, after which the dev loop dies.
 */

import Phaser from 'phaser';
import { createGameConfig } from './config/gameConfig';

let game: Phaser.Game | null = null;
let resizeObserver: ResizeObserver | null = null;

export function createGame(parent: HTMLElement): Phaser.Game {
  // Never leave a previous instance behind, whatever the caller did.
  destroyGame();

  game = new Phaser.Game(createGameConfig(parent));

  // Phaser's RESIZE mode only watches the window. The canvas container is a
  // flex child, so it can change size without the window doing so — on mobile
  // browser-chrome collapse, for instance. Watch the element itself.
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (width > 0 && height > 0) game?.scale.resize(width, height);
  });
  resizeObserver.observe(parent);

  return game;
}

export function destroyGame(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;

  // `true` also removes the canvas from the DOM.
  game?.destroy(true);
  game = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => destroyGame());
}
