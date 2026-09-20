/**
 * The moon clock: SAFE → WARNING → MOON_RISING → MOON_ACTIVE → MOON_FADING → SAFE …
 *
 * A plain in-game cycle with configurable durations (MoonState.ts) and a little seeded jitter, so
 * a player learns to read the sky instead of counting seconds. Everything else — the lighting, the
 * ambience, the villagers walking home, the dogs, the exposure rate, the HUD — follows this one
 * object's `state`, `progress` and `moonlight`.
 */
import { DEFAULT_MOON_CONFIG, exposureRateFor, MOON_STATE_INFO, MOON_STATES, type MoonCycleConfig, type MoonStateInfo, type MoonStateName, moonlightFor } from './MoonState';

export type MoonListener = (state: MoonStateName, info: MoonStateInfo) => void;

export class MoonManager {
  state: MoonStateName = 'safe';
  /** 0..1 through the current state. */
  progress = 0;
  /** Completed cycles. */
  cycle = 0;

  private elapsed = 0;
  private length: number;
  private readonly random: () => number;
  private readonly config: MoonCycleConfig;
  private readonly listeners = new Set<MoonListener>();

  constructor(config: MoonCycleConfig = DEFAULT_MOON_CONFIG, seed = 1) {
    this.config = config;
    this.random = mulberry32(seed);
    this.length = config.firstSafe;
  }

  get info(): MoonStateInfo {
    return MOON_STATE_INFO[this.state];
  }

  /** Standing outside costs exposure. */
  get dangerous(): boolean {
    return this.info.dangerous;
  }

  /** The signs are showing: villagers head home, dogs settle, the bell has rung. */
  get goingHome(): boolean {
    return this.info.goingHome;
  }

  /** 0..1 of moonlight in the world. */
  get moonlight(): number {
    return moonlightFor(this.state, this.progress);
  }

  /** 0..1 multiplier on how fast exposure builds outdoors. */
  get exposureRate(): number {
    return exposureRateFor(this.state, this.progress);
  }

  /** Seconds left in this state (the UI never shows it; the NPCs use it to time their walk home). */
  get remaining(): number {
    return Math.max(this.length - this.elapsed, 0);
  }

  /** Seconds until the moon's light starts to bite, or Infinity once it has. */
  get untilMoonlight(): number {
    if (this.state === 'safe') return this.remaining + this.config.durations.warning;
    if (this.state === 'warning') return this.remaining;
    return 0;
  }

  onState(listener: MoonListener): () => void {
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

  /** Jump straight to a state (developer tools, tests). */
  skipTo(state: MoonStateName): void {
    this.set(state);
  }

  /**
   * Winds the cycle on as if it had been running for `seconds` — how a player who joins a team's
   * village an hour late gets the same moon, in the same place, as everyone already in it. Done
   * in one step per state rather than in frames, so a long night costs nothing to catch up on.
   */
  windForward(seconds: number): void {
    let left = Math.max(0, seconds);
    let guard = 0;
    while (left >= this.length - this.elapsed && guard++ < 10000) {
      left -= this.length - this.elapsed;
      this.elapsed = 0;
      this.advance();
    }
    this.elapsed += left;
    this.progress = Math.min(this.elapsed / this.length, 1);
  }

  private advance(): void {
    const next = MOON_STATES[(MOON_STATES.indexOf(this.state) + 1) % MOON_STATES.length];
    if (next === 'safe') this.cycle++;
    this.set(next);
  }

  private set(state: MoonStateName): void {
    this.state = state;
    this.elapsed = 0;
    this.progress = 0;
    const j = this.config.jitter;
    this.length = this.config.durations[state] * (1 + (this.random() * 2 - 1) * j);
    for (const l of this.listeners) l(state, MOON_STATE_INFO[state]);
  }
}

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
