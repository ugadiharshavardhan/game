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
      at(moonlight: number, over: { indoors?: boolean; atTemple?: number } = {}) {
        audio.update(0.1, { moonlight, indoors: false, atTemple: 0, ...over });
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

  it('indoors is passed straight through to the wall between you and it', () => {
    expect(rig().at(1, { indoors: true }).indoors).toBe(true);
  });
});
