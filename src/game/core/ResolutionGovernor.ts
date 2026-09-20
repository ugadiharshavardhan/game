/**
 * Keeps the frame rate up by trading pixels for it.
 *
 * A phone cannot be measured from here, so the game measures itself: over each short window it
 * looks at how long frames really took, and if they are running slow it draws fewer pixels
 * (a lower pixel ratio) until they are not. If the device then has room to spare it winds the
 * resolution back up — slowly, and a little more slowly each time that turns out to have been a
 * mistake, so a device that sits on the edge settles instead of flickering between two sharpnesses.
 *
 * Pure arithmetic on frame times: no renderer, no DOM. The engine applies what it returns.
 */
export interface GovernorOptions {
  /** The sharpest it may draw: the quality profile's own pixel ratio, capped by the screen's. */
  ceiling: number;
  /** The softest it may draw. */
  floor: number;
  /** Slower than this (seconds per frame, averaged over a window) is "struggling". */
  slow?: number;
  /** Faster than this is "comfortable" — room to draw more pixels. */
  fast?: number;
}

/** Each step down multiplies the pixel ratio by this. */
const STEP = 0.85;
/** How long one measurement lasts, seconds. */
const WINDOW = 1.2;
/** Start-up hitches (shader compiles, texture uploads) are not the device's real speed. */
const WARMUP = 4;
/** Failed attempts to go back up before the governor settles for good. */
const MAX_REGRETS = 3;
/** A frame this long was a tab switch or a pause, not a measurement. */
const SPIKE = 0.5;

export class ResolutionGovernor {
  private readonly ceiling: number;
  private readonly floor: number;
  private readonly slow: number;
  private readonly fast: number;
  private ratio: number;
  private time = 0;
  private frames = 0;
  private comfortable = 0;
  /** How long comfort must last before resolution goes back up: doubles after each regret. */
  private patience = 6;
  /** Raises that were followed straight away by a drop. After a few, the governor stops trying. */
  private regrets = 0;
  private lastRaise = -Infinity;
  private clock = 0;

  constructor(o: GovernorOptions) {
    this.ceiling = o.ceiling;
    this.floor = Math.min(o.floor, o.ceiling);
    this.slow = o.slow ?? 1 / 42;
    this.fast = o.fast ?? 1 / 55;
    this.ratio = o.ceiling;
  }

  get pixelRatio(): number {
    return this.ratio;
  }

  /** Feed one frame's real duration. Returns the new pixel ratio when it has changed, else null. */
  frame(dt: number): number | null {
    if (dt > SPIKE) return null;
    this.clock += dt;
    if (this.clock < WARMUP) return null;
    this.time += dt;
    this.frames++;
    if (this.time < WINDOW) return null;
    const mean = this.time / this.frames;
    this.time = 0;
    this.frames = 0;

    if (mean > this.slow && this.ratio > this.floor) {
      this.comfortable = 0;
      // Dropping soon after a raise means the raise was a mistake: wait longer before trying
      // again, and after a few of them accept that this is as sharp as the device can go.
      if (this.clock - this.lastRaise < WINDOW * 3) {
        this.regrets++;
        this.patience *= 2;
      }
      this.ratio = Math.max(this.floor, +(this.ratio * STEP).toFixed(3));
      return this.ratio;
    }
    if (mean < this.fast && this.ratio < this.ceiling && this.regrets < MAX_REGRETS) {
      this.comfortable += WINDOW;
      if (this.comfortable >= this.patience) {
        this.comfortable = 0;
        this.lastRaise = this.clock;
        this.ratio = Math.min(this.ceiling, +(this.ratio / STEP).toFixed(3));
        return this.ratio;
      }
    } else {
      this.comfortable = 0;
    }
    return null;
  }
}
