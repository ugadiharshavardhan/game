import type { Camera, Object3D, Scene, Vector3, WebGLRenderer } from 'three';
import type { ItemId } from '../../../../shared/items';
import type { PujaItemVisual } from '../../../items/PujaItem';
import type { Environment } from '../../environment';
import type { Level } from '../solids';
import type { VillageLayout } from '../types';

export interface VisualsContext {
  scene: Scene;
  renderer: WebGLRenderer;
  layout: VillageLayout;
  level: Level;
  env: Environment;
  onProgress?: (p: number) => void;
}

export interface FrameInfo {
  camera: Camera;
  time: number;
  /** 0..1 — an offering was just made; sanctum lamps flare. */
  templeGlow: number;
  /** 0..1 — how much moonlight is falling. */
  moonlight: number;
}

/** A dropped-offerings bundle's look; removed with `dispose`. */
export interface DropVisual extends PujaItemVisual {
  dispose(): void;
}

/** What a village renderer hands back: doors to swing, items to animate, a per-frame tick, cleanup. */
export interface VillageVisuals {
  /** The door leaf's hinge for each house id. Rotating it about y opens the door (positive = inward). */
  doorHinges: Map<string, Object3D>;
  /** Each puja item's look, by offering spot id. */
  itemVisuals: Map<string, PujaItemVisual>;
  /** Draws a bundle of dropped offerings on the ground. */
  makeDropVisual(at: Vector3): DropVisual;
  /** Rendered icons for the bag, if this renderer makes them. */
  itemIcons?: Promise<Partial<Record<ItemId, string>>>;
  update(dt: number, frame: FrameInfo): void;
  dispose(): void;
}
