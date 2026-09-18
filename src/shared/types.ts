/**
 * Domain types shared by BOTH layers (React UI and the 3D engine).
 *
 * Nothing in `src/shared/` may import Three.js or the engine. This directory is the contract
 * between the two layers, and keeping it engine-free is what allows the whole
 * engine to be lazy-loaded only when the player presses Play.
 *
 * The full data model (items, houses, offering manifests, spawn rules) is
 * specified in `docs/GAME_DESIGN.md` §6 and lands with the systems that use it.
 * Only types that the current event contract actually needs live here.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** App-level state machine owned by React. See GAME_DESIGN.md §3.1. */
export type AppState = 'menu' | 'playing';

/** Mirrors the engine's PlayerStateId values; duplicated here so React never imports the engine. */
export type PlayerStateName = 'idle' | 'walking' | 'running' | 'sneaking' | 'interacting' | 'hidden';

/** Moon cycle phases owned by MoonCycleSystem. See GAME_DESIGN.md §3.2. */
export type MoonPhase = 'day' | 'dusk' | 'moonrise' | 'moonlight' | 'moonset';

export interface MoonState {
  phase: MoonPhase;
  /** 0..1 progress through the current phase. */
  phaseProgress: number;
  cycleIndex: number;
  /** Derived: true while standing outside costs purity. */
  isDangerous: boolean;
}

export interface RunStats {
  itemsCollected: number;
  /** Times purity reached zero and a temple cleansing was required. */
  cleansings: number;
  /** Total milliseconds spent in moonlight without shelter. */
  msExposed: number;
  /** Sheltered during the moonrise grace window rather than earlier. */
  closeCalls: number;
}

export interface ScoreBreakdown {
  offeringPoints: number;
  timeBonus: number;
  purityBonus: number;
  /** Rewards sheltering late; stops "hide all night" from being optimal. */
  riskBonus: number;
  cleansingPenalty: number;
  total: number;
}

export interface RunResult {
  seed: number;
  completed: boolean;
  durationMs: number;
  breakdown: ScoreBreakdown;
  stats: RunStats;
}
