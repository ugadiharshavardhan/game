/**
 * What the village sounds like as the evening turns — and the third of the nine signs, the one
 * players notice without noticing: *the village goes quiet*.
 *
 *   DAY        birds, breeze, the dhol going at the pandal
 *   DUSK       the crowd thins, the drums stop, crickets start; the temple bell rings once
 *   MOONRISE   a drone comes up under everything, the festival is packed away
 *   MOONLIGHT  crickets and the drone alone — no voices anywhere
 *   TEMPLE     the drone of strings takes over as you climb the steps
 *
 * Indoors the whole lot goes behind a wall (Ambience handles the filter): another way of being
 * told you are safe.
 */
import type { Vector3 } from 'three';
import type { Ambience } from '../audio/Ambience';
import type { SoundFx, SoundKey } from '../audio/SoundFx';
import type { MoonStateName } from '../../shared/types';

/**
 * Bed levels as the sky darkens, keyed by how dark it is (the night clock's floor or the moon's
 * light, whichever is higher). The *moon's* own drone is not in this table: it follows the
 * moonlight actually falling, which is nothing at all while the clouds have the moon.
 *
 * The row at 0.36 is the cloudy small hours — the lamps lit, the festival packed away and the
 * crickets out, with no moon in it. Before it was there the mix followed moonlight alone, and a
 * cloudy 1 a.m. sounded like a bright evening: birds and drums. The sky's own lightening at dawn
 * takes it back up the table, which is what brings the birds back at five.
 */
interface Mix {
  evening: number;
  night: number;
  festival: number;
}

const MIXES: Array<{ at: number; mix: Mix }> = [
  { at: 0, mix: { evening: 1, night: 0.05, festival: 1 } },
  { at: 0.22, mix: { evening: 0.62, night: 0.45, festival: 0.6 } },
  { at: 0.36, mix: { evening: 0.12, night: 0.85, festival: 0.3 } },
  { at: 0.62, mix: { evening: 0.05, night: 0.8, festival: 0.1 } },
  { at: 1, mix: { evening: 0, night: 0.6, festival: 0 } },
];

/** How far up the moon's drone is, by the moonlight falling: nothing until the moon is near. */
const MOON_DRONE: Array<[number, number]> = [
  [0, 0],
  [0.22, 0.12],
  [0.5, 0.55],
  [1, 1],
];

/** The moon's own turns, as the player hears them. */
const STATE_SOUND: Partial<Record<MoonStateName, SoundKey>> = { warning: 'bell', rising: 'moonrise', fading: 'moonset' };

export interface MoonAudioFrame {
  /** 0..1, how much moonlight is actually falling (0 whenever the clouds have the moon). */
  moonlight: number;
  /** 0..1, how dark the sky is, moon or no moon. */
  night: number;
  /** Inside a shelter. */
  indoors: boolean;
  /** On the temple's ground. */
  atTemple: number;
}

export class MoonAudioController {
  private readonly ambience: Ambience;
  private readonly sounds: Pick<SoundFx, 'play'> | null;

  constructor(ambience: Ambience, sounds: Pick<SoundFx, 'play'> | null) {
    this.ambience = ambience;
    this.sounds = sounds;
  }

  /** Where the two placed beds sound from: the pandal, and the temple. */
  place(festival: Vector3 | null, temple: Vector3 | null): void {
    if (festival) this.ambience.place('festival', festival);
    if (temple) this.ambience.place('temple', temple);
  }

  listen(at: Vector3, forward: Vector3, up: Vector3): void {
    this.ambience.listen(at, forward, up);
  }

  /** The bell at the first sign, the swell as the moon comes up, the sigh as it goes. */
  onState(state: MoonStateName): void {
    const key = STATE_SOUND[state];
    if (key) this.sounds?.play(key);
  }

  update(dt: number, f: MoonAudioFrame): void {
    const mix = sample(Math.max(f.night, f.moonlight));
    // At the temple the strings come up and the rest of the village steps back.
    const duck = 1 - 0.45 * f.atTemple;
    this.ambience.want('evening', mix.evening * duck);
    this.ambience.want('night', mix.night * duck);
    this.ambience.want('moon', line(MOON_DRONE, f.moonlight));
    this.ambience.want('festival', mix.festival);
    this.ambience.want('temple', Math.max(f.atTemple, 0.35));
    this.ambience.setIndoors(f.indoors);
    this.ambience.update(dt);
  }
}

function sample(k: number): Mix {
  let i = 1;
  while (i < MIXES.length - 1 && MIXES[i].at < k) i++;
  const a = MIXES[i - 1];
  const b = MIXES[i];
  const t = Math.max(0, Math.min((k - a.at) / (b.at - a.at || 1), 1));
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    evening: n(a.mix.evening, b.mix.evening),
    night: n(a.mix.night, b.mix.night),
    festival: n(a.mix.festival, b.mix.festival),
  };
}

/** Piecewise-linear through `points`, clamped at both ends. */
function line(points: Array<[number, number]>, k: number): number {
  if (k <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (k <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((y1 - y0) * (k - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}
