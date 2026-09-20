/**
 * What the map knows about the offerings: where a spot is, how sure the player is of it, and what
 * the village said about it. Plain data, so React can draw it without touching the engine.
 */
import type { ItemId } from './items';

export interface MapSpot {
  id: string;
  item: ItemId;
  /** How many are still there to take. */
  quantity: number;
  /** World position (x east, z south — north is −z, so north is the top of the map). */
  x: number;
  z: number;
  /**
   * `hinted` — someone has told you roughly where: drawn as a faint glow and a sentence.
   * `found` — you have been close enough to see it: drawn as a clear pin.
   */
  state: 'hinted' | 'found';
  /** "South-west · near the Patils’ house" */
  hint: string;
}

export interface MapPlayer {
  x: number;
  z: number;
  /** Radians; 0 faces +z (south), π faces −z (north). */
  yaw: number;
}
