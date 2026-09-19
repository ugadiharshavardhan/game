import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';
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
  /** 0..1 — a prayer was just offered; sanctum lamps flare. */
  templeGlow: number;
}

/** What a village renderer hands back: door leaves to swing, a per-frame tick, and cleanup. */
export interface VillageVisuals {
  /** The door leaf's hinge for each house id. Rotating it about y opens the door (negative = inward). */
  doorHinges: Map<string, Object3D>;
  update(dt: number, frame: FrameInfo): void;
  dispose(): void;
}
