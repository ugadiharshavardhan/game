/**
 * The villagers who are out and about: men, women, children and elders walking the lanes slowly,
 * stopping to talk or sweep, and — when the first signs come — going home and shutting the door.
 *
 * They are the fourth of the nine signs, and the one players trust most: when the lane empties,
 * something is coming. Each has a place to be, a pace, a door, and a way of passing the time.
 *
 * They are the same skinned people the rest of the village is made of (folk.ts), so they walk
 * smoothly at any speed. Beyond conversation distance they are not drawn or updated at all.
 */
import { Vector3 } from 'three';
import type { Activity } from '../../../../player/activityClips';
import type { FolkKind } from '../../types';
import { centreOf, distanceField, lineClear, nearestFree, simplifyPath, traceBack, type NavGrid } from '../../navgrid';
import type { DoorPoint } from '../../solids';
import { type Person, spawn } from './folk';
import type { ArtContext } from './runtime';

/** Beyond this, a villager is not drawn or updated at all. */
const CULL = 36;

/** What they do when they stop: any activity, or plain standing about. */
type Pastime = Activity | 'Rest';

type Role = 'villager' | 'shopkeeper' | 'child' | 'elderly' | 'woman' | 'water-carrier';

interface Breed {
  kind: FolkKind;
  /** Walking pace, m/s. Slow: these people have all evening. */
  speed: number;
  scale: number;
  outfit: number;
  grey?: boolean;
  /** How long they stop between walks, in seconds. */
  rest: [number, number];
  /** How far they will wander from where they started. */
  range: number;
  /** What they do when they stop, with weights. */
  pastimes: Array<[Pastime, number]>;
  /** The walking clip. */
  walk: 'SlowWalk' | 'CarryWalk';
}

const BREEDS: Record<Role, Breed> = {
  villager: { kind: 'man', speed: 0.85, scale: 1, outfit: 0, rest: [8, 20], range: 16, pastimes: [['Talk', 3], ['Listen', 3], ['Rest', 2]], walk: 'SlowWalk' },
  shopkeeper: { kind: 'man', speed: 0.7, scale: 1.02, outfit: 4, rest: [12, 26], range: 7, pastimes: [['Arrange', 3], ['Listen', 1]], walk: 'SlowWalk' },
  child: { kind: 'man', speed: 1.15, scale: 0.74, outfit: 2, rest: [3, 8], range: 18, pastimes: [['Listen', 2], ['Rest', 2]], walk: 'SlowWalk' },
  elderly: { kind: 'man', speed: 0.55, scale: 0.96, outfit: 1, grey: true, rest: [14, 30], range: 9, pastimes: [['Rest', 3], ['Listen', 2]], walk: 'SlowWalk' },
  woman: { kind: 'woman', speed: 0.8, scale: 0.97, outfit: 0, rest: [12, 26], range: 14, pastimes: [['Sweep', 4], ['Talk', 1], ['Rest', 2]], walk: 'SlowWalk' },
  'water-carrier': { kind: 'woman', speed: 0.75, scale: 0.97, outfit: 2, rest: [8, 16], range: 18, pastimes: [['Rest', 2], ['Talk', 1]], walk: 'CarryWalk' },
};

/** Who is out this evening, where they start, and which door is theirs. */
const CAST: Array<{ role: Role; outfit?: number; x: number; z: number; home: string }> = [
  { role: 'villager', x: 6, z: 10, home: 'patil' },
  { role: 'villager', outfit: 3, x: -14, z: -4, home: 'gokhale' },
  { role: 'villager', outfit: 2, x: 16, z: -12, home: 'naik' },
  { role: 'child', x: 9, z: 4, home: 'patil' },
  { role: 'child', outfit: 0, x: -6, z: 8, home: 'kulkarni' },
  { role: 'elderly', x: -18, z: 12, home: 'deshmukh' },
  { role: 'shopkeeper', x: 20, z: 2, home: 'jadhav' },
  { role: 'woman', outfit: 1, x: -8, z: 14, home: 'deshmukh' },
  { role: 'woman', outfit: 3, x: 14, z: 24, home: 'kulkarni' },
  { role: 'woman', outfit: 5, x: 2, z: -10, home: 'gokhale' },
  { role: 'water-carrier', x: -12, z: 6, home: 'patil' },
  { role: 'water-carrier', outfit: 4, x: 20, z: 22, home: 'jadhav' },
];

type Mode = 'rest' | 'walk';

interface Walker {
  breed: Breed;
  person: Person;
  /** Where they were standing when the evening began: they keep near it. */
  beat: Vector3;
  home: DoorPoint;
  at: Vector3;
  yaw: number;
  path: { x: number; z: number }[];
  step: number;
  waiting: number;
  mode: Mode;
  /** Gone in and shut the door. */
  indoors: boolean;
  headingHome: boolean;
}

export interface Life {
  update(dt: number): void;
  dispose(): void;
}

const pick = (list: Array<[Pastime, number]>): Pastime => {
  const total = list.reduce((n, [, w]) => n + w, 0);
  let r = Math.random() * total;
  for (const [a, w] of list) if ((r -= w) <= 0) return a;
  return list[0][0];
};

export async function buildWalkers(a: ArtContext, grid: NavGrid): Promise<Life | null> {
  const doors = a.level.doors;
  if (!doors.length) return null;

  const walkers: Walker[] = [];
  for (const spot of CAST) {
    const breed = { ...BREEDS[spot.role], outfit: spot.outfit ?? BREEDS[spot.role].outfit };
    const home = doors.find((d) => d.houseId === spot.home) ?? doors[0];
    const person = await spawn(a, { kind: breed.kind, outfit: breed.outfit, grey: breed.grey, scale: breed.scale });
    person.group.name = `walker:${spot.role}:${spot.home}`;
    const start = free(grid, spot.x, spot.z);
    person.group.position.set(start.x, 0, start.z);
    person.play('Rest', { randomise: true, fade: 0 });
    walkers.push({
      breed,
      person,
      beat: new Vector3(start.x, 0, start.z),
      home,
      at: new Vector3(start.x, 0, start.z),
      yaw: Math.random() * Math.PI * 2,
      path: [],
      step: 0,
      waiting: Math.random() * 6,
      mode: 'rest',
      indoors: false,
      headingHome: false,
    });
  }

  // One walking-distance field per door, worked out the first time somebody walks to it and kept.
  const fields = new Map<string, Float64Array>();
  const fieldFor = (door: DoorPoint): Float64Array | null => {
    let f = fields.get(door.houseId);
    if (!f) {
      const cell = nearestFree(grid, door.x, door.z, 3);
      if (cell < 0) return null;
      f = distanceField(grid, cell);
      fields.set(door.houseId, f);
    }
    return f;
  };

  const to = new Vector3();

  /** Stand and pass the time: a pastime for a while. */
  const rest = (w: Walker) => {
    w.mode = 'rest';
    const pastime = pick(w.breed.pastimes);
    w.person.hold(pastime === 'Sweep' ? 'broom' : null);
    w.person.play(pastime, { randomise: true });
    w.waiting = w.breed.rest[0] + Math.random() * (w.breed.rest[1] - w.breed.rest[0]);
  };

  const walk = (w: Walker, hurry = 1) => {
    w.mode = 'walk';
    const carry = w.breed.walk === 'CarryWalk';
    w.person.hold(carry ? 'pot' : null);
    const native = w.person.groundSpeed(w.breed.walk) * w.breed.scale;
    const scale = Math.min(Math.max((w.breed.speed * hurry) / Math.max(native, 0.3), 0.4), 1.7);
    w.person.play(w.breed.walk, { timeScale: scale });
  };

  return {
    update(dt: number) {
      const player = a.shared.player;
      const goHome = a.shared.goingHome;
      for (const w of walkers) {
        if (w.indoors) {
          // They come back out when the moon has gone, and pick up where they left off.
          if (goHome) continue;
          w.indoors = false;
          w.headingHome = false;
          w.at.set(w.home.x, 0, w.home.z);
          w.person.group.position.copy(w.at);
          w.path = [];
          w.step = 0;
          rest(w);
        }
        if (w.at.distanceToSquared(player) > CULL * CULL) {
          // Too far to see. If the signs have come they are simply home by the time you get there.
          w.person.setVisible(false);
          if (goHome) w.indoors = true;
          continue;
        }
        w.person.setVisible(true);

        if (goHome && !w.headingHome) {
          w.headingHome = true;
          w.path = pathTo(grid, fieldFor(w.home), w.at);
          w.step = 0;
          walk(w, 1.35);
        } else if (!goHome && w.headingHome) {
          // Caught in the lane when the moon went: back to the evening's errands.
          w.headingHome = false;
          w.path = [];
          w.step = 0;
          rest(w);
        }

        if (w.step >= w.path.length) {
          // Arrived. At their own door that means going in; anywhere else, a rest and a new errand.
          if (w.headingHome) {
            w.indoors = true;
            w.person.setVisible(false);
            continue;
          }
          if (w.mode === 'walk') rest(w);
          w.waiting -= dt;
          if (w.waiting <= 0) {
            w.path = wander(grid, w.beat, w.at, w.breed.range);
            w.step = 0;
            if (w.path.length) walk(w);
            else rest(w);
          }
          w.person.update(dt);
          continue;
        }

        // Walk to the next waypoint.
        const next = w.path[w.step];
        to.set(next.x - w.at.x, 0, next.z - w.at.z);
        const d = to.length();
        if (d < 0.12) {
          w.step++;
          continue;
        }
        const speed = w.breed.speed * (w.headingHome ? 1.35 : 1);
        w.at.addScaledVector(to.normalize(), Math.min(speed * dt, d));
        w.person.group.position.set(w.at.x, a.ground?.heightAt(w.at.x, w.at.z) ?? 0, w.at.z);
        // Face the way they are going, but turn like a person, not a turret.
        const want = Math.atan2(to.x, to.z);
        w.yaw += wrap(want - w.yaw) * Math.min(dt * 3, 1);
        w.person.group.rotation.y = w.yaw;
        w.person.update(dt);
      }
    },

    dispose() {
      for (const w of walkers) w.person.dispose();
    },
  };
}

/** A short errand: somewhere free, near their beat, that they can walk to in a straight line. */
function wander(grid: NavGrid, beat: Vector3, at: Vector3, range: number): { x: number; z: number }[] {
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * range;
    const x = beat.x + Math.cos(a) * r;
    const z = beat.z + Math.sin(a) * r;
    const cell = nearestFree(grid, x, z, 1.5);
    if (cell < 0) continue;
    const target = centreOf(grid, cell);
    if (lineClear(grid, at, target)) return [target];
  }
  return [];
}

/** The way home, from wherever they are: downhill through the door's own distance field. */
function pathTo(grid: NavGrid, field: Float64Array | null, at: Vector3): { x: number; z: number }[] {
  if (!field) return [];
  const from = nearestFree(grid, at.x, at.z, 2);
  if (from < 0) return [];
  // The field runs from the door outwards, so the trace comes back door-first: turn it round.
  const path = traceBack(grid, field, from).reverse();
  return simplifyPath(grid, path).slice(1);
}

function free(grid: NavGrid, x: number, z: number): { x: number; z: number } {
  const cell = nearestFree(grid, x, z, 6);
  return cell < 0 ? { x, z } : centreOf(grid, cell);
}

/** Shortest way round the circle. */
function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
