/**
 * Keeps the frame rate up by giving things up in a fixed order, and takes them back when it can.
 *
 * The device's starting tier (quality.ts) decides what is fixed for the run. From there the game
 * measures itself: frame rate over a rolling one-second window, read as GOOD (over 50), OK (35–50)
 * or POOR (under 35). Two POOR windows in a row step one rung down a ladder; a long run of GOOD
 * steps one rung back up. OK holds still. The rungs give things up in the order a player notices
 * them least:
 *
 *   render scale → shadow map size → shadow update rate → bloom → particles → draw distance
 *   (LOD / culling) → how often distant villagers and teammates animate
 *
 * and crossing from one tier's rungs into the next's is what "MEDIUM drops to LOW" means. Nothing
 * on the ladder removes the village, a teammate, or anything the game is played with.
 *
 * Hysteresis: after any change it waits for the new cost to show before judging again; a step up
 * that is followed straight away by a step down is a regret, which doubles the patience before the
 * next try, and after a few the manager stops trying to climb at all. A device on the edge settles.
 *
 * Pure arithmetic on frame times — no renderer, no DOM. The engine applies what it reports.
 */
import type { QualityLevel } from '../../shared/types';
import type { DeviceInfo, QualityProfile, QualityTier } from './quality';

/** One rung: everything the ladder may change without recompiling a shader. */
export interface Rung {
  tier: QualityTier;
  /** Multiplier on the tier's pixel-ratio cap. */
  scale: number;
  shadowMapSize: number;
  /** Redraw the shadow map every n frames. */
  shadowEvery: number;
  bloom: boolean;
  /** Fraction of the particle buffer drawn. */
  particles: number;
  /** Multiplier on LOD and culling distances. */
  lodScale: number;
  /** Animation rate for villagers and teammates beyond conversation distance. */
  npcHz: number;
}

/** Best first. Each rung changes one kind of thing from the one above it. */
export const LADDER: readonly Rung[] = [
  { tier: 'high', scale: 1, shadowMapSize: 2048, shadowEvery: 1, bloom: true, particles: 1, lodScale: 1, npcHz: 30 },
  { tier: 'high', scale: 0.85, shadowMapSize: 2048, shadowEvery: 1, bloom: true, particles: 1, lodScale: 1, npcHz: 30 },
  { tier: 'high', scale: 0.85, shadowMapSize: 1024, shadowEvery: 1, bloom: true, particles: 1, lodScale: 1, npcHz: 30 },
  { tier: 'medium', scale: 1, shadowMapSize: 1024, shadowEvery: 1, bloom: true, particles: 0.8, lodScale: 1, npcHz: 24 },
  { tier: 'medium', scale: 0.85, shadowMapSize: 1024, shadowEvery: 1, bloom: true, particles: 0.8, lodScale: 1, npcHz: 24 },
  { tier: 'medium', scale: 0.85, shadowMapSize: 1024, shadowEvery: 2, bloom: true, particles: 0.8, lodScale: 1, npcHz: 24 },
  { tier: 'medium', scale: 0.8, shadowMapSize: 1024, shadowEvery: 2, bloom: false, particles: 0.8, lodScale: 1, npcHz: 24 },
  { tier: 'medium', scale: 0.8, shadowMapSize: 1024, shadowEvery: 2, bloom: false, particles: 0.45, lodScale: 1, npcHz: 24 },
  { tier: 'low', scale: 1, shadowMapSize: 512, shadowEvery: 3, bloom: false, particles: 0.4, lodScale: 0.85, npcHz: 15 },
  { tier: 'low', scale: 0.85, shadowMapSize: 512, shadowEvery: 3, bloom: false, particles: 0.3, lodScale: 0.8, npcHz: 12 },
  { tier: 'low', scale: 0.72, shadowMapSize: 512, shadowEvery: 4, bloom: false, particles: 0.2, lodScale: 0.75, npcHz: 10 },
];

export type FrameVerdict = 'good' | 'ok' | 'poor';

/** GOOD above this frame rate, POOR below the second; OK between. */
export const GOOD_FPS = 50;
export const POOR_FPS = 35;

export function verdict(fps: number): FrameVerdict {
  return fps > GOOD_FPS ? 'good' : fps < POOR_FPS ? 'poor' : 'ok';
}

/** The live settings every system reads each frame (one object, mutated in place: no garbage). */
export interface LiveQuality {
  tier: QualityTier;
  pixelRatio: number;
  shadowMapSize: number;
  shadowEvery: number;
  bloom: boolean;
  particles: number;
  lodScale: number;
  npcHz: number;
}

export interface PerformanceOptions {
  requested: QualityLevel;
  device: DeviceInfo;
  /** The run's fixed profile (quality.ts `profileFor`). */
  profile: QualityProfile;
  /** Pixel-ratio cap per tier on this device (the profiles' caps, with the phone's). */
  caps: Record<QualityTier, number>;
}

/** One measurement window, seconds. */
const WINDOW = 1;
/** Start-up hitches (shader compiles, texture uploads) are not the device's real speed. */
const WARMUP = 4;
/** After a change, time for its cost (or saving) to show before judging again. */
const SETTLE = 2;
/** POOR windows in a row before stepping down. */
const POOR_WINDOWS = 2;
/** Failed climbs before the manager settles for good. */
const MAX_REGRETS = 3;
/** A frame this long was a tab switch or a pause, not a measurement. */
const SPIKE = 0.5;
const MIN_PIXEL_RATIO = 0.6;

export class PerformanceManager {
  readonly live: LiveQuality;
  readonly adaptive: boolean;
  private readonly first: number;
  private readonly last: number;
  private readonly caps: Record<QualityTier, number>;
  private readonly dpr: number;
  private step: number;
  private clock = 0;
  private settleUntil = WARMUP;
  private time = 0;
  private frames = 0;
  private worst = 0;
  private poorRun = 0;
  private goodFor = 0;
  /** How long GOOD must last before climbing: doubles after each regret. */
  private patience = 8;
  private regrets = 0;
  private lastClimb = -Infinity;
  /** Last completed window, for the debug panel. */
  fps = 0;
  worstMs = 0;

  constructor(o: PerformanceOptions) {
    const tier = o.profile.name;
    this.adaptive = o.requested === 'auto';
    this.caps = o.caps;
    this.dpr = Math.max(o.device.dpr, 0.5);
    const start = LADDER.findIndex((r) => r.tier === tier);
    // AUTO may fall all the way to the bottom; a tier the player chose keeps to its own rungs.
    this.first = start;
    this.last = this.adaptive ? LADDER.length - 1 : LADDER.length - 1 - [...LADDER].reverse().findIndex((r) => r.tier === tier);
    // A phone never climbs above where it started: sustained load is heat, and heat is throttling.
    this.step = start;
    this.live = { tier, pixelRatio: 1, shadowMapSize: 0, shadowEvery: 1, bloom: false, particles: 1, lodScale: 1, npcHz: 30 };
    this.apply();
  }

  get rung(): number {
    return this.step - this.first;
  }

  get rungs(): number {
    return this.last - this.first + 1;
  }

  /** Feed one frame's real duration. True when the live settings changed this frame. */
  frame(dt: number): boolean {
    if (dt > SPIKE || dt <= 0) return false;
    this.clock += dt;
    this.time += dt;
    this.frames++;
    this.worst = Math.max(this.worst, dt);
    if (this.time < WINDOW) return false;
    this.fps = this.frames / this.time;
    this.worstMs = this.worst * 1000;
    this.time = 0;
    this.frames = 0;
    this.worst = 0;
    if (this.clock < this.settleUntil) return false;

    const v = verdict(this.fps);
    if (v === 'poor') {
      this.goodFor = 0;
      this.poorRun++;
      if (this.poorRun >= POOR_WINDOWS && this.step < this.last) {
        this.poorRun = 0;
        if (this.clock - this.lastClimb < SETTLE + WINDOW * 4) {
          this.regrets++;
          this.patience *= 2;
        }
        return this.moveTo(this.step + 1);
      }
      return false;
    }
    this.poorRun = 0;
    if (v === 'good' && this.step > this.first && this.regrets < MAX_REGRETS) {
      this.goodFor += WINDOW;
      if (this.goodFor >= this.patience) {
        this.goodFor = 0;
        this.lastClimb = this.clock;
        return this.moveTo(this.step - 1);
      }
      return false;
    }
    this.goodFor = 0;
    return false;
  }

  private moveTo(step: number): boolean {
    this.step = Math.min(Math.max(step, this.first), this.last);
    this.settleUntil = this.clock + SETTLE;
    return this.apply();
  }

  private apply(): boolean {
    const r = LADDER[this.step];
    const l = this.live;
    const before = `${l.tier}${l.pixelRatio}${l.shadowMapSize}${l.shadowEvery}${l.bloom}${l.particles}${l.lodScale}${l.npcHz}`;
    l.tier = r.tier;
    l.pixelRatio = Math.max(MIN_PIXEL_RATIO, +(Math.min(this.dpr, this.caps[r.tier]) * r.scale).toFixed(3));
    l.shadowMapSize = r.shadowMapSize;
    l.shadowEvery = r.shadowEvery;
    l.bloom = r.bloom;
    l.particles = r.particles;
    l.lodScale = r.lodScale;
    l.npcHz = r.npcHz;
    return before !== `${l.tier}${l.pixelRatio}${l.shadowMapSize}${l.shadowEvery}${l.bloom}${l.particles}${l.lodScale}${l.npcHz}`;
  }
}
