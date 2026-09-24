/**
 * Sitting down, lying down to sleep, and getting back up — as a small state machine with no
 * Three.js in it, so every rule can be tested.
 *
 *   standing ─sit→ sitting-down ─(clip ends)→ sitting ─stand→ standing-up ─(clip ends)→ standing
 *   standing ─sleep→ lying-down ─(clip ends)→ sleeping ─wake→ waking ─(clip ends)→ standing
 *
 * Priorities, strongest first: asleep beats everything (only WAKE is heard); seated blocks run,
 * jump and sleep (only STAND is heard); a transition finishes before anything else happens, but a
 * STAND or WAKE pressed during the way down is remembered and happens as soon as it lands.
 *
 * The phases last exactly as long as their clips, so the body and the rules never disagree.
 */
import { POSTURE_SECONDS } from './proceduralClips';

export const Posture = {
  Standing: 'standing',
  SittingDown: 'sitting-down',
  Sitting: 'sitting',
  StandingUp: 'standing-up',
  LyingDown: 'lying-down',
  Sleeping: 'sleeping',
  Waking: 'waking',
} as const;
export type Posture = (typeof Posture)[keyof typeof Posture];

export type PostureRequest = 'sit' | 'stand' | 'sleep' | 'wake';

/** What the body must be doing for a request to be allowed. */
export interface PostureContext {
  /** Feet on the ground (not mid-jump or falling). */
  grounded: boolean;
  /** Busy with something else: an interaction, a doorway walk, being carried indoors. */
  busy: boolean;
  /** Room to lie down here — checked by the caller (walls, slope). Only asked for `sleep`. */
  roomToLie?: boolean;
}

/** Why a request was refused, for a toast the player can act on. Null when it was accepted. */
export type PostureRefusal = 'airborne' | 'busy' | 'no-room' | 'not-now' | null;

export interface PostureTimings {
  sitDown: number;
  standUp: number;
  lieDown: number;
  wakeUp: number;
}

export const DEFAULT_POSTURE_TIMINGS: PostureTimings = {
  sitDown: POSTURE_SECONDS.SitDown,
  standUp: POSTURE_SECONDS.StandUp,
  lieDown: POSTURE_SECONDS.SleepStart,
  wakeUp: POSTURE_SECONDS.WakeUp,
};

/** The coarse state the rest of the game (and the network) talks about. */
export type PostureKind = 'standing' | 'sitting' | 'sleeping';

export class PostureMachine {
  private current: Posture = Posture.Standing;
  private elapsed = 0;
  /** A STAND or WAKE pressed during the way down, carried out once the body gets there. */
  private queued: 'stand' | 'wake' | null = null;
  private readonly timings: PostureTimings;
  private readonly listeners = new Set<(from: Posture, to: Posture) => void>();

  constructor(timings: PostureTimings = DEFAULT_POSTURE_TIMINGS) {
    this.timings = timings;
  }

  get phase(): Posture {
    return this.current;
  }

  /** Seconds into the current phase. */
  get phaseTime(): number {
    return this.elapsed;
  }

  get kind(): PostureKind {
    const p = this.current;
    if (p === Posture.Standing) return 'standing';
    if (p === Posture.LyingDown || p === Posture.Sleeping || p === Posture.Waking) return 'sleeping';
    return 'sitting';
  }

  /** Anything but plain standing: no walking, running, jumping or crouching. */
  get locksMovement(): boolean {
    return this.current !== Posture.Standing;
  }

  get isAsleep(): boolean {
    return this.kind === 'sleeping';
  }

  get isSeated(): boolean {
    return this.kind === 'sitting';
  }

  onChange(listener: (from: Posture, to: Posture) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** What would happen to `request` now, without doing it. */
  check(request: PostureRequest, ctx: PostureContext): PostureRefusal {
    const p = this.current;
    switch (request) {
      case 'sit':
      case 'sleep':
        if (p !== Posture.Standing) return 'not-now';
        if (ctx.busy) return 'busy';
        if (!ctx.grounded) return 'airborne';
        if (request === 'sleep' && ctx.roomToLie === false) return 'no-room';
        return null;
      case 'stand':
        return p === Posture.Sitting || p === Posture.SittingDown ? null : 'not-now';
      case 'wake':
        return p === Posture.Sleeping || p === Posture.LyingDown ? null : 'not-now';
    }
  }

  request(request: PostureRequest, ctx: PostureContext): PostureRefusal {
    const refusal = this.check(request, ctx);
    if (refusal) return refusal;
    const p = this.current;
    if (request === 'sit') this.go(Posture.SittingDown);
    else if (request === 'sleep') this.go(Posture.LyingDown);
    else if (request === 'stand') {
      if (p === Posture.SittingDown) this.queued = 'stand';
      else this.go(Posture.StandingUp);
    } else if (request === 'wake') {
      if (p === Posture.LyingDown) this.queued = 'wake';
      else this.go(Posture.Waking);
    }
    return null;
  }

  /** Sit ↔ stand, for a single toggle button. */
  toggleSit(ctx: PostureContext): PostureRefusal {
    return this.request(this.isSeated ? 'stand' : 'sit', ctx);
  }

  /** Sleep ↔ wake, for a single toggle button. */
  toggleSleep(ctx: PostureContext): PostureRefusal {
    return this.request(this.isAsleep ? 'wake' : 'sleep', ctx);
  }

  /**
   * Steer toward a coarse state, one legal step at a time — for a teammate whose state arrives
   * over the network. From sitting to sleeping it stands up first, as a person would.
   */
  follow(target: PostureKind): void {
    const ok: PostureContext = { grounded: true, busy: false, roomToLie: true };
    const k = this.kind;
    if (k === target) {
      // Asked to stay down while on the way up: nothing to do but let the clip finish.
      return;
    }
    if (target === 'standing') {
      if (k === 'sitting') this.request('stand', ok);
      else this.request('wake', ok);
    } else if (target === 'sitting') {
      if (k === 'standing') this.request('sit', ok);
      else this.request('wake', ok);
    } else if (k === 'standing') this.request('sleep', ok);
    else this.request('stand', ok);
  }

  update(dt: number): void {
    this.elapsed += dt;
    const t = this.timings;
    switch (this.current) {
      case Posture.SittingDown:
        if (this.elapsed >= t.sitDown) this.go(this.queued === 'stand' ? Posture.StandingUp : Posture.Sitting);
        break;
      case Posture.StandingUp:
        if (this.elapsed >= t.standUp) this.go(Posture.Standing);
        break;
      case Posture.LyingDown:
        if (this.elapsed >= t.lieDown) this.go(this.queued === 'wake' ? Posture.Waking : Posture.Sleeping);
        break;
      case Posture.Waking:
        if (this.elapsed >= t.wakeUp) this.go(Posture.Standing);
        break;
      default:
        break;
    }
  }

  /** Straight back on the feet, no animation: a teleport, a respawn, being carried indoors. */
  reset(): void {
    this.go(Posture.Standing);
  }

  private go(next: Posture): void {
    this.queued = null;
    this.elapsed = 0;
    if (next === this.current) return;
    const prev = this.current;
    this.current = next;
    for (const l of this.listeners) l(prev, next);
  }
}
