import type { Camera, DirectionalLight, Vector3 } from 'three';
import type { InventoryStack, ItemId } from '../../shared/items';
import type { MoonStateName, NightPhase } from '../../shared/types';
import type { SoundKey } from '../audio/SoundFx';
import type { IInteractable } from '../interaction/IInteractable';
import type { InventorySystem } from '../inventory/InventorySystem';
import type { ScriptedCamera, ShelterManager } from '../shelter/ShelterManager';

/** Run-wide services a world's interactables use. Created by the engine before the world. */
export interface WorldServices {
  inventory: InventorySystem;
  /** A prayer at the temple: the moon's weight lifts. */
  onPray(): void;
  /** Every offering is before Bappa. */
  onPujaComplete(): void;
  /** One of the game's sounds, for the world's own life (a dog in the lane). */
  playSound(key: SoundKey, volume?: number): void;
}

/** The sky, as the world's own systems (lighting, ambience, villagers, dogs) read it. */
export interface MoonFrame {
  state: MoonStateName;
  progress: number;
  /** 0..1 how much moonlight is falling. */
  moonlight: number;
  /** The signs are showing: people head home. */
  goingHome: boolean;
  /** The light is out and it costs: nobody stays in the open. */
  dangerous: boolean;
  /** Seconds until the light starts to bite (0 once it has). */
  untilMoonlight: number;
  /** Where the night has got to: evening, night, or dawn. */
  phase: NightPhase;
  /**
   * 0..1 floor under the sky on the lighting curve — the village's own darkness with no moon in
   * it. The sky follows whichever is higher, this or `moonlight`.
   */
  nightBase: number;
  /** 0..1 of morning blended over the top of everything. 0 until dawn. */
  dawn: number;
  /** No further moon will rise tonight. */
  retired: boolean;
}

export interface WorldFrame {
  camera: Camera;
  moon: MoonFrame;
  /** How loudly the player is moving, 0 (still) … 1 (running). The dogs listen to this. */
  noise: number;
}

/** What a closing puja can call on: the camera, the devotee, and the run's own sounds. */
export interface PujaStage {
  camera: ScriptedCamera;
  /** The devotee bows and offers: namaste, a bow, and back up. */
  celebrate(): void;
  sound(key: SoundKey, volume?: number): void;
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
  /** True when the player stands on open ground (the moon finds you fastest there). */
  isOpenGround?(): boolean;
  /** True when something is overhead: a veranda, an awning, the temple's hall, a thick tree. */
  isCovered?(): boolean;
  /** Metres to the nearest shelter door, as the crow flies. */
  shelterDistance?(p: Vector3): number;
  /** Plays the puja's closing sequence, then calls `done`. Returns a way to cut it short. */
  pujaSequence?(stage: PujaStage, done: () => void): (() => void) | void;
  /**
   * Leaves offerings on the ground (a failure under the moon). Returns the interactable that picks
   * them up again; the world draws it until `onEmpty` has been called.
   */
  dropOfferings?(at: Vector3, stacks: InventoryStack[], onEmpty: (drop: IInteractable) => void): IInteractable;
  /** Where the world's placed sounds come from: the pandal's drums, the temple's drone. */
  soundSpots?: { festival: Vector3 | null; temple: Vector3 | null };
  /** Rendered icons for the bag, when the renderer makes them. */
  itemIcons?: Promise<Partial<Record<ItemId, string>>>;
  dispose(): void;
}
