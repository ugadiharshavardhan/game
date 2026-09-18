/**
 * Every tunable number in one place.
 *
 * Balance values live here rather than inline so that the moon cycle can be
 * tuned against real playtesters (GAME_DESIGN.md §8, risk 5) without hunting
 * through scene code.
 */

/** Scene keys. A const object, not an enum — `erasableSyntaxOnly` is on. */
export const SceneKey = {
  Boot: 'Boot',
  Preload: 'Preload',
  Village: 'Village',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];

/** World dimensions in pixels. Roughly 2x the widest expected viewport. */
export const WORLD = {
  width: 2048,
  height: 1536,
  tileSize: 64,
} as const;

export const PLAYER = {
  /** Pixels per second. Also the basis of the spawn reachability invariant. */
  speed: 210,
  bodyRadius: 13,
  size: 30,
} as const;

/**
 * Responsive framing. See `utils/viewport.ts` for how these are applied.
 * `minVisible*` is the world area the design guarantees is always on screen.
 */
export const VIEW = {
  minVisibleWidth: 640,
  minVisibleHeight: 480,
  minZoom: 0.75,
  maxZoom: 2.5,
} as const;

/** Virtual joystick geometry, in screen pixels. Touch only. */
export const JOYSTICK = {
  baseRadius: 56,
  thumbRadius: 26,
  /** Drag distance at which the stick reads as fully deflected. */
  maxDeflection: 48,
  /** Ignore micro-drags so a tap isn't read as movement. */
  deadZone: 6,
} as const;

/** Render order. Named so depth fights are resolved in one place. */
export const DEPTH = {
  ground: 0,
  structure: 10,
  player: 20,
  overlay: 100,
  ui: 1000,
} as const;

/**
 * Palette as Phaser hex numbers. The React UI uses the Tailwind theme tokens in
 * `src/index.css`; these are their canvas-side counterparts. Keep them in sync.
 */
export const COLORS = {
  nightSky: 0x0b1020,
  ground: 0x2a2416,
  groundAlt: 0x322b1b,
  gridLine: 0x3d3424,
  player: 0xf6c453,
  playerAccent: 0x7c2d12,
  structure: 0x4a3b2a,
  structureRoof: 0x6b4423,
  temple: 0xc2703d,
  joystick: 0xf6c453,
} as const;
