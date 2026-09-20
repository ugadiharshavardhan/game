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

import type { InventorySnapshot, ItemId } from './items';
import type { MapPlayer, MapSpot } from './map';
import type { ExposureLevel, GameSettings, HealthLevel, MoonStateName, NightPhase, PlayerStateName, RunResult } from './types';

/** What the interaction prompt shows. Plain text only — React decides how it looks per device. */
export interface PromptInfo {
  /** Changes whenever the target changes, so React can animate the swap. */
  id: string;
  /** "Collect", "Enter house", "Offer" — the verb, sentence case. */
  verb: string;
  /** The touch button's label: "COLLECT", "ENTER". */
  mobileVerb: string;
  /** What it acts on: "Marigolds ×3", "the Patils' home". */
  detail?: string;
  /** False when the verb can't be done right now (a full bag); `note` says why. */
  enabled: boolean;
  note?: string;
}

export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

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
  /** The interactable the player would use changed. `null` hides the prompt. */
  'ui:prompt': PromptInfo | null;
  /**
   * Where the prompt's anchor is on screen this frame, as fractions of the canvas (0..1, y down).
   * `visible` is false when the anchor is behind the camera or off screen.
   */
  'ui:prompt-position': { x: number; y: number; visible: boolean };
  /** The player's state changed (idle, walking, running, sneaking, interacting, hidden). */
  'ui:player-state': { state: PlayerStateName };
  /** The player walked into a named place (null between places). `open` = no cover from the moon. */
  'ui:area': { name: string; open: boolean } | null;
  /** Mouse capture changed. The browser releases it on Esc, which React treats as "pause". */
  'ui:pointer-lock': { locked: boolean };
  /** The controller's bag button (Y / Triangle) was pressed: open or close the bag. */
  'ui:inventory-toggle': undefined;
  /** The last device the player used, for button glyphs. */
  'ui:input-device': { device: InputDevice };
  /** The bag or the temple's tally changed. */
  'ui:inventory': InventorySnapshot;
  /** Something was just picked up (quantity taken; `leftBehind` > 0 when the bag filled up). */
  'ui:pickup': { id: ItemId; quantity: number; leftBehind: number };
  /** Rendered 3D icons for the bag, as image URLs. Sent once, after the art has loaded. */
  'ui:item-icons': { icons: Partial<Record<ItemId, string>> };
  /** A villager says something (their name, and the line). */
  'ui:speech': { speaker: string; text: string };
  /** A short message: "The bag is full", "You dropped 3 offerings". */
  'ui:toast': { text: string; tone: 'info' | 'warn' | 'good' };
  /** The moon's state, a few times a second: the sky in words, never a countdown. */
  'ui:moon': { state: MoonStateName; label: string; note?: string; progress: number; dangerous: boolean; phase: NightPhase; retired: boolean };
  /**
   * The night clock, a few times a second. This one *is* a countdown, and deliberately so: the
   * moon is read from the sky, but 05:00 is a promise the game has to keep visibly.
   */
  'ui:night': { label: string; t: number; phase: NightPhase; minutesLeft: number };
  /** Exposure 0..100 and what to make of it. */
  'ui:exposure': { value: number; level: ExposureLevel; rising: boolean };
  /**
   * Health 0..100: what the moonlight has cost. It falls only out of doors under the moon and
   * rises only behind a door, so the bar is also the instruction.
   */
  'ui:health': { value: number; level: HealthLevel; draining: boolean };
  /** The player is standing in the temple: show what the puja still wants. */
  'ui:at-temple': { inside: boolean };
  /** A cinematic is playing (the puja): the HUD stands back. */
  'ui:cinematic': { active: boolean };
  /** Where the touch joystick is and how far it's pushed, in screen pixels. */
  'ui:touch-stick': { active: boolean; originX: number; originY: number; dx: number; dy: number };
  /** The player went indoors (safe) or came back out. */
  'ui:shelter': { inside: boolean; family: string | null };
  /** Frame rate and draw calls, twice a second, when the page was opened with ?perf=1. */
  'ui:perf': { fps: number; calls: number; triangles: number; quality: string; memoryMb: number | null };
  /** Where the player is and which way they face, ten times a second, for the map. */
  'ui:map-player': MapPlayer;
  /** The offerings the player knows about — hinted or found — whenever that changes. */
  'ui:map-spots': { spots: MapSpot[] };
  /** The short guided walk: what to do now, or null when it is over. */
  'ui:tutorial': { step: number; total: number; title: string; hint: string; done?: boolean } | null;

  // ---- React -> engine -------------------------------------------------
  /** Pause is React-owned; the engine only obeys. */
  'game:pause': undefined;
  'game:resume': undefined;
  /** Player-facing camera settings from the pause menu (persisted by React). */
  'game:camera-settings': { sensitivity: number; invertY: boolean };
  /** Everything else the player can change: volume, quality, controls (persisted by React). */
  'game:settings': GameSettings;
  /** Get on with it: end the guided walk now. */
  'game:skip-tutorial': undefined;
  /** The bag is open: movement input is ignored so arrows and the stick can browse it. */
  'game:inventory-open': { open: boolean };
  /** The map is open: movement input is ignored and the action button waits, like the bag. */
  'game:map-open': { open: boolean };
  /** On-screen buttons for touch devices (and the bag's open/close key). */
  'input:action': { action: 'interact' | 'crouch' | 'inventory' };
  /** Skip the puja cinematic. */
  'game:skip-cinematic': undefined;
}

export type GameEventName = keyof GameEventMap;
