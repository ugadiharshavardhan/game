/**
 * Exposure, 0–100: how much of the Chaturthi moon has fallen on you.
 *
 *   safe period      0, and anything left drains away
 *   moonlight        it climbs while you are outside, from
 *                      · how much moonlight is falling (the moon's state)
 *                      · cover — open ground is worst, a lane between houses is better,
 *                        a veranda or a tree better still
 *                      · how you move — running catches the light, sneaking keeps you low
 *                      · how far the nearest door is (a long way out is a long way back)
 *   inside a shelter 0 — and it clears fast
 *
 * Nothing here ends a run. At 100 the caller decides what "overwhelmed" means (a few offerings
 * dropped, the neighbours pulling you indoors); exposure comes back to zero and play goes on.
 */
export type Gait = 'still' | 'sneak' | 'walk' | 'run';

export interface ExposureConfig {
  max: number;
  /** Points per second at full moonlight, walking, in the lanes. */
  baseRate: number;
  /** Cover multipliers. */
  openMultiplier: number;
  laneMultiplier: number;
  coveredMultiplier: number;
  /** How movement carries: sneaking keeps you in the shadows, running does not. */
  gait: Record<Gait, number>;
  /** Beyond this distance from a shelter door, exposure builds faster. */
  farFrom: number;
  perMetre: number;
  maxDistanceMultiplier: number;
  /** Points per second back indoors, and outdoors once the moon is gone. */
  recoverIndoors: number;
  recoverOutdoors: number;
  /** "Find shelter!" appears here; the screen tightens at `dangerAt`. */
  warnAt: number;
  dangerAt: number;
}

export const DEFAULT_EXPOSURE_CONFIG: ExposureConfig = {
  max: 100,
  // Tuned so that even the worst case — running across open ground, far from any door — leaves
  // the best part of ten seconds, and an ordinary walk home leaves twenty.
  baseRate: 4.5,
  openMultiplier: 1.4,
  laneMultiplier: 1,
  coveredMultiplier: 0.45,
  gait: { still: 0.85, sneak: 0.6, walk: 1, run: 1.3 },
  farFrom: 15,
  perMetre: 0.008,
  maxDistanceMultiplier: 1.35,
  recoverIndoors: 32,
  recoverOutdoors: 9,
  warnAt: 55,
  dangerAt: 82,
};

export interface ExposureInput {
  /** 0..1 — how hard the moon is shining (MoonManager.exposureRate). */
  moonRate: number;
  /** Inside a shelter's room. */
  sheltered: boolean;
  /** On open ground with no cover at all. */
  openGround: boolean;
  /** Under a roof, a veranda or a thick tree. */
  covered: boolean;
  gait: Gait;
  /** Metres to the nearest shelter door. */
  shelterDistance: number;
}

export type ExposureLevel = 'calm' | 'exposed' | 'warn' | 'danger';

export class ExposureSystem {
  value = 0;
  /** Climbing right now. */
  rising = false;
  /** Times the player was overwhelmed. */
  failures = 0;
  /** Total seconds spent in moonlight without shelter. */
  exposedSeconds = 0;
  private readonly config: ExposureConfig;

  constructor(config: ExposureConfig = DEFAULT_EXPOSURE_CONFIG) {
    this.config = config;
  }

  get level(): ExposureLevel {
    const c = this.config;
    if (this.value >= c.dangerAt) return 'danger';
    if (this.value >= c.warnAt) return 'warn';
    return this.rising ? 'exposed' : 'calm';
  }

  /** 0..1, for the HUD. */
  get fraction(): number {
    return this.value / this.config.max;
  }

  /** Returns true on the frame exposure fills — the caller decides what happens next. */
  update(dt: number, e: ExposureInput): boolean {
    const c = this.config;
    this.rising = e.moonRate > 0 && !e.sheltered;
    if (this.rising) {
      this.exposedSeconds += dt;
      const cover = e.covered ? c.coveredMultiplier : e.openGround ? c.openMultiplier : c.laneMultiplier;
      const far = Math.min(1 + Math.max(e.shelterDistance - c.farFrom, 0) * c.perMetre, c.maxDistanceMultiplier);
      this.value += c.baseRate * e.moonRate * cover * c.gait[e.gait] * far * dt;
      if (this.value >= c.max) {
        this.value = c.max;
        this.failures++;
        return true;
      }
    } else {
      this.value -= (e.sheltered ? c.recoverIndoors : c.recoverOutdoors) * dt;
      this.value = Math.max(this.value, 0);
    }
    return false;
  }

  /** After the neighbours have taken you in. */
  reset(): void {
    this.value = 0;
    this.rising = false;
  }
}
