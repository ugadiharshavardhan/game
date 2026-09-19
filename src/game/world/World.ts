import type { Camera, DirectionalLight, Vector3 } from 'three';
import type { InventoryStack, ItemId } from '../../shared/items';
import type { IInteractable } from '../interaction/IInteractable';
import type { InventorySystem } from '../inventory/InventorySystem';
import type { ShelterManager } from '../shelter/ShelterManager';

/** Run-wide services a world's interactables use. Created by the engine before the world. */
export interface WorldServices {
  inventory: InventorySystem;
  /** A prayer at the temple: purity restored. */
  onPray(): void;
}

export interface WorldFrame {
  camera: Camera;
  /** 0..1 — how much moonlight is falling (MoonCycle.moonlight). */
  moonlight: number;
}

/** What the engine needs from a playable scene (the village, or the character testbed). */
export interface World {
  interactables: IInteractable[];
  /** Enterable houses, when the scene has any. */
  shelter: ShelterManager | null;
  spawn: Vector3;
  spawnYaw: number;
  sun: DirectionalLight;
  /** Keeps the shadow frustum centred on the player for crisp shadows. */
  follow(target: Vector3): void;
  /** Per-frame: triggers, level of detail, living details, the moon's light. */
  update?(dt: number, playerFeet: Vector3, frame: WorldFrame): void;
  /** True when the player stands on open ground (moonlight there drains faster). */
  isOpenGround?(): boolean;
  /**
   * Leaves offerings on the ground (a failure under the moon). Returns the interactable that picks
   * them up again; the world draws it until `onEmpty` has been called.
   */
  dropOfferings?(at: Vector3, stacks: InventoryStack[], onEmpty: (drop: IInteractable) => void): IInteractable;
  /** Rendered icons for the bag, when the renderer makes them. */
  itemIcons?: Promise<Partial<Record<ItemId, string>>>;
  dispose(): void;
}
