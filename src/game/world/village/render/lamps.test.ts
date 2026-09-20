/**
 * The village's lamps must not flicker in step.
 *
 * Outdoors it would not matter: the sky is the light and the lamps are decoration. Indoors the
 * pool *is* the lighting, and when every light shared one flicker scalar the whole room brightened
 * and dimmed together, several times a second — which does not read as firelight, it reads as the
 * room shaking.
 */
import { Group, PointLight, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { LampPool } from './art/runtime';

const DT = 1 / 60;

/** The pool's lights, in the order it made them. */
const lights = (scene: Group): number[] => scene.children.filter((c): c is PointLight => c instanceof PointLight).map((l) => l.intensity);

/** A pool with `n` lamps in a row, all assigned, settled, and sampled over a couple of seconds. */
function sample(n: number, seconds = 2) {
  const scene = new Group();
  const pool = new LampPool(scene, n);
  for (let i = 0; i < n; i++) pool.anchor(new Vector3(i * 1.7 + 0.3, 1, i * 0.9 - 2));
  const eye = new Vector3(0, 1, 0);
  // Let the fade-in finish so what is left is flicker, not arrival.
  for (let t = 0; t < 2; t += DT) pool.update(DT, eye, 1);

  const frames: number[][] = [];
  for (let t = 0; t < seconds; t += DT) {
    pool.update(DT, eye, 1);
    frames.push(lights(scene));
  }
  return frames;
}

describe('LampPool flicker', () => {
  it('gives every lamp its own phase', () => {
    const frames = sample(6);
    // On most frames the lamps should disagree with each other.
    const spread = frames.map((f) => Math.max(...f) - Math.min(...f));
    const typical = spread.reduce((a, b) => a + b, 0) / spread.length;
    expect(typical, 'the lamps are not all doing the same thing').toBeGreaterThan(0.01);
  });

  it('does not brighten and dim the whole room together', () => {
    const frames = sample(6);
    const totals = frames.map((f) => f.reduce((a, b) => a + b, 0) / f.length);
    const min = Math.min(...totals);
    const max = Math.max(...totals);
    // The *average* of six out-of-step flames should be very nearly steady. In step, this swing
    // was over 20%; the room pulsing by that much is the bug this guards.
    expect((max - min) / max, 'the room as a whole holds still').toBeLessThan(0.06);
  });

  it('keeps each lamp within a believable range of its own brightness', () => {
    // A lamp of intensity 1, so what comes out is the flicker itself.
    const scene = new Group();
    const pool = new LampPool(scene, 3);
    for (let i = 0; i < 3; i++) pool.anchor(new Vector3(i * 1.7 + 0.3, 1, i * 0.9 - 2), 1);
    const eye = new Vector3(0, 1, 0);
    for (let t = 0; t < 2; t += DT) pool.update(DT, eye, 1);

    const all: number[] = [];
    for (let t = 0; t < 2; t += DT) {
      pool.update(DT, eye, 1);
      all.push(...lights(scene));
    }
    // Firelight, not a strobe: about five per cent either side of steady.
    expect(Math.min(...all)).toBeGreaterThan(0.89);
    expect(Math.max(...all)).toBeLessThan(1.02);
  });

  it('scales with how dark the sky is, without touching the flicker', () => {
    const scene = new Group();
    const pool = new LampPool(scene, 2);
    pool.anchor(new Vector3(1, 1, 0), 2);
    pool.anchor(new Vector3(3, 1, 1), 2);
    const eye = new Vector3(0, 1, 0);
    for (let t = 0; t < 2; t += DT) pool.update(DT, eye, 1);
    const dim = lights(scene)[0];
    pool.update(DT, eye, 1.45);
    const bright = lights(scene)[0];
    expect(bright).toBeGreaterThan(dim * 1.3);
  });

  it('is the same village every run', () => {
    const a = sample(4, 0.5);
    const b = sample(4, 0.5);
    expect(a).toEqual(b);
  });
});
