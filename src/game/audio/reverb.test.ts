import { describe, expect, it } from 'vitest';
import { COURTYARD, impulseResponse } from './reverb';

const RATE = 22050;

const rms = (x: Float32Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(to - from, 1));
};

describe('impulseResponse', () => {
  const [l, r] = impulseResponse(RATE, COURTYARD);

  it('is as long as asked, and every sample is a real number', () => {
    expect(l.length).toBe(Math.floor(RATE * COURTYARD.seconds));
    expect(r.length).toBe(l.length);
    for (const ear of [l, r]) for (const v of ear) expect(Number.isFinite(v)).toBe(true);
  });

  it('is silent for the pre-delay, then starts', () => {
    const pre = Math.floor(RATE * (COURTYARD.preDelay ?? 0));
    expect(rms(l, 0, pre)).toBe(0);
    expect(rms(l, pre, pre + 400)).toBeGreaterThan(0);
  });

  it('decays: the tail is far quieter than the start, and falls by about 60 dB at rt60', () => {
    const start = Math.floor(RATE * 0.03);
    const at = (t: number) => rms(l, Math.floor(RATE * t), Math.floor(RATE * (t + 0.05)));
    expect(at(0.03), 'the start is loud').toBeGreaterThan(at(0.6) * 2);
    expect(at(0.6)).toBeGreaterThan(at(1.6));
    // A thousandth of the amplitude (−60 dB) by the reverberation time, give or take the noise.
    const drop = at(0.03) / Math.max(at(COURTYARD.rt60 + 0.03), 1e-9);
    expect(drop, 'about −60 dB over rt60').toBeGreaterThan(300);
    expect(start).toBeGreaterThan(0);
  });

  it('has width: the two ears are different noise', () => {
    let same = 0;
    for (let i = 500; i < 5000; i++) if (Math.abs(l[i] - r[i]) < 1e-9) same++;
    expect(same, 'not a mono tail copied twice').toBeLessThan(50);
  });

  it('is the same room every time', () => {
    const [a] = impulseResponse(RATE, COURTYARD);
    expect(Array.from(a.slice(1000, 1010))).toEqual(Array.from(l.slice(1000, 1010)));
  });

  it('a longer room rings longer, at the same starting level', () => {
    const [long] = impulseResponse(RATE, { ...COURTYARD, rt60: 3.4, seconds: 4 });
    const t = Math.floor(RATE * 1.4);
    expect(rms(long, t, t + 2000)).toBeGreaterThan(rms(l, t, t + 2000) * 3);
  });

  it('carries about the same energy however long it is, so wet levels stay meaningful', () => {
    const energy = (x: [Float32Array, Float32Array]) => x[0].reduce((s, v) => s + v * v, 0) + x[1].reduce((s, v) => s + v * v, 0);
    const short = energy(impulseResponse(RATE, { seconds: 1, rt60: 0.6 }));
    const long = energy(impulseResponse(RATE, { seconds: 4, rt60: 3 }));
    expect(long / short).toBeGreaterThan(0.8);
    expect(long / short).toBeLessThan(1.25);
  });
});
