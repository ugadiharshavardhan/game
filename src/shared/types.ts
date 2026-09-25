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

/** How hard the renderer is allowed to work. 'auto' asks the device. */
export type QualityLevel = 'auto' | 'low' | 'medium' | 'high';

/** Everything the player can change about how the game runs. */
export interface GameSettings {
  /** Look sensitivity, 0.25–3. */
  sensitivity: number;
  invertY: boolean;
  /** Master volume, 0–1. */
  volume: number;
  quality: QualityLevel;
  /** Touch controls: shown on a touch device by default, but forceable either way. */
  showTouchControls: 'auto' | 'on' | 'off';
}

/** Mirrors the engine's PlayerStateId values; duplicated here so React never imports the engine. */
export type PlayerStateName = 'idle' | 'walking' | 'fast-walking' | 'running' | 'sneaking' | 'jumping' | 'interacting' | 'hidden' | 'sitting' | 'sleeping';

/** The moon's cycle (see game/moon/MoonState.ts): SAFE → WARNING → RISING → ACTIVE → FADING. */
export type MoonStateName = 'safe' | 'warning' | 'rising' | 'active' | 'fading';

/**
 * Where the night has got to (see game/night/NightClock.ts). A run walks through all three once:
 *
 *   evening  the sun is going; the village is still about its business and no moon may rise
 *   night    the working hours of the run: clouds cover the moon, then draw back, then cover again
 *   dawn     05:00 is close; the moon is retired for good and the sky lifts
 */
export type NightPhase = 'evening' | 'night' | 'dawn';

/** How much of the moon has fallen on the player (game/moon/ExposureSystem.ts). */
export type ExposureLevel = 'calm' | 'exposed' | 'warn' | 'danger';

/** What the moonlight has cost the player so far (game/health/HealthSystem.ts). */
export type HealthLevel = 'well' | 'grazed' | 'hurt' | 'critical';

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
  /** Every offering was before Bappa before 05:00. False when dawn broke first. */
  pujaComplete: boolean;
}

export interface ScoreBreakdown {
  items: number;
  shelter: number;
  efficiency: number;
  /** The puja itself: awarded once, and only to a run that finished before dawn. */
  completion: number;
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
