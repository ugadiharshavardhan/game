import type { Camera, Object3D, Scene, Vector3, WebGLRenderer } from 'three';
import type { SoundKey } from '../../../audio/SoundFx';
import type { QualityProfile } from '../../../core/quality';
import type { ItemId } from '../../../../shared/items';
import type { PujaItemVisual } from '../../../items/PujaItem';
import type { PujaCeremony } from './art/temple.puja';
import type { Environment } from '../../environment';
import type { Level } from '../solids';
import type { VillageLayout } from '../types';

export interface VisualsContext {
  scene: Scene;
  renderer: WebGLRenderer;
  layout: VillageLayout;
  level: Level;
  env: Environment;
  /** How much this device can be asked for: LOD distances, lights, particles. */
  quality: QualityProfile;
  /** The world's own sounds (a dog barking down the lane). */
  sound?: (key: SoundKey, volume?: number) => void;
  onProgress?: (p: number) => void;
}

export interface FrameInfo {
  camera: Camera;
  time: number;
  /** 0..1 — an offering was just made; sanctum lamps flare. */
  templeGlow: number;
  /**
   * 0..1 — how far into the night the sky is, moon or no moon. The village's own fire follows
   * this: lamps, diyas and lit windows come up to meet a darkening sky, and they stay up through
   * a cloudy hour at one in the morning.
   */
  night: number;
  /**
   * 0..1 — how much moonlight is actually falling, which is zero whenever the clouds have the
   * moon. Only things the moon itself makes may read this: the shafts through a shelter's
   * windows are moonlight, and must not be in the room when there is no moon to cast them.
   */
  moonlight: number;
  /** The signs are showing: villagers and dogs head home. */
  goingHome: boolean;
  /** The moon is out: nobody is in the lanes. */
  dangerous: boolean;
  /** Where the player is, and how loudly they are moving (0 … 1). */
  player: Vector3;
  noise: number;
}

/** What a village renderer hands back: doors to swing, items to animate, a per-frame tick, cleanup. */
export interface VillageVisuals {
  /** The door leaf's hinge for each house id. Rotating it about y opens the door (positive = inward). */
  doorHinges: Map<string, Object3D>;
  /** Each puja item's look, by offering spot id. */
  itemVisuals: Map<string, PujaItemVisual>;
  /** Rendered icons for the bag, if this renderer makes them. */
  itemIcons?: Promise<Partial<Record<ItemId, string>>>;
  /** The closing puja's petals, sparks and lamps, when this renderer has them. */
  puja?: PujaCeremony;
  update(dt: number, frame: FrameInfo): void;
  dispose(): void;
}
