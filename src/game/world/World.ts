import type { Camera, DirectionalLight, Vector3 } from 'three';
import type { Interactable } from '../player/PlayerInteraction';

/** What the engine needs from a playable scene (the village, or the character testbed). */
export interface World {
  interactables: Interactable[];
  spawn: Vector3;
  spawnYaw: number;
  sun: DirectionalLight;
  /** Keeps the shadow frustum centred on the player for crisp shadows. */
  follow(target: Vector3): void;
  /** Per-frame: triggers, level of detail, living details (flames, flags). */
  update?(dt: number, playerFeet: Vector3, camera: Camera): void;
  dispose(): void;
}
