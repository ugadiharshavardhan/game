/**
 * The single typed contract between the React layer and the 3D engine layer.
 *
 * Rule: if it isn't in this map, it doesn't cross the boundary. React never
 * holds a Three.js object; the engine never touches the DOM outside its canvas
 * (pointer lock and window input listeners excepted).
 *
 * Naming convention:
 *   `ui:*`     engine -> React, "something happened, you may want to render it"
 *   `game:*`   React -> engine, "do this"
 *   `input:*`  React -> engine, on-screen controls
 *   everything else is a simulation fact broadcast by the engine.
 */

import type { PlayerStateName, RunResult } from './types';

export interface GameEventMap {
  // ---- engine -> React -------------------------------------------------
  /** Asset loading progress, 0..1. */
  'preload:progress': { progress: number };
  /** The world is built and the first frame rendered; the canvas is worth showing. */
  'scene:ready': { scene: string };
  /** A run began. */
  'run:started': { seed: number };
  /** A run ended; payload is everything the results screen needs. */
  'run:completed': RunResult;
  /** The interactable the player is facing changed. `null` hides the prompt. */
  'ui:prompt': { text: string } | null;
  /** The player's state changed (idle, walking, running, sneaking, interacting, hidden). */
  'ui:player-state': { state: PlayerStateName };
  /** The player walked into a named place (null between places). `open` = no cover from the moon. */
  'ui:area': { name: string; open: boolean } | null;
  /** Mouse capture changed. The browser releases it on Esc, which React treats as "pause". */
  'ui:pointer-lock': { locked: boolean };

  // ---- React -> engine -------------------------------------------------
  /** Pause is React-owned; the engine only obeys. */
  'game:pause': undefined;
  'game:resume': undefined;
  /** Player-facing camera settings from the pause menu (persisted by React). */
  'game:camera-settings': { sensitivity: number; invertY: boolean };
  /** On-screen buttons for touch devices. */
  'input:action': { action: 'interact' | 'crouch' };
}

export type GameEventName = keyof GameEventMap;
