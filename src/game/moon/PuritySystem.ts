/**
 * Purity (GAME_DESIGN.md §2.3): the moon does not kill. Standing in moonlight drains purity —
 * faster on open ground than in the lanes between houses — and indoors it can't touch you at all.
 * It recovers indoors, and slowly while the clouds cover the moon.
 *
 * At zero the player is overwhelmed: the caller drops half the bag where they stand (recoverable),
 * and purity comes back part-way so they can still reach a door.
 */
export interface PurityConfig {
  max: number;
  /** Per second, in moonlight on open ground (the festival ground, fields, groves). */
  drainOpen: number;
  /** Per second, in moonlight among the houses. */
  drainCovered: number;
  /** Per second, indoors. */
  recoverIndoors: number;
  /** Per second, outdoors while the moon is hidden. */
  recoverOutdoors: number;
  /** Where purity returns to after a failure. */
  afterFailure: number;
}

export const DEFAULT_PURITY_CONFIG: PurityConfig = {
  max: 100,
  drainOpen: 8,
  drainCovered: 5,
  recoverIndoors: 15,
  recoverOutdoors: 2.5,
  afterFailure: 40,
};

export interface Exposure {
  /** The moon is out. */
  dangerous: boolean;
  /** Inside a shelter's room. */
  sheltered: boolean;
  /** On open ground with no cover. */
  openGround: boolean;
}

export class PuritySystem {
  value: number;
  /** Losing purity right now. */
  exposed = false;
  failures = 0;
  /** Total seconds spent exposed (for the score). */
  exposedSeconds = 0;
  private readonly config: PurityConfig;

  constructor(config: PurityConfig = DEFAULT_PURITY_CONFIG) {
    this.config = config;
    this.value = config.max;
  }

  /** Returns true on the frame purity runs out (the caller handles the consequences). */
  update(dt: number, e: Exposure): boolean {
    const c = this.config;
    this.exposed = e.dangerous && !e.sheltered;
    if (this.exposed) {
      this.exposedSeconds += dt;
      this.value -= (e.openGround ? c.drainOpen : c.drainCovered) * dt;
      if (this.value <= 0) {
        this.failures++;
        this.value = c.afterFailure;
        return true;
      }
    } else {
      this.value += (e.sheltered ? c.recoverIndoors : c.recoverOutdoors) * dt;
    }
    this.value = Math.min(this.value, c.max);
    return false;
  }
}
