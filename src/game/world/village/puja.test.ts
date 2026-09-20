import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { PujaStage } from '../World';
import { PujaSequence } from './PujaSequence';

function stage() {
  const shots: Array<{ position: [number, number, number]; fov: number } | null> = [];
  const sounds: string[] = [];
  let bows = 0;
  const s: PujaStage = {
    camera: {
      setShot: (shot) => shots.push(shot ? { position: shot.position.toArray() as [number, number, number], fov: shot.fov } : null),
      setOrientation: () => {},
    },
    celebrate: () => {
      bows++;
    },
    sound: (key) => sounds.push(key),
  };
  return { stage: s, shots, sounds, bows: () => bows };
}

const run = (seq: PujaSequence, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) seq.update(dt);
};

describe('the closing puja', () => {
  it('takes the camera round the devotee, bows twice, and ends once', () => {
    const s = stage();
    let done = 0;
    const seq = new PujaSequence(s.stage, new Vector3(0, 0.9, -49), () => done++);
    run(seq, 13);
    // Three held shots, then the view handed back to the rig.
    expect(s.shots.filter(Boolean)).toHaveLength(3);
    expect(s.shots[s.shots.length - 1]).toBeNull();
    expect(s.bows()).toBe(2);
    expect(s.sounds).toEqual(['offer', 'bell', 'bell']);
    expect(done).toBe(1);
    expect(seq.playing).toBe(false);
    // Ticking on after the end changes nothing.
    run(seq, 5);
    expect(done).toBe(1);
  });

  it('places every shot around the devotee, on the village side of him', () => {
    const s = stage();
    const at = new Vector3(3, 0.9, -49);
    const seq = new PujaSequence(s.stage, at, () => {});
    run(seq, 13);
    for (const shot of s.shots) {
      if (!shot) continue;
      const [x, y, z] = shot.position;
      expect(Math.hypot(x - at.x, z - at.z), 'close enough to be about him').toBeLessThan(8);
      expect(z, 'never between the god and the person who came to see him').toBeGreaterThan(at.z);
      expect(y).toBeGreaterThan(at.y - 0.5);
    }
  });

  it('skips cleanly: the view comes back and the run ends exactly once', () => {
    const s = stage();
    let done = 0;
    const seq = new PujaSequence(s.stage, new Vector3(), () => done++);
    run(seq, 2);
    seq.finish();
    expect(done).toBe(1);
    expect(s.shots[s.shots.length - 1]).toBeNull();
    seq.finish();
    run(seq, 12);
    expect(done).toBe(1);
  });
});
