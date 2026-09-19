/**
 * The game's one-shot sounds, synthesised once at start-up into AudioBuffers — no downloads, no
 * licences, and every sound shares one small, warm palette: a temple bell, a wooden door, leaves,
 * clay, grain and a low gong for the moon.
 *
 * Each recipe is a few lines of additive or filtered-noise synthesis in plain TypeScript.
 */
import type { AudioBank } from '../core/AudioBank';

export type SoundKey =
  | 'collect'
  | 'rustle'
  | 'thunk'
  | 'grain'
  | 'clay'
  | 'deny'
  | 'door-open'
  | 'door-close'
  | 'knock'
  | 'bell'
  | 'offer'
  | 'moonrise'
  | 'moonset'
  | 'drop'
  | 'bag-open'
  | 'bag-close';

const VOLUME: Record<SoundKey, number> = {
  collect: 0.35,
  rustle: 0.5,
  thunk: 0.6,
  grain: 0.45,
  clay: 0.45,
  deny: 0.4,
  'door-open': 0.55,
  'door-close': 0.55,
  knock: 0.7,
  bell: 0.5,
  offer: 0.55,
  moonrise: 0.75,
  moonset: 0.4,
  drop: 0.6,
  'bag-open': 0.3,
  'bag-close': 0.3,
};

/** Sounds layered on top of a pickup: every item gets the chime plus its own material. */
export class SoundFx {
  private readonly bank: AudioBank;

  constructor(bank: AudioBank) {
    this.bank = bank;
    const rate = bank.context.sampleRate;
    for (const [key, make] of Object.entries(RECIPES) as [SoundKey, (r: number) => Float32Array][]) {
      const data = make(rate);
      const buffer = bank.context.createBuffer(1, data.length, rate);
      buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      bank.addBuffer(`fx:${key}`, buffer);
    }
  }

  play(key: SoundKey, volume = 1, rate = 1): void {
    this.bank.play(`fx:${key}`, 0, VOLUME[key] * volume, rate);
  }
}

// ---- recipes ----------------------------------------------------------------------------------

const TAU = Math.PI * 2;

/** Deterministic white noise, so the sounds are identical every run. */
function noise(seed = 1): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Sum of decaying sine partials: [frequency Hz, amplitude, decay seconds]. */
function partials(rate: number, seconds: number, list: [number, number, number][], attack = 0.004, detune = 0): Float32Array {
  const n = Math.floor(rate * seconds);
  const out = new Float32Array(n);
  for (const [f, a, d] of list) {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const env = Math.min(t / attack, 1) * Math.exp(-t / d);
      out[i] += a * env * Math.sin(TAU * f * t + detune * Math.sin(TAU * 0.7 * t));
    }
  }
  return normalise(out, 0.9);
}

/** Two-pole resonant band-pass (RBJ), applied in place. */
function bandpass(x: Float32Array, rate: number, freq: (i: number) => number, q: number): Float32Array {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const w = (TAU * freq(i)) / rate;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const b0 = alpha / a0;
    const b2 = -alpha / a0;
    const a1 = (-2 * Math.cos(w)) / a0;
    const a2 = (1 - alpha) / a0;
    const y = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

function normalise(x: Float32Array, peak: number): Float32Array {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  return x;
}

function mix(a: Float32Array, b: Float32Array, at: number, gain = 1): Float32Array {
  const n = Math.max(a.length, at + b.length);
  const out = new Float32Array(n);
  out.set(a);
  for (let i = 0; i < b.length; i++) out[at + i] += b[i] * gain;
  return normalise(out, 0.9);
}

/** Filtered noise under an envelope. */
function noiseBurst(rate: number, seconds: number, env: (t: number) => number, freq: (t: number) => number, q: number, seed = 7): Float32Array {
  const n = Math.floor(rate * seconds);
  const r = noise(seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * env(i / rate);
  return normalise(bandpass(x, rate, (i) => freq(i / rate), q), 0.9);
}

/** A thump: a falling sine with a click on top. */
function thump(rate: number, f0: number, f1: number, seconds: number, seed = 3): Float32Array {
  const n = Math.floor(rate * seconds);
  const out = new Float32Array(n);
  const r = noise(seed);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const f = f1 + (f0 - f1) * Math.exp(-t / 0.03);
    phase += (TAU * f) / rate;
    out[i] = Math.sin(phase) * Math.exp(-t / (seconds * 0.3)) + r() * 0.35 * Math.exp(-t / 0.004);
  }
  return normalise(out, 0.9);
}

/** Inharmonic bell partials (a cast-bronze ghanta): hum, prime, tierce, quint, nominal. */
function bell(rate: number, base: number, seconds: number, decay: number): Float32Array {
  return partials(
    rate,
    seconds,
    [
      [base * 0.5, 0.35, decay * 1.3],
      [base, 1, decay],
      [base * 1.19, 0.5, decay * 0.8],
      [base * 1.5, 0.35, decay * 0.6],
      [base * 2.0, 0.55, decay * 0.5],
      [base * 2.76, 0.28, decay * 0.3],
      [base * 5.4, 0.12, decay * 0.12],
    ],
    0.002,
    0.8,
  );
}

const RECIPES: Record<SoundKey, (rate: number) => Float32Array> = {
  // A soft two-note chime, a fifth apart — the "got it" under every pickup.
  collect: (rate) => mix(partials(rate, 0.9, [[1046.5, 1, 0.22], [2093, 0.25, 0.1]]), partials(rate, 0.9, [[1568, 0.9, 0.3], [3136, 0.2, 0.12]]), Math.floor(rate * 0.07), 0.9),
  // Leaves and petals gathered up: bumps of bright noise.
  rustle: (rate) =>
    noiseBurst(rate, 0.45, (t) => Math.exp(-t / 0.18) * (0.6 + 0.4 * Math.sin(t * 70) ** 2), (t) => 3800 - 1800 * t, 0.9, 11),
  // A coconut set down in the hand: a hollow, woody knock.
  thunk: (rate) => mix(thump(rate, 260, 150, 0.25), partials(rate, 0.25, [[620, 0.4, 0.05], [940, 0.2, 0.03]]), 0, 0.5),
  // Rice poured into a cloth: many tiny clicks.
  grain: (rate) => {
    const n = Math.floor(rate * 0.4);
    const x = new Float32Array(n);
    const r = noise(5);
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      if (Math.abs(r()) > 0.985) x[i] = r() * Math.exp(-t / 0.2);
    }
    return normalise(bandpass(x, rate, () => 5200, 1.2), 0.9);
  },
  // Fired clay touching clay.
  clay: (rate) => partials(rate, 0.35, [[1860, 1, 0.05], [2890, 0.6, 0.035], [420, 0.4, 0.06]]),
  // Can't do that: a low, soft, muted double tap.
  deny: (rate) => mix(thump(rate, 190, 120, 0.12, 2), thump(rate, 170, 105, 0.14, 4), Math.floor(rate * 0.1), 0.8),
  // A heavy wooden door on iron hinges: a slow, wavering creak.
  'door-open': (rate) => {
    const n = Math.floor(rate * 0.75);
    const out = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const f = 95 + 40 * Math.sin(t * 5.5) + 25 * Math.sin(t * 17);
      phase += (TAU * f) / rate;
      // A pulse train (stick-slip friction) rather than a smooth tone.
      out[i] = (Math.sin(phase) > 0.6 ? 1 : -0.15) * Math.min(t / 0.05, 1) * Math.exp(-t / 0.45);
    }
    return normalise(bandpass(out, rate, () => 900, 2.2), 0.8);
  },
  'door-close': (rate) => mix(thump(rate, 120, 70, 0.4, 9), noiseBurst(rate, 0.08, (t) => Math.exp(-t / 0.015), () => 1800, 1.5, 12), 0, 0.4),
  knock: (rate) => mix(thump(rate, 230, 140, 0.14, 21), thump(rate, 220, 135, 0.14, 22), Math.floor(rate * 0.19), 1),
  // The temple's hand bell.
  bell: (rate) => bell(rate, 880, 2.8, 0.9),
  // Offering: the bell, with the chime on top.
  offer: (rate) => mix(bell(rate, 740, 3.2, 1.0), partials(rate, 1.2, [[1318.5, 0.5, 0.35], [1975.5, 0.4, 0.4]]), Math.floor(rate * 0.25), 0.5),
  // The moon rises: a deep temple gong, struck twice.
  moonrise: (rate) => {
    const g = bell(rate, 146.8, 5.5, 2.2);
    return mix(g, g, Math.floor(rate * 1.4), 0.7);
  },
  // The clouds gather again: one soft, high bell.
  moonset: (rate) => bell(rate, 1174.7, 2.2, 0.6),
  // Offerings falling to the ground.
  drop: (rate) => {
    let x = thump(rate, 180, 90, 0.2, 31);
    x = mix(x, thump(rate, 210, 110, 0.18, 32), Math.floor(rate * 0.09), 0.7);
    return mix(x, thump(rate, 160, 95, 0.2, 33), Math.floor(rate * 0.2), 0.6);
  },
  // The cloth bag: a short brush of fabric up, or down.
  'bag-open': (rate) => noiseBurst(rate, 0.22, (t) => Math.sin(Math.min(t / 0.22, 1) * Math.PI), (t) => 1200 + 5000 * t, 1.4, 41),
  'bag-close': (rate) => noiseBurst(rate, 0.2, (t) => Math.sin(Math.min(t / 0.2, 1) * Math.PI), (t) => 2400 - 5000 * t, 1.4, 42),
};

/** Exposed for tests. */
export const SOUND_KEYS = Object.keys(RECIPES) as SoundKey[];
export const synthesise = (key: SoundKey, rate: number): Float32Array => RECIPES[key](rate);
