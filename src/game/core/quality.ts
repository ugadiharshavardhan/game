/**
 * How hard this device is asked to work, in one table.
 *
 * Everything expensive in the game reads a number from here rather than deciding for itself:
 * the renderer's pixel ratio and shadows, how far the village draws, how many real lights and
 * particles there are, how sharp the textures are, and how many teammates are drawn at once.
 * A phone gets the low row and still gets the whole game — the same village, the same moon, the
 * same puja — drawn with less of everything that cannot be seen at arm's length.
 */
import type { QualityLevel } from '../../shared/types';

export interface QualityProfile {
  name: Exclude<QualityLevel, 'auto'>;
  /** Cap on devicePixelRatio: the single biggest cost on a phone. */
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Multisampling in the post-processing target (0 = off). */
  msaa: number;
  bloom: boolean;
  /** Multiplier on every level-of-detail and culling distance in the village. */
  detail: number;
  /** Real point lights following the player through the village. */
  lamps: number;
  /** Ambient particles (fireflies, dust, leaves) alive at once. */
  particles: number;
  /** Texture sharpness at grazing angles. */
  anisotropy: number;
  /** Widest a loaded texture may be: everything larger is redrawn smaller at load. */
  textureSize: number;
  /** Sample rate the ambience beds are synthesised at. */
  audioRate: number;
  /** The low drift of mist between the houses. */
  mist: boolean;
  /** Teammates drawn as ghosts at once. */
  ghosts: number;
}

export const PROFILES: Record<Exclude<QualityLevel, 'auto'>, QualityProfile> = {
  // A phone: half the pixels, no shadow map, no bloom, the village drawn two thirds as far.
  low: { name: 'low', pixelRatio: 1, shadows: false, shadowMapSize: 1024, msaa: 0, bloom: false, detail: 0.68, lamps: 3, particles: 40, anisotropy: 2, textureSize: 512, audioRate: 16000, mist: false, ghosts: 2 },
  // A laptop.
  medium: { name: 'medium', pixelRatio: 1.5, shadows: true, shadowMapSize: 1536, msaa: 2, bloom: true, detail: 0.85, lamps: 5, particles: 90, anisotropy: 4, textureSize: 1024, audioRate: 22050, mist: true, ghosts: 3 },
  // A desktop with a real GPU: everything.
  high: { name: 'high', pixelRatio: 2, shadows: true, shadowMapSize: 2048, msaa: 4, bloom: true, detail: 1, lamps: 6, particles: 140, anisotropy: 8, textureSize: 2048, audioRate: 22050, mist: true, ghosts: 3 },
};

/** What this device looks like, when the player has not chosen for themselves. */
export function detectProfile(): QualityProfile {
  if (typeof navigator === 'undefined') return PROFILES.medium;
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (coarse || cores <= 4 || memory <= 4) return PROFILES.low;
  if (cores <= 8 || memory <= 8) return PROFILES.medium;
  return PROFILES.high;
}

export function profileFor(level: QualityLevel | undefined): QualityProfile {
  if (!level || level === 'auto') return detectProfile();
  return PROFILES[level];
}
