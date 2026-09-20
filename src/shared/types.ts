/**
 * Domain types shared by BOTH layers (React UI and the 3D engine).
 *
 * Nothing in `src/shared/` may import Three.js or the engine. This directory is the contract
 * between the two layers, and keeping it engine-free is what allows the whole
 * engine to be lazy-loaded only when the player presses Play.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** App-level state machine owned by React. */
export type AppState = 'menu' | 'playing' | 'results';

/** Mirrors the engine's PlayerStateId values; duplicated here so React never imports the engine. */
export type PlayerStateName = 'idle' | 'walking' | 'running' | 'sneaking' | 'interacting' | 'hidden';

/** The moon's cycle (see game/moon/MoonState.ts): SAFE → WARNING → RISING → ACTIVE → FADING. */
export type MoonStateName = 'safe' | 'warning' | 'rising' | 'active' | 'fading';

/** How much of the moon has fallen on the player (game/moon/ExposureSystem.ts). */
export type ExposureLevel = 'calm' | 'exposed' | 'warn' | 'danger';

export interface RunStats {
  /** Offerings picked up, counting everything taken. */
  itemsCollected: number;
  /** Offerings dropped under the moon and never picked up again. */
  itemsLost: number;
  /** Times the player reached a shelter while the moon was out. */
  shelterEvents: number;
  /** Moons that rose during the run. */
  moonlightEncounters: number;
  /** Times the moonlight overwhelmed the player. */
  overwhelmed: number;
  durationMs: number;
  /** Metres walked. */
  distanceTravelled: number;
  /** Seconds spent in moonlight without shelter. */
  exposedSeconds: number;
}

export interface ScoreBreakdown {
  items: number;
  shelter: number;
  efficiency: number;
  timeBonus: number;
  penalties: number;
  total: number;
}

export interface RunResult {
  stats: RunStats;
  breakdown: ScoreBreakdown;
  /** 0..1 — metres walked against the shortest route that would have done it. */
  efficiency: number;
  completedAt: number;
}

/** One line on the local best-scores list. */
export interface LeaderboardEntry {
  score: number;
  durationMs: number;
  playedAt: number;
}
