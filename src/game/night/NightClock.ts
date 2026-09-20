/**
 * The one night the game is: 18:30 to 05:00, walked once, and then it is morning.
 *
 * Everything the run is bounded by hangs off this clock. It says what time it is, which of the
 * night's three phases the village is in, and — the two questions the rest of the game actually
 * asks it — whether the moon is allowed to rise, and whether the night is over.
 *
 *   evening   the sun is going down. The village is still about its business and no moon may
 *             rise: this is the stretch where a player learns where things are.
 *   night     the working hours. Clouds cover the moon, then draw back, then cover again; every
 *             cloudy stretch is time to collect, every clear one is time to be behind a door.
 *   dawn      05:00 is close. The moon is retired for good — once the sky has begun to lighten
 *             it never darkens again — and what is not before Bappa by five will not be.
 *
 * Pure arithmetic: no Three.js, no DOM, no wall clock. `windForward` exists so a player joining
 * a team's village late arrives at the same time of night as everybody already in it.
 */
import type { NightPhase } from '../../shared/types';

export interface NightConfig {
  /** Real seconds from the first frame of evening to 05:00. */
  seconds: number;
  /** The in-game hour the run opens on (18.5 = 18:30). */
  startHour: number;
  /** The in-game hour it ends on, read past midnight (5 = 05:00). */
  endHour: number;
  /** The fraction of the night that is still evening. */
  evening: number;
  /** The fraction at which dawn begins. */
  dawn: number;
  /** False in the tutorial: the night still turns, but it never ends the run. */
  ends: boolean;
}

/**
 * Fifteen real minutes for ten and a half in-game hours — one real second is forty-two of the
 * village's. Long enough for three moonrises with room to work between them.
 */
export const DEFAULT_NIGHT_CONFIG: NightConfig = {
  seconds: 900,
  startHour: 18.5,
  endHour: 5,
  evening: 0.1,
  dawn: 0.88,
  ends: true,
};

/**
 * How dark the sky settles once the lamps are lit and before any moon is out — a point on the
 * lighting curve (MoonLightingController.LOOKS), just past the sun's hand-over to the moon.
 *
 * This is what stops a cloudy stretch at one in the morning from being lit like a sunset: the
 * sky follows whichever is higher, this floor or the moonlight actually falling.
 */
export const NIGHT_BASE = 0.36;

/** Where the sky is left at 05:00 — lighter than the night, still short of the sun. */
const DAWN_BASE = 0.12;

export class NightClock {
  /** 0..1 through the whole night. */
  t = 0;
  private elapsed = 0;
  private readonly config: NightConfig;

  constructor(config: NightConfig = DEFAULT_NIGHT_CONFIG) {
    this.config = config;
  }

  update(dt: number): void {
    this.elapsed = Math.min(this.elapsed + Math.max(dt, 0), this.config.seconds);
    this.t = this.config.seconds > 0 ? this.elapsed / this.config.seconds : 1;
  }

  /** Winds the night on as if it had been played for `seconds` — a late arrival to a team's run. */
  windForward(seconds: number): void {
    this.update(seconds);
  }

  /** Real seconds the whole night lasts. */
  get seconds(): number {
    return this.config.seconds;
  }

  get phase(): NightPhase {
    if (this.t < this.config.evening) return 'evening';
    return this.t < this.config.dawn ? 'night' : 'dawn';
  }

  /** The moon clock only turns once the sun is properly down. */
  get moonTicking(): boolean {
    return this.phase !== 'evening';
  }

  /**
   * A new moon may only begin during the night proper. At dawn this goes false and stays false,
   * which is what retires the moon for the rest of the run.
   */
  get moonMayRise(): boolean {
    return this.phase === 'night';
  }

  /** 05:00. The run is over — unless this night was never allowed to end it. */
  get done(): boolean {
    return this.config.ends && this.t >= 1;
  }

  /** The hour, read straight through midnight: 18.5 at the start, 29 (= 05:00) at the end. */
  get hours(): number {
    return this.config.startHour + this.t * this.span;
  }

  /** In-game minutes until 05:00. */
  get minutesLeft(): number {
    return Math.max(Math.round((1 - this.t) * this.span * 60), 0);
  }

  /** The clock face: "6:30 PM", "12:00 AM", "5:00 AM". */
  get label(): string {
    const total = Math.round(this.hours * 60) % (24 * 60);
    const hour24 = Math.floor(total / 60);
    const minute = total % 60;
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}`;
  }

  /**
   * The floor under the sky, 0..1 on the lighting curve: the village's own darkness, with no moon
   * in it. Climbs through the evening, holds flat all night, and eases back down through dawn.
   */
  get nightBase(): number {
    const c = this.config;
    if (this.t < c.evening) return NIGHT_BASE * smooth(this.t / c.evening);
    if (this.t < c.dawn) return NIGHT_BASE;
    return NIGHT_BASE + (DAWN_BASE - NIGHT_BASE) * this.dawnBlend;
  }

  /** 0..1 of sunrise in the sky: 0 until dawn begins, 1 at 05:00. */
  get dawnBlend(): number {
    const c = this.config;
    if (this.t < c.dawn) return 0;
    return smooth((this.t - c.dawn) / Math.max(1 - c.dawn, 1e-6));
  }

  /** In-game hours from the first frame to the last. */
  private get span(): number {
    const { startHour, endHour } = this.config;
    return endHour > startHour ? endHour - startHour : endHour + 24 - startHour;
  }
}

const smooth = (t: number) => {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
};
