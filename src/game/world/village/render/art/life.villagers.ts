/**
 * The villagers who are still out: a handful of people walking the lanes, standing a while,
 * and — when the first signs come — going home and shutting the door behind them.
 *
 * They are the fourth of the nine signs, and the one players trust most: when the lane empties,
 * something is coming. Nothing here is clever. Each villager has a place to be, a pace, and a
 * door; that is the whole of the AI.
 *
 * They are drawn the way the standing villagers are — the character model posed and baked to
 * static geometry — but at six phases of a walk. Walking is those six frames swapped in turn, so
 * a moving villager costs no skinning, no mixer and no extra draw call over a standing one, and
 * every villager in the village shares the same six pieces of geometry.
 */
import { type BufferGeometry, Group, type Material, Mesh, type Object3D, Vector3 } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Poser } from '../../../../player/proceduralClips';
import { centreOf, cellOf, distanceField, lineClear, nearestFree, simplifyPath, traceBack, type NavGrid } from '../../navgrid';
import type { DoorPoint } from '../../solids';
import { bake, greyHair, loadDevotee, outfitMaterial } from './npcs';
import type { ArtContext } from './runtime';

/** Phases of the walk cycle that are baked. Six is enough to read as walking; twelve is waste. */
const FRAMES = 6;
/** Metres covered by one full cycle, at scale 1 — used so the feet don't skate. */
const STRIDE = 1.35;
/** Beyond this, a villager is not drawn or updated at all. */
const CULL = 36;

type Kind = 'villager' | 'shopkeeper' | 'child' | 'elderly';

interface Breed {
  speed: number;
  scale: number;
  outfit: number;
  grey?: boolean;
  /** How long they stand between walks, in seconds. */
  rest: [number, number];
  /** How far they will wander from where they started. */
  range: number;
}

const BREEDS: Record<Kind, Breed> = {
  villager: { speed: 1.25, scale: 1, outfit: 0, rest: [2, 7], range: 16 },
  shopkeeper: { speed: 1.05, scale: 1.02, outfit: 4, rest: [6, 14], range: 7 },
  child: { speed: 1.7, scale: 0.74, outfit: 2, rest: [0.6, 2.5], range: 18 },
  elderly: { speed: 0.78, scale: 0.96, outfit: 1, grey: true, rest: [5, 12], range: 9 },
};

/** Who is out this evening, where they start, and which door is theirs. */
const CAST: Array<{ kind: Kind; x: number; z: number; home: string }> = [
  { kind: 'villager', x: 6, z: 10, home: 'patil' },
  { kind: 'villager', x: -14, z: -4, home: 'joshi' },
  { kind: 'villager', x: 16, z: -12, home: 'more' },
  { kind: 'child', x: 9, z: 4, home: 'patil' },
  { kind: 'child', x: -6, z: 8, home: 'kulkarni' },
  { kind: 'elderly', x: -18, z: 10, home: 'joshi' },
  { kind: 'shopkeeper', x: 20, z: 2, home: 'more' },
];

interface Walker {
  breed: Breed;
  group: Group;
  meshes: Mesh[];
  /** Where they were standing when the evening began — they keep near it. */
  beat: Vector3;
  home: DoorPoint;
  at: Vector3;
  yaw: number;
  phase: number;
  frame: number;
  path: { x: number; z: number }[];
  step: number;
  waiting: number;
  /** Gone in and shut the door. */
  indoors: boolean;
  headingHome: boolean;
}

export interface Life {
  update(dt: number): void;
  dispose(): void;
}

export async function buildWalkers(a: ArtContext, grid: NavGrid): Promise<Life | null> {
  const doors = a.level.doors;
  if (!doors.length) return null;
  const source = await loadDevotee();
  const model = cloneSkinned(source) as Object3D;

  // Six baked phases of a walk, plus one standing — shared by everyone in the cast.
  const poser = new Poser(model);
  const frames: Array<Map<Material, BufferGeometry>> = [];
  for (let i = 0; i <= FRAMES; i++) {
    if (i === FRAMES) poser.stand();
    else poser.gait('walk', i / FRAMES);
    const baked = bake(model, (m) => m);
    const byMat = new Map<Material, BufferGeometry>();
    for (const child of baked.children) {
      const mesh = child as Mesh;
      byMat.set(mesh.material as Material, mesh.geometry);
    }
    // Stand the frame on the ground: whichever foot is lowest in this pose is the one on it, so
    // the walk keeps its own rise and fall without anybody sinking into the lane.
    plant(byMat);
    frames.push(byMat);
  }
  const STAND = FRAMES;
  const outfitCache = new Map<number, Map<Material, Material>>();

  const walkers: Walker[] = [];
  for (const spot of CAST) {
    const breed = BREEDS[spot.kind];
    const home = doors.find((d) => d.houseId === spot.home) ?? doors[0];
    const group = new Group();
    group.name = `walker:${spot.kind}:${spot.home}`;
    const meshes: Mesh[] = [];
    for (const [srcMat, geo] of frames[STAND]) {
      const mat = breed.grey && /Hair|Brows/.test(srcMat.name) ? greyHair(a, srcMat) : outfitMaterial(a, srcMat, breed.outfit, outfitCache);
      const mesh = new Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      meshes.push(mesh);
      group.add(mesh);
    }
    group.scale.setScalar(breed.scale);
    const start = free(grid, spot.x, spot.z);
    group.position.set(start.x, 0, start.z);
    a.root.add(group);
    walkers.push({
      breed,
      group,
      meshes,
      beat: new Vector3(start.x, 0, start.z),
      home,
      at: new Vector3(start.x, 0, start.z),
      yaw: Math.random() * Math.PI * 2,
      phase: Math.random(),
      frame: STAND,
      path: [],
      step: 0,
      waiting: Math.random() * 4,
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
          w.group.position.copy(w.at);
          w.path = [];
          w.step = 0;
          w.waiting = 1 + Math.random() * 6;
        }
        if (w.at.distanceToSquared(player) > CULL * CULL) {
          // Too far to see. If the signs have come they are simply home by the time you get there.
          w.group.visible = false;
          if (goHome) w.indoors = true;
          continue;
        }
        w.group.visible = true;

        if (goHome && !w.headingHome) {
          w.headingHome = true;
          w.path = pathTo(grid, fieldFor(w.home), w.at);
          w.step = 0;
          w.waiting = 0;
        } else if (!goHome && w.headingHome) {
          // Caught in the lane when the moon went: back to the evening's errands.
          w.headingHome = false;
          w.path = [];
          w.step = 0;
          w.waiting = 1 + Math.random() * 6;
        }

        if (w.step >= w.path.length) {
          // Arrived. At their own door that means going in; anywhere else, a rest and a new errand.
          if (w.headingHome) {
            w.indoors = true;
            w.group.visible = false;
            continue;
          }

          w.waiting -= dt;
          if (w.waiting <= 0) {
            w.path = wander(grid, w.beat, w.at, w.breed.range);
            w.step = 0;
            w.waiting = w.breed.rest[0] + Math.random() * (w.breed.rest[1] - w.breed.rest[0]);
          }
          setFrame(w, STAND, frames);
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
        const move = Math.min(speed * dt, d);
        w.at.addScaledVector(to.normalize(), move);
        w.group.position.set(w.at.x, a.ground?.heightAt(w.at.x, w.at.z) ?? 0, w.at.z);
        // Face the way they are going, but turn like a person, not a turret.
        const want = Math.atan2(to.x, to.z);
        w.yaw += wrap(want - w.yaw) * Math.min(dt * 6, 1);
        w.group.rotation.y = w.yaw;
        // The cycle advances with the ground covered, so the feet never skate.
        w.phase = (w.phase + move / (STRIDE * w.breed.scale)) % 1;
        setFrame(w, Math.floor(w.phase * FRAMES) % FRAMES, frames);
      }
    },

    dispose() {
      for (const w of walkers) w.group.removeFromParent();
      for (const byMat of frames) for (const g of byMat.values()) g.dispose();
    },
  };
}

/** Drops a baked frame so its lowest point sits at y = 0, every part by the same amount. */
function plant(byMat: Map<Material, BufferGeometry>): void {
  let low = Infinity;
  for (const g of byMat.values()) {
    const p = g.getAttribute('position');
    for (let i = 1; i < p.array.length; i += 3) low = Math.min(low, p.array[i]);
  }
  if (!Number.isFinite(low) || Math.abs(low) < 1e-4) return;
  for (const g of byMat.values()) {
    g.translate(0, -low, 0);
    g.computeBoundingSphere();
  }
}

function setFrame(w: Walker, frame: number, frames: Array<Map<Material, BufferGeometry>>): void {
  if (frame === w.frame) return;
  w.frame = frame;
  const byMat = frames[frame];
  for (const mesh of w.meshes) {
    const g = byMat.get(mesh.material as Material);
    if (g) mesh.geometry = g;
  }
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

/** Kept for the dogs, which share the grid helpers. */
export { cellOf };
