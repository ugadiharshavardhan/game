/**
 * The last thing that happens: every offering is before Bappa, and the village takes over.
 *
 * Three held shots round the platform while the devotee offers and bows — close and low from the
 * side, a hero angle under the spire, then a slow pull back over the whole lit platform with the
 * petals coming down. Bells on the cuts, the sanctum's lamps rising under all of it. About eleven
 * seconds, and skippable at any point.
 *
 * The murti is only ever lit and circled. Nothing is thrown at it, nothing touches it, and the
 * camera never puts anything between the god and the person who came to see him.
 */
import { Vector3 } from 'three';
import type { SoundKey } from '../../audio/SoundFx';
import type { PujaStage } from '../World';

interface Beat {
  /** Seconds from the start of the sequence. */
  at: number;
  /** Where the camera goes, relative to the offering point (x is east, z is toward the village). */
  shot?: { x: number; y: number; z: number; lookHeight: number; fov: number; blend: number };
  sound?: [SoundKey, number];
  /** The devotee offers and bows. */
  bow?: boolean;
}

const BEATS: Beat[] = [
  // Close, from the side: the offerings going down, the sanctum doorway behind.
  { at: 0, shot: { x: 2.4, y: 1.4, z: 1.1, lookHeight: 1.05, fov: 38, blend: 2.4 }, sound: ['offer', 1] },
  { at: 0.9, bow: true },
  // Low, from in front, with the spire over his shoulder.
  { at: 3.6, shot: { x: -2.6, y: 0.95, z: 1.5, lookHeight: 1.15, fov: 34, blend: 2 }, sound: ['bell', 0.85] },
  { at: 6.2, bow: true },
  // Back down the pillared hall: the devotee small against the lit doorway, petals over both.
  { at: 7.4, shot: { x: 2, y: 1.15, z: 6.2, lookHeight: 1, fov: 50, blend: 3 }, sound: ['bell', 0.5] },
  { at: 11.2 },
];

const END = BEATS[BEATS.length - 1].at;

export class PujaSequence {
  private readonly stage: PujaStage;
  private readonly at: Vector3;
  private readonly done: () => void;
  private readonly shot = new Vector3();
  private elapsed = 0;
  private next = 0;
  private finished = false;

  /** `at` is where the devotee is standing: every shot is placed around him. */
  constructor(stage: PujaStage, at: Vector3, done: () => void) {
    this.stage = stage;
    this.at = at.clone();
    this.done = done;
  }

  update(dt: number): void {
    if (this.finished) return;
    this.elapsed += dt;
    while (this.next < BEATS.length && BEATS[this.next].at <= this.elapsed) {
      const beat = BEATS[this.next++];
      if (beat.shot) {
        const s = beat.shot;
        this.stage.camera.setShot({ position: this.shot.set(this.at.x + s.x, this.at.y + s.y, this.at.z + s.z), lookHeight: s.lookHeight, fov: s.fov }, s.blend);
      }
      if (beat.sound) this.stage.sound(beat.sound[0], beat.sound[1]);
      if (beat.bow) this.stage.celebrate();
    }
    if (this.elapsed >= END) this.finish();
  }

  /** The player pressed skip, or the run ended some other way. */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    // Hand the view back to the rig before the results appear over it.
    this.stage.camera.setShot(null, 0.5);
    this.done();
  }

  get playing(): boolean {
    return !this.finished;
  }
}
