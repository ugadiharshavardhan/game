/**
 * The village's continuous sound: five looping beds, mixed live.
 *
 *   evening   breeze, birds settling, a far-off crowd — the sound of the hour before dark
 *   night     crickets, frogs, a colder wind
 *   moon      a low drone with a slow beat in it: the light itself, felt rather than heard
 *   festival  a dhol, a crowd and small bells at the pandal — placed in the world
 *   temple    a drone of plucked strings and a bell, at the temple — placed in the world
 *
 * Every bed is synthesised here at start-up, so the game ships no recordings and owes no licence.
 * Two of them are positional: the dhol comes from the pandal, the drone from the temple, and both
 * fall away as you walk off. Indoors everything goes through a low-pass — the village heard
 * through a wall, which is also how a shelter tells you that you are safe.
 *
 * Cost: five looping sources and a handful of gain nodes, whatever the size of the village.
 */
import type { Vector3 } from 'three';
import type { AudioBank } from '../core/AudioBank';

export type BedName = 'evening' | 'night' | 'moon' | 'festival' | 'temple';

/** Beds that come from somewhere: how far away they can still be heard, in metres. */
const PLACED: Partial<Record<BedName, number>> = { festival: 44, temple: 40 };

const BED_GAIN: Record<BedName, number> = { evening: 0.5, night: 0.55, moon: 0.42, festival: 0.85, temple: 0.8 };

/** Beds are synthesised at half rate: nothing in them lives above 10 kHz, and it halves the work. */
const BED_RATE = 22050;


interface Bed {
  gain: GainNode;
  panner: PannerNode | null;
  source: AudioBufferSourceNode;
  level: number;
  target: number;
}

export class Ambience {
  private readonly ctx: AudioContext;
  private readonly bus: GainNode;
  private readonly muffle: BiquadFilterNode;
  private readonly beds = new Map<BedName, Bed>();
  private indoors = false;
  private started = false;

  constructor(bank: AudioBank, rate = BED_RATE) {
    this.ctx = bank.context;
    this.muffle = this.ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.bus = this.ctx.createGain();
    this.bus.gain.value = 1;
    this.muffle.connect(this.bus).connect(bank.bus);

    for (const name of ['evening', 'night', 'moon', 'festival', 'temple'] as BedName[]) {
      const buffer = this.ctx.createBuffer(1, Math.round(BEDS[name].seconds * rate), rate);
      buffer.copyToChannel(loop(BEDS[name].make(rate, BEDS[name].seconds), rate) as Float32Array<ArrayBuffer>, 0);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      let panner: PannerNode | null = null;
      const reach = PLACED[name];
      if (reach) {
        panner = this.ctx.createPanner();
        panner.panningModel = 'equalpower';
        panner.distanceModel = 'linear';
        panner.refDistance = 6;
        panner.maxDistance = reach;
        panner.rolloffFactor = 1;
        source.connect(gain).connect(panner).connect(this.muffle);
      } else {
        source.connect(gain).connect(this.muffle);
      }
      this.beds.set(name, { gain, panner, source, level: 0, target: 0 });
    }
  }

  /** Where a placed bed sounds from. */
  place(name: BedName, at: Vector3): void {
    const p = this.beds.get(name)?.panner;
    if (!p) return;
    p.positionX.value = at.x;
    p.positionY.value = at.y;
    p.positionZ.value = at.z;
  }

  /** The camera's ear. */
  listen(at: Vector3, forward: Vector3, up: Vector3): void {
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = at.x;
      l.positionY.value = at.y;
      l.positionZ.value = at.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
    }
  }

  /** Where this bed should sit, 0..1. Reached smoothly, never stepped. */
  want(name: BedName, level: number): void {
    const bed = this.beds.get(name);
    if (bed) bed.target = Math.max(0, Math.min(level, 1));
  }

  /** Inside a house: the village muffles, and the moon's drone all but disappears. */
  setIndoors(inside: boolean): void {
    this.indoors = inside;
  }

  update(dt: number): void {
    // The loops can only start once a gesture has unlocked the context.
    if (!this.started && this.ctx.state === 'running') {
      this.started = true;
      for (const bed of this.beds.values()) bed.source.start(this.ctx.currentTime + 0.05 + Math.random() * 0.2);
    }
    const k = Math.min(dt * 1.1, 1);
    for (const [name, bed] of this.beds) {
      bed.level += (bed.target - bed.level) * k;
      const inside = this.indoors ? (name === 'moon' ? 0.12 : 0.4) : 1;
      bed.gain.gain.value = bed.level * BED_GAIN[name] * inside;
    }
    const wall = this.indoors ? 750 : 20000;
    this.muffle.frequency.value += (wall - this.muffle.frequency.value) * Math.min(dt * 2.5, 1);
  }

  dispose(): void {
    for (const bed of this.beds.values()) {
      try {
        if (this.started) bed.source.stop();
      } catch {
        // Already stopped with the context: nothing to do.
      }
      bed.source.disconnect();
      bed.gain.disconnect();
      bed.panner?.disconnect();
    }
    this.muffle.disconnect();
    this.bus.disconnect();
  }
}

// ---- synthesis ---------------------------------------------------------------------------------

/**
 * Makes a loop seamless: the recipe writes a little past the end, and that tail is cross-faded
 * back over the beginning, so the join has nothing in it to hear.
 */
function loop(raw: Float32Array, rate: number): Float32Array {
  const fade = Math.round(rate * 0.5);
  const len = raw.length - fade;
  const out = raw.slice(0, len);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = out[i] * t + raw[len + i] * (1 - t);
  }
  return out;
}

const TAU = Math.PI * 2;

/** A cheap deterministic-ish noise: white, then shaped by whatever asks for it. */
const noise = () => Math.random() * 2 - 1;

/** One-pole low-pass, used everywhere to turn white noise into wind, breath or distance. */
function lowpass(data: Float32Array, cutoff: number, rate: number): void {
  const a = Math.exp((-TAU * cutoff) / rate);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y = data[i] * (1 - a) + y * a;
    data[i] = y;
  }
}

/**
 * Adds a band of noise (a resonant band-pass sweep) — wind, crowds, distance. The filter's
 * coefficients only change every 64 samples: the sweeps here take seconds, and re-deriving them
 * per sample costs a cosine each time, which is most of what a bed used to cost to build.
 */
function band(out: Float32Array, rate: number, centre: (t: number) => number, q: number, level: (t: number) => number): void {
  const BLOCK = 64;
  let y1 = 0;
  let y2 = 0;
  let c = 0;
  let r = 0;
  let rr = 0;
  let amp = 0;
  let gain = 0;
  for (let i = 0; i < out.length; i++) {
    if ((i & (BLOCK - 1)) === 0) {
      const t = i / rate;
      const w = (TAU * centre(t)) / rate;
      r = 1 - w / (2 * q);
      rr = r * r;
      c = 2 * r * Math.cos(w);
      amp = 1 - r;
      gain = level(t);
    }
    const y = noise() * amp + c * y1 - rr * y2;
    y2 = y1;
    y1 = y;
    out[i] += y * gain;
  }
}

/** A struck or plucked partial: sine, exponential decay, optional pitch glide. */
function tone(out: Float32Array, rate: number, at: number, freq: number, seconds: number, gain: number, glide = 1): void {
  const start = Math.round(at * rate);
  const n = Math.round(seconds * rate);
  let phase = Math.random() * TAU;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / n;
    const f = freq * (glide === 1 ? 1 : glide ** t);
    phase += (TAU * f) / rate;
    out[start + i] += Math.sin(phase) * gain * Math.exp(-4.5 * t);
  }
}

/** A burst of filtered noise: a drum's skin, a bird's breath, a rustle. */
function hit(out: Float32Array, rate: number, at: number, seconds: number, gain: number, cutoff: number, decay = 9): void {
  const start = Math.round(at * rate);
  const n = Math.round(seconds * rate);
  const tmp = new Float32Array(n);
  for (let i = 0; i < n; i++) tmp[i] = noise() * Math.exp((-decay * i) / n);
  lowpass(tmp, cutoff, rate);
  for (let i = 0; i < n && start + i < out.length; i++) out[start + i] += tmp[i] * gain * 3;
}

/** A bird: two or three quick whistles that bend. */
function chirp(out: Float32Array, rate: number, at: number): void {
  const notes = 2 + Math.floor(Math.random() * 2);
  const base = 2200 + Math.random() * 1800;
  for (let n = 0; n < notes; n++) {
    tone(out, rate, at + n * (0.07 + Math.random() * 0.05), base * (1 + n * 0.08), 0.06, 0.05, 1.5 - Math.random());
  }
}

interface Recipe {
  seconds: number;
  make(rate: number, seconds: number): Float32Array;
}

/** The beds themselves, exported so their synthesis can be checked without an AudioContext. */
export const BEDS: Record<BedName, Recipe> = {
  // The hour before dark: a breeze through the trees, birds settling, a far-off crowd.
  evening: {
    seconds: 11,
    make(rate, seconds) {
      const out = new Float32Array(Math.round((seconds + 0.5) * rate));
      band(out, rate, (t) => 380 + 180 * Math.sin(t * 0.21), 1.4, (t) => 0.1 + 0.05 * Math.sin(t * 0.37 + 1));
      band(out, rate, () => 120, 0.8, () => 0.05);
      // The village a few lanes away: voices with the words worn off them.
      band(out, rate, (t) => 520 + 90 * Math.sin(t * 1.7), 3, (t) => 0.022 * (0.6 + 0.4 * Math.sin(t * 0.9)));
      for (let i = 0; i < 14; i++) chirp(out, rate, Math.random() * seconds);
      for (let i = 0; i < 6; i++) hit(out, rate, Math.random() * seconds, 0.3, 0.02, 3000, 5); // leaves
      return out;
    },
  },
  // After dark: crickets in their thousands, frogs in the tank, a colder wind.
  night: {
    seconds: 11,
    make(rate, seconds) {
      const out = new Float32Array(Math.round((seconds + 0.5) * rate));
      band(out, rate, (t) => 240 + 90 * Math.sin(t * 0.17), 1.2, () => 0.075);
      // A dozen crickets, each with its own rhythm and pitch.
      for (let c = 0; c < 12; c++) {
        const f = 3600 + Math.random() * 1500;
        const period = 0.09 + Math.random() * 0.07;
        const gain = 0.012 + Math.random() * 0.016;
        for (let t = Math.random() * period; t < seconds + 0.5; t += period) {
          tone(out, rate, t, f, 0.02, gain);
        }
      }
      for (let i = 0; i < 9; i++) {
        // Frogs at the water's edge.
        const t = Math.random() * seconds;
        tone(out, rate, t, 150 + Math.random() * 60, 0.13, 0.05, 0.85);
        hit(out, rate, t, 0.1, 0.03, 900);
      }
      return out;
    },
  },
  // The moon itself: a fifth held low, with a slow beat where the two notes rub.
  moon: {
    seconds: 12,
    make(rate, seconds) {
      const out = new Float32Array(Math.round((seconds + 0.5) * rate));
      const partials: [number, number][] = [[55, 0.1], [82.5, 0.07], [110.3, 0.035], [164.8, 0.022], [330.5, 0.012]];
      for (const [f, g] of partials) {
        let phase = Math.random() * TAU;
        for (let i = 0; i < out.length; i++) {
          const t = i / rate;
          phase += (TAU * f) / rate;
          // The beat: a slow swell, never quite the same twice round.
          out[i] += Math.sin(phase) * g * (0.75 + 0.25 * Math.sin(t * 0.13 * f * 0.02 + f));
        }
      }
      // Air moving over it, high and thin, so it reads as light rather than weight.
      band(out, rate, (t) => 1500 + 700 * Math.sin(t * 0.11), 2.5, (t) => 0.018 * (0.5 + 0.5 * Math.sin(t * 0.23)));
      return out;
    },
  },
  // The pandal: a dhol pattern, a crowd, and little bells on the top of every beat.
  festival: {
    seconds: 9.6,
    make(rate, seconds) {
      const out = new Float32Array(Math.round((seconds + 0.5) * rate));
      const beat = 0.6; // 100 bpm
      for (let bar = 0; bar * beat * 4 < seconds + 0.5; bar++) {
        const b = bar * beat * 4;
        // dha — the big left-hand stroke
        tone(out, rate, b, 120, 0.3, 0.09, 0.45);
        hit(out, rate, b, 0.08, 0.05, 2200);
        tone(out, rate, b + beat * 2, 120, 0.3, 0.07, 0.45);
        hit(out, rate, b + beat * 2, 0.08, 0.04, 2200);
        // na — the sharp right-hand strokes
        for (const off of [1, 1.5, 3, 3.5, 3.75]) hit(out, rate, b + beat * off, 0.05, 0.05, 5200, 14);
        // tiny cymbals on the offbeats
        for (const off of [0.5, 1.5, 2.5, 3.5]) hit(out, rate, b + beat * off, 0.12, 0.012, 9000, 20);
      }
      band(out, rate, (t) => 600 + 120 * Math.sin(t * 1.3), 2.5, (t) => 0.03 * (0.7 + 0.3 * Math.sin(t * 0.8)));
      // Heard across the ground, not from the stage: take the edge off it.
      lowpass(out, 2600, rate);
      return out;
    },
  },
  // The temple: a drone of plucked strings, Sa–Pa–Sa, and a bell at the end of each round.
  temple: {
    seconds: 12,
    make(rate, seconds) {
      const out = new Float32Array(Math.round((seconds + 0.5) * rate));
      const cycle = [146.83, 220, 293.66, 146.83]; // D3 · A3 · D4 · D3
      let t = 0;
      let i = 0;
      while (t < seconds + 0.5) {
        const f = cycle[i % cycle.length];
        // A plucked string: the note, its octave, and the body under it.
        tone(out, rate, t, f, 2.4, 0.055);
        tone(out, rate, t, f * 2, 1.6, 0.022);
        tone(out, rate, t, f * 3.01, 1.1, 0.01);
        hit(out, rate, t, 0.04, 0.012, 4000, 18);
        t += 1.15;
        i++;
      }
      // One bell a round, struck softly, left to ring out.
      for (const at of [1.5, 7.3]) {
        for (const [m, g] of [[1, 0.05], [2.76, 0.03], [5.4, 0.014], [8.9, 0.007]] as [number, number][]) {
          tone(out, rate, at, 523.25 * m, 4.5, g);
        }
      }
      return out;
    },
  },
};
