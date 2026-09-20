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

/** Bed levels at each end of the night, interpolated by how much moonlight is falling. */
interface Mix {
  evening: number;
  night: number;
  moon: number;
  festival: number;
}

const MIXES: Array<{ at: number; mix: Mix }> = [
  { at: 0, mix: { evening: 1, night: 0.05, moon: 0, festival: 1 } },
  { at: 0.22, mix: { evening: 0.62, night: 0.45, moon: 0.12, festival: 0.6 } },
  { at: 0.5, mix: { evening: 0.22, night: 0.8, moon: 0.55, festival: 0.18 } },
  { at: 1, mix: { evening: 0, night: 0.6, moon: 1, festival: 0 } },
];

/** The moon's own turns, as the player hears them. */
const STATE_SOUND: Partial<Record<MoonStateName, SoundKey>> = { warning: 'bell', rising: 'moonrise', fading: 'moonset' };

export interface MoonAudioFrame {
  /** 0..1, how much moonlight is falling. */
  moonlight: number;
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
    const mix = sample(f.moonlight);
    // At the temple the strings come up and the rest of the village steps back.
    const duck = 1 - 0.45 * f.atTemple;
    this.ambience.want('evening', mix.evening * duck);
    this.ambience.want('night', mix.night * duck);
    this.ambience.want('moon', mix.moon);
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
  const t = (k - a.at) / (b.at - a.at || 1);
  const n = (x: number, y: number) => x + (y - x) * Math.max(0, Math.min(t, 1));
  return {
    evening: n(a.mix.evening, b.mix.evening),
    night: n(a.mix.night, b.mix.night),
    moon: n(a.mix.moon, b.mix.moon),
    festival: n(a.mix.festival, b.mix.festival),
  };
}
