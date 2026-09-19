/**
 * The clock (GAME_DESIGN.md §3.2). Monsoon clouds cover the Chaturthi moon and part again:
 *
 *   day ─► dusk ─► moonrise ─► moonlight ─► moonset ─► day …
 *   calm   the clouds   GRACE:     danger:      the clouds
 *          thin, lamps  run for    shelter or   gather again
 *          are lit      a door     lose purity
 *
 * Durations carry seeded jitter (±10 %), so players learn to read the sky rather than count.
 * Moonrise is the anti-unfairness valve: from the moment danger is certain there are always
 * five seconds, and the level guarantees a door within reach (level.test.ts).
 */
import type { MoonPhase } from '../../shared/types';

export const MOON_PHASES: readonly MoonPhase[] = ['day', 'dusk', 'moonrise', 'moonlight', 'moonset'];

export interface MoonCycleConfig {
  /** Seconds per phase, before jitter. */
  durations: Record<MoonPhase, number>;
  /** The first calm stretch is longer: time to learn the village before the first moon. */
  firstDay: number;
  /** ± fraction of each duration, seeded. */
  jitter: number;
}

export const DEFAULT_MOON_CONFIG: MoonCycleConfig = {
  durations: { day: 45, dusk: 20, moonrise: 5, moonlight: 25, moonset: 6 },
  firstDay: 70,
  jitter: 0.1,
};

export class MoonCycle {
  phase: MoonPhase = 'day';
  /** 0..1 through the current phase. */
  progress = 0;
  /** Completed cycles. */
  cycle = 0;
  private elapsed = 0;
  private length: number;
  private readonly random: () => number;
  private readonly config: MoonCycleConfig;
  private readonly listeners = new Set<(phase: MoonPhase) => void>();

  constructor(config: MoonCycleConfig = DEFAULT_MOON_CONFIG, seed = 1) {
    this.config = config;
    this.random = mulberry32(seed);
    this.length = config.firstDay;
  }

  /** Moonlight is falling: standing outside costs purity. */
  get dangerous(): boolean {
    return this.phase === 'moonlight';
  }

  /** How much moonlight is in the world, 0..1 — what the sky, the light and the fog follow. */
  get moonlight(): number {
    const t = smooth(this.progress);
    switch (this.phase) {
      case 'day':
        return 0;
      case 'dusk':
        return 0.28 * t;
      case 'moonrise':
        return 0.28 + 0.72 * t;
      case 'moonlight':
        return 1;
      case 'moonset':
        return 1 - t;
    }
  }

  /** Seconds left in the current phase. */
  get remaining(): number {
    return this.length - this.elapsed;
  }

  onPhase(listener: (phase: MoonPhase) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(dt: number): void {
    this.elapsed += dt;
    while (this.elapsed >= this.length) {
      this.elapsed -= this.length;
      this.advance();
    }
    this.progress = Math.min(this.elapsed / this.length, 1);
  }

  /** Jump straight to a phase (developer tools, tests). */
  skipTo(phase: MoonPhase): void {
    this.set(phase);
  }

  private advance(): void {
    const next = MOON_PHASES[(MOON_PHASES.indexOf(this.phase) + 1) % MOON_PHASES.length];
    if (next === 'day') this.cycle++;
    this.set(next);
  }

  private set(phase: MoonPhase): void {
    this.phase = phase;
    this.elapsed = 0;
    this.progress = 0;
    const j = this.config.jitter;
    this.length = this.config.durations[phase] * (1 + (this.random() * 2 - 1) * j);
    for (const l of this.listeners) l(phase);
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Small seeded PRNG: a seed reproduces a run's moon exactly. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
