/**
 * The space the village sounds are heard in.
 *
 * Every one-shot used to go straight to the speakers, bone-dry, which is how a temple bell ends up
 * sounding like a beep. A convolution reverb needs an impulse response, and a plausible one is
 * only decaying noise: dense at the start, thinning out, with the top of it rolled off faster than
 * the bottom (air and stone soak up treble first), and a different noise in each ear so the tail
 * has width. No recordings, so no licence — the same rule as the rest of the game's audio.
 */

export interface ImpulseOptions {
  /** How long the tail runs, seconds. */
  seconds: number;
  /** Seconds for the tail to fall by 60 dB — the room's reverberation time. */
  rt60: number;
  /** A gap before the tail starts, seconds: the size of the space. */
  preDelay?: number;
  /** 0..1, how quickly the treble dies compared with the bass. */
  damping?: number;
  seed?: number;
}

/** Stereo impulse response, one Float32Array per ear. Deterministic for a seed. */
export function impulseResponse(rate: number, o: ImpulseOptions): [Float32Array, Float32Array] {
  const n = Math.max(1, Math.floor(rate * o.seconds));
  const pre = Math.floor(rate * (o.preDelay ?? 0));
  const damping = o.damping ?? 0.6;
  const ears: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];

  for (let ear = 0; ear < 2; ear++) {
    let s = ((o.seed ?? 1) * 2654435761 + ear * 40503) >>> 0 || 1;
    const rand = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) / 4294967296) * 2 - 1;
    };
    const out = ears[ear];
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / rate;
      // −60 dB at rt60: amplitude 0.001 = exp(−6.9078), so the time constant is rt60 / 6.9078.
      const env = Math.exp((-t * 6.9078) / o.rt60);
      // A one-pole low-pass whose cutoff falls as the tail ages: treble goes first.
      const k = 1 - Math.min(0.97, damping * (0.25 + Math.min(t / o.rt60, 1) * 0.75));
      lp += (rand() - lp) * k;
      // A short fade-in so the tail does not click on at full amplitude.
      const attack = Math.min((i - pre) / (rate * 0.004), 1);
      out[i] = lp * env * attack;
    }
  }

  // The two ears are scaled together so the pair has a fixed total energy, whatever the length.
  let energy = 0;
  for (const ear of ears) for (const v of ear) energy += v * v;
  const scale = energy > 0 ? Math.sqrt(rate * 0.5 / energy) * 0.5 : 1;
  for (const ear of ears) for (let i = 0; i < n; i++) ear[i] *= scale;
  return ears;
}

/** The temple courtyard: a stone space of moderate size, bright at first, warm as it fades. */
export const COURTYARD: ImpulseOptions = { seconds: 2.4, rt60: 1.7, preDelay: 0.018, damping: 0.7, seed: 11 };

/** The wet level each kind of sound sends into the space, 0..1. */
export const WET = {
  dry: 0,
  /** Small, close sounds: a door, a pickup. */
  room: 0.14,
  /** Bells, gongs, chimes: they exist to ring. */
  ring: 0.42,
} as const;
