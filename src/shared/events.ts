/**
 * The single typed contract between the React layer and the Phaser layer.
 *
 * Rule: if it isn't in this map, it doesn't cross the boundary. React never
 * holds a Phaser object; Phaser never touches the DOM outside its canvas.
 *
 * Naming convention:
 *   `ui:*`     Phaser -> React, "something happened, you may want to render it"
 *   `game:*`   React -> Phaser, "do this"
 *   everything else is a simulation fact broadcast by Phaser.
 */

import type { RunResult } from './types';

export interface GameEventMap {
  // ---- Phaser -> React -------------------------------------------------
  /** Asset loading progress, 0..1. Wired now, meaningful once assets exist. */
  'preload:progress': { progress: number };
  /** The gameplay scene is live and the canvas is worth showing. */
  'scene:ready': { scene: string };
  /** A run began. */
  'run:started': { seed: number };
  /** A run ended; payload is everything the results screen needs. */
  'run:completed': RunResult;

  // ---- React -> Phaser -------------------------------------------------
  /**
   * Pause is React-owned. The Escape/P key is handled by a window listener in
   * `App.tsx`, not by Phaser: a paused scene stops receiving its own input, so
   * a Phaser-side handler could pause but never un-pause. One owner, one event.
   */
  'game:pause': undefined;
  'game:resume': undefined;
}

export type GameEventName = keyof GameEventMap;
