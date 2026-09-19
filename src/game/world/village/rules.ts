/**
 * Level-design rules, in walking metres. The level tests hold the layout to these, and the moon
 * cycle will be tuned against them.
 *
 * Why 40 m to shelter: dusk + moonrise gives ~25 s of warning (GAME_DESIGN.md §3.2). At a walk
 * (2.2 m/s) that is 55 m; 40 m leaves room for a player who reads the sky a little late. A player
 * who runs (5 m/s) can cover it in 8 s — the difference between those two is the whole game.
 */
export const LEVEL_RULES = {
  /** Every important place must have a shelter door within this walk. */
  maxWalkToShelter: 40,
  /**
   * Nowhere walkable — not even the pradakshina path behind the sanctum — is further than this.
   * 55 m is 11 s at a run: well inside the ~25 s warning, so there are no dead zones.
   */
  maxAnywhereToShelter: 55,
  /** 'near-temple' offering spots are at most this far from the offering point. */
  nearTemple: 38,
  /** 'far-from-temple' spots are at least this far. */
  farFromTemple: 80,
  /** 'near-shelter' spots have a shelter door within this walk (~7 s at a walk). */
  nearShelter: 16,
  /** 'risky' spots have no shelter door within this walk. */
  risky: 20,
  /** An alternative route (avoiding the shortest one's corridor) must be at most this much longer. */
  alternativeRouteFactor: 1.8,
  /** Width of the corridor the alternative route must avoid, metres either side. */
  routeCorridor: 3,
  /** The alternative may share this much of the route at each end (doors, gates). */
  routeSharedEnds: 12,
} as const;
