/**
 * What the moonlight is doing to you, 0–100.
 *
 * Exposure (moon/ExposureSystem.ts) is the *pressure*: how much of the Chaturthi moon is on you
 * this second, from the sky, your cover, your gait and how far the nearest door is. Health is
 * what that pressure costs, and it keeps the score:
 *
 *   under the moon, outdoors   it falls, in proportion to the pressure
 *   outdoors, clouds back      it holds — the open air does not mend anyone
 *   inside a shelter           it comes back, and only here
 *
 * That last pair is the whole point of the bar. Exposure already clears itself outdoors once the
 * moon has gone, which makes a cloudy stretch a complete reprieve; health does not, so a night
 * spent being caught out accumulates, and going home is worth doing for its own sake rather than
 * only when the moon is up.
 *
 * Running out is not the end of a run: `revive()` puts the player back on their feet with enough
 * to carry on, and the caller decides what else it costs (a few offerings, and the neighbours
 * pulling you indoors). Nothing here can make a run unwinnable.
 */
export type HealthLevel = 'well' | 'grazed' | 'hurt' | 'critical';

export interface HealthConfig {
  max: number;
  /** Health lost per second for each point per second of moonlight pressure. */
  perPressure: number;
  /** Health regained per second behind a door. */
  recoverIndoors: number;
  /** Seconds indoors before it starts mending — long enough that a doorway dash is not a cure. */
  recoverDelay: number;
  /** Where the bar stops being reassuring, and where it starts being frightening. */
  grazedAt: number;
  hurtAt: number;
  criticalAt: number;
  /** What you come round with. */
  revive: number;
}

/**
 * Tuned against the exposure config's own numbers: an ordinary walk caught in the open runs down
 * in a little over twenty seconds, the worst the village can do — a dead run across open ground
 * a long way from any door — in about twelve, and a full recovery indoors takes six.
 */
export const DEFAULT_HEALTH_CONFIG: HealthConfig = {
  max: 100,
  perPressure: 0.75,
  recoverIndoors: 17,
  recoverDelay: 0.5,
  grazedAt: 75,
  hurtAt: 45,
  criticalAt: 18,
  revive: 40,
};

export interface HealthInput {
  /** Points per second of moonlight pressure — `moonPressure()` from the exposure config. */
  pressure: number;
  /** Standing in a shelter's room. */
  sheltered: boolean;
}

export class HealthSystem {
  value: number;
  /** Going down right now. */
  draining = false;
  /** Times it has run out. */
  collapses = 0;
  private indoorsFor = 0;
  /** Latched at zero so the caller is told once, not every frame. */
  private spent = false;
  private readonly config: HealthConfig;

  constructor(config: HealthConfig = DEFAULT_HEALTH_CONFIG) {
    this.config = config;
    this.value = config.max;
  }

  get level(): HealthLevel {
    const c = this.config;
    if (this.value <= c.criticalAt) return 'critical';
    if (this.value <= c.hurtAt) return 'hurt';
    if (this.value <= c.grazedAt) return 'grazed';
    return 'well';
  }

  /** 0..1, for the bar. */
  get fraction(): number {
    return this.value / this.config.max;
  }

  /** Returns true on the one frame it runs out. */
  update(dt: number, e: HealthInput): boolean {
    const c = this.config;
    if (e.sheltered) {
      this.draining = false;
      this.indoorsFor += dt;
      if (this.indoorsFor >= c.recoverDelay) this.value = Math.min(this.value + c.recoverIndoors * dt, c.max);
      return false;
    }

    this.indoorsFor = 0;
    this.draining = e.pressure > 0 && this.value > 0;
    // Out of the moonlight but still out of doors: it holds where it is. Only a roof mends you.
    if (!this.draining) return false;

    this.value = Math.max(this.value - c.perPressure * e.pressure * dt, 0);
    if (this.value > 0) return false;
    this.draining = false;
    if (this.spent) return false;
    this.spent = true;
    this.collapses++;
    return true;
  }

  /** Back on your feet, with enough left to get somewhere. */
  revive(): void {
    this.value = this.config.revive;
    this.spent = false;
    this.draining = false;
    this.indoorsFor = 0;
  }

  /** Whole again (the temple's blessing). */
  reset(): void {
    this.value = this.config.max;
    this.spent = false;
    this.draining = false;
    this.indoorsFor = 0;
  }
}
