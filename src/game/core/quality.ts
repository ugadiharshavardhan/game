/**
 * How hard this device is asked to work, in one table.
 *
 * Everything expensive in the game reads a number from here rather than deciding for itself:
 * the renderer's pixel ratio and shadows, how far the village draws, how many real lights and
 * particles there are, how sharp the textures are, and how many teammates are drawn at once.
 * A phone gets the same village, the same moon, the same puja and every teammate — drawn with
 * less of what cannot be seen at arm's length.
 *
 * These are the *starting* values. What can change without recompiling shaders or reloading
 * textures (pixel ratio, shadow map size and update rate, bloom, particle count, draw distances,
 * crowd animation rate) is then adjusted live by the PerformanceManager; what cannot (MSAA, the
 * number of real lights, texture sizes) is fixed here for the run.
 */
import type { QualityLevel } from '../../shared/types';

export type QualityTier = Exclude<QualityLevel, 'auto'>;

export interface QualityProfile {
  name: QualityTier;
  /** Cap on devicePixelRatio: the single biggest cost on a phone. */
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Multisampling in the post-processing target (0 = off). */
  msaa: number;
  bloom: boolean;
  /** Multiplier on every level-of-detail and culling distance in the village. */
  detail: number;
  /** Real point lights following the player through the village (every other flame is emissive). */
  lamps: number;
  /** Ambient particles (fireflies, dust) the buffers are built for; the live count may be lower. */
  particles: number;
  /** Texture sharpness at grazing angles. */
  anisotropy: number;
  /** Widest a loaded texture may be: everything larger is redrawn smaller at load. */
  textureSize: number;
  /** Sample rate the ambience beds are synthesised at. */
  audioRate: number;
  /** Teammates drawn as ghosts at once. Always the whole team: nobody's teammate is culled for speed. */
  ghosts: number;
}

export const PROFILES: Record<QualityTier, QualityProfile> = {
  // A struggling device: a small shadow map updated every few frames, no bloom, nearer detail.
  low: { name: 'low', pixelRatio: 1, shadows: true, shadowMapSize: 512, msaa: 0, bloom: false, detail: 0.75, lamps: 2, particles: 60, anisotropy: 2, textureSize: 512, audioRate: 16000, ghosts: 3 },
  // A phone or a laptop.
  medium: { name: 'medium', pixelRatio: 1.5, shadows: true, shadowMapSize: 1024, msaa: 2, bloom: true, detail: 0.9, lamps: 4, particles: 100, anisotropy: 4, textureSize: 1024, audioRate: 22050, ghosts: 3 },
  // A desktop with a real GPU: everything.
  high: { name: 'high', pixelRatio: 2, shadows: true, shadowMapSize: 2048, msaa: 4, bloom: true, detail: 1, lamps: 6, particles: 140, anisotropy: 8, textureSize: 2048, audioRate: 22050, ghosts: 3 },
};

export interface DeviceInfo {
  /** A phone or tablet: a touch screen as the primary pointer. */
  mobile: boolean;
  cores: number;
  /** navigator.deviceMemory in GB (Chrome only; 4 when unknown). */
  memory: number;
  dpr: number;
  label: string;
}

/** What this device is, as far as a browser will say. */
export function detectDevice(): DeviceInfo {
  if (typeof navigator === 'undefined') return { mobile: false, cores: 4, memory: 4, dpr: 1, label: 'unknown' };
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const touch = (navigator.maxTouchPoints ?? 0) > 0;
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const mobile = (coarse && touch) || uaMobile;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return { mobile, cores, memory, dpr, label: `${mobile ? 'mobile' : 'desktop'} · ${cores} cores · ${memory} GB · dpr ${dpr}` };
}

/**
 * Where AUTO starts. Not "a phone is slow": a phone starts at MEDIUM (a modern phone draws it
 * well) and a desktop at HIGH; only a device that says outright it is very small starts LOW. The
 * frame rate decides from there — see PerformanceManager.
 */
export function startingTier(d: DeviceInfo): QualityTier {
  if (d.mobile) return d.memory <= 2 || d.cores <= 2 ? 'low' : 'medium';
  return d.memory <= 2 || d.cores <= 2 ? 'medium' : 'high';
}

/** The pixel-ratio cap for each tier on this device: what the PerformanceManager scales down from. */
export function pixelCaps(device: DeviceInfo): Record<QualityTier, number> {
  const caps = {} as Record<QualityTier, number>;
  for (const tier of Object.keys(PROFILES) as QualityTier[]) caps[tier] = profileFor(tier, device).pixelRatio;
  return caps;
}

/** The profile for a tier on this device: a phone's pixels are capped harder, and it gets no MSAA target. */
export function profileFor(level: QualityLevel | undefined, device: DeviceInfo = detectDevice()): QualityProfile {
  const tier = !level || level === 'auto' ? startingTier(device) : level;
  const base = PROFILES[tier];
  if (!device.mobile) return base;
  // A multisampled half-float target is the most expensive thing a phone's GPU can be asked for,
  // and with MSAA 0 and no bloom the phone draws straight to the (natively antialiased) screen.
  return { ...base, pixelRatio: tier === 'high' ? 1.5 : tier === 'medium' ? 1.5 : 1.25, msaa: 0 };
}
