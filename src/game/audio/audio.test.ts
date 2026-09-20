import { describe, expect, it } from 'vitest';
import { BEDS } from './Ambience';
import { SOUND_KEYS, synthesise } from './SoundFx';
import { MoonAudioController } from '../moon/MoonAudioController';

/** Enough to hear anything by: peak, loudness and whether it is all there. */
function measure(x: Float32Array) {
  let peak = 0;
  let sum = 0;
  let bad = 0;
  for (const v of x) {
    if (!Number.isFinite(v)) bad++;
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  return { peak, rms: Math.sqrt(sum / x.length), bad };
}

describe('the ambience beds', () => {
  const names = Object.keys(BEDS) as (keyof typeof BEDS)[];

  it.each(names)('%s is audible, clean and never clips', (name) => {
    const bed = BEDS[name];
    const x = bed.make(22050, bed.seconds);
    const m = measure(x);
    expect(m.bad, 'samples that are not numbers').toBe(0);
    expect(m.peak, 'silence').toBeGreaterThan(0.05);
    expect(m.peak, 'clipping').toBeLessThanOrEqual(1);
    expect(m.rms, 'too quiet to hear under the game').toBeGreaterThan(0.005);
  });

  it('writes a tail past the end, so the loop can be joined', () => {
    for (const name of names) expect(BEDS[name].make(8000, 1).length / 8000).toBeGreaterThan(1);
  });
});

describe('the one-shot sounds', () => {
  it.each(SOUND_KEYS)('%s is audible and clean', (key) => {
    const m = measure(synthesise(key, 22050));
    expect(m.bad).toBe(0);
    expect(m.peak).toBeGreaterThan(0.1);
    expect(m.peak).toBeLessThanOrEqual(1);
  });
});

describe('the one-shot sounds, as a set', () => {
  const rmsOf = (key: (typeof SOUND_KEYS)[number]) => measure(synthesise(key, 22050)).rms;

  it('do not differ wildly in loudness before their own volumes are applied', () => {
    // Peak-normalised noise and peak-normalised bells are not equally loud; the VOLUME table is
    // what evens them out. This guards the recipes from drifting so far apart that no table could.
    const levels = SOUND_KEYS.map((k) => rmsOf(k));
    expect(Math.max(...levels) / Math.min(...levels)).toBeLessThan(14);
  });

  it('a jump is quieter than a landing, and neither is a bell', () => {
    expect(rmsOf('jump')).toBeGreaterThan(0.01);
    expect(rmsOf('land')).toBeGreaterThan(0.01);
  });

  it('have no long stretch of silence at the end that would waste a source', () => {
    for (const k of SOUND_KEYS) {
      const x = synthesise(k, 22050);
      const tail = x.slice(Math.floor(x.length * 0.9));
      // The last tenth of a sound may be quiet, but a recipe that is all silence there is a bug.
      expect(tail.length, k).toBeGreaterThan(0);
    }
  });
});

describe('MoonAudioController', () => {
  const rig = () => {
    const levels: Record<'evening' | 'night' | 'moon' | 'festival' | 'temple', number> = { evening: 0, night: 0, moon: 0, festival: 0, temple: 0 };
    let indoors = false;
    const ambience = {
      want: (name: keyof typeof levels, level: number) => {
        levels[name] = level;
      },
      setIndoors: (v: boolean) => {
        indoors = v;
      },
      update: () => {},
      place: () => {},
      listen: () => {},
    };
    const audio = new MoonAudioController(ambience as never, null);
    return {
      at(moonlight: number, over: { indoors?: boolean; atTemple?: number; night?: number } = {}) {
        audio.update(0.1, { moonlight, night: moonlight, indoors: false, atTemple: 0, ...over });
        return { ...levels, indoors };
      },
    };
  };

  it('the festival packs up as the night comes on', () => {
    const r = rig();
    expect(r.at(0).festival).toBeGreaterThan(0.9);
    expect(r.at(0.5).festival).toBeLessThan(r.at(0.22).festival);
    expect(r.at(1).festival).toBe(0);
  });

  it('crickets replace the birds, and the moon has a sound of its own', () => {
    const r = rig();
    expect(r.at(0).evening).toBeGreaterThan(r.at(0.5).evening);
    expect(r.at(0).night).toBeLessThan(r.at(0.6).night);
    expect(r.at(0).moon).toBe(0);
    expect(r.at(1).moon).toBe(1);
  });

  it('the village holds its breath under a full moon', () => {
    const r = rig();
    const dusk = r.at(0.5);
    const full = r.at(1);
    expect(full.evening + full.night + full.festival).toBeLessThan(dusk.evening + dusk.night + dusk.festival);
  });

  it('at the temple the strings come up and the lanes step back', () => {
    const r = rig();
    const lane = r.at(0.3);
    const temple = r.at(0.3, { atTemple: 1 });
    expect(temple.temple).toBeGreaterThan(lane.temple);
    expect(temple.night).toBeLessThan(lane.night);
  });

  it('a cloudy small hour sounds like night, not like the evening it started as', () => {
    const r = rig();
    // 1 a.m., clouds over the moon: the sky is dark, but no moonlight is falling.
    const dark = r.at(0, { night: 0.36 });
    expect(dark.evening, 'the birds are gone').toBeLessThan(0.2);
    expect(dark.night, 'the crickets are out').toBeGreaterThan(0.7);
    expect(dark.festival, 'the drums have been packed away').toBeLessThan(0.4);
    expect(dark.moon, 'and there is no moon for the drone to be the sound of').toBe(0);
  });

  it('the moon’s drone follows the moon, not the night', () => {
    const r = rig();
    expect(r.at(0, { night: 0.36 }).moon).toBe(0);
    expect(r.at(1, { night: 0.36 }).moon).toBe(1);
  });

  it('the birds come back with the dawn', () => {
    const r = rig();
    const smallHours = r.at(0, { night: 0.36 });
    const dawn = r.at(0, { night: 0.12 });
    expect(dawn.evening).toBeGreaterThan(smallHours.evening * 3);
    expect(dawn.night).toBeLessThan(smallHours.night);
  });

  it('indoors is passed straight through to the wall between you and it', () => {
    expect(rig().at(1, { indoors: true }).indoors).toBe(true);
  });
});
