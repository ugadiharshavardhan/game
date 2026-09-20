/**
 * The village dogs. Three of them, asleep in the warm dust until something walks past.
 *
 * They are a stealth mechanic in the sense that how you move decides whether they lift their
 * heads — running carries down the lane, walking carries a little, sneaking hardly at all — and an
 * atmosphere mechanic in every other sense. A dog that barks costs you nothing. It only tells the
 * lane you are there, which on the evening before the moon is quite enough.
 *
 * When the signs come they stop wandering and settle by a door: the fifth of the nine signs, and
 * the one players read last and remember first.
 *
 * Each dog is four small meshes — body, head, two pairs of legs — plus a tail, all painted
 * geometry sharing the village's one paint material.
 */
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Matrix4, Mesh, Vector3 } from 'three';
import { Batch } from './geom';
import { centreOf, lineClear, nearestFree, type NavGrid } from '../../navgrid';
import type { ArtContext } from './runtime';

const DEG = Math.PI / 180;
/** Height of the shoulder and hip pivots the legs hang from. */
const LEG_Y = 0.32;
/** Past this the dog is neither drawn nor thought about. */
const CULL = 30;

type Mood = 'sleep' | 'wander' | 'watch' | 'bark';

interface Coat {
  fur: string;
  belly: string;
  muzzle: string;
}

const COATS: Coat[] = [
  { fur: '#b98a58', belly: '#e0c9a6', muzzle: '#6b4a2c' },
  { fur: '#8c7259', belly: '#cbbba2', muzzle: '#4a3a2a' },
  { fur: '#d3b48a', belly: '#efe2c8', muzzle: '#8a6a44' },
];

/** Where each dog lies, and how far it will drift from there. */
const PACK: Array<{ x: number; z: number; range: number }> = [
  { x: 4.5, z: -6, range: 10 },
  { x: -12, z: 6, range: 12 },
  { x: 18, z: 8, range: 9 },
];

interface Dog {
  group: Group;
  body: Group;
  legsFront: Group;
  legsBack: Group;
  tail: Group;
  home: Vector3;
  range: number;
  at: Vector3;
  yaw: number;
  mood: Mood;
  /** Where it is walking, if it is. */
  target: Vector3 | null;
  timer: number;
  /** Cycle phase for the legs, and the wag. */
  phase: number;
  barks: number;
  cooldown: number;
  voice: number;
}

export interface DogPack {
  update(dt: number, time: number): void;
  dispose(): void;
}

export function buildDogs(a: ArtContext, grid: NavGrid): DogPack {
  const dogs: Dog[] = PACK.map((spot, i) => {
    const coat = COATS[i % COATS.length];
    const cell = nearestFree(grid, spot.x, spot.z, 5);
    const at = cell < 0 ? { x: spot.x, z: spot.z } : centreOf(grid, cell);
    const dog = buildDog(a, coat);
    dog.group.position.set(at.x, a.ground?.heightAt(at.x, at.z) ?? 0, at.z);
    a.root.add(dog.group);
    return {
      ...dog,
      home: new Vector3(at.x, 0, at.z),
      range: spot.range,
      at: new Vector3(at.x, 0, at.z),
      yaw: Math.random() * Math.PI * 2,
      mood: 'sleep' as Mood,
      target: null,
      timer: 2 + Math.random() * 6,
      phase: Math.random(),
      barks: 0,
      cooldown: 0,
      voice: 0.86 + i * 0.14,
    };
  });

  const to = new Vector3();
  return {
    update(dt: number, time: number) {
      const player = a.shared.player;
      const noise = a.shared.noise;
      const settling = a.shared.goingHome;
      for (const d of dogs) {
        const dist = Math.hypot(d.at.x - player.x, d.at.z - player.z);
        if (dist > CULL) {
          d.group.visible = false;
          continue;
        }
        d.group.visible = true;
        d.cooldown = Math.max(d.cooldown - dt, 0);

        // How far the player's feet carry tonight. Sneaking, you can walk right past a sleeping dog.
        const heard = 3.5 + 17 * noise;
        const noticed = dist < heard;

        switch (d.mood) {
          case 'sleep':
            // A loud pair of feet close by is enough to raise a head.
            if (noticed && dist < heard * 0.7 && noise > 0.3) d.mood = 'watch';
            else if (!settling && noticed && dist < heard * 0.5) d.mood = 'watch';
            else if (!settling) {
              d.timer -= dt;
              if (d.timer <= 0) {
                d.mood = 'wander';
                d.target = pick(grid, d.home, d.at, d.range);
                d.timer = 6 + Math.random() * 10;
              }
            }
            break;
          case 'wander':
            if (settling) {
              // The signs: back to the doorway, and down.
              d.target = d.home.clone();
              if (d.at.distanceToSquared(d.home) < 0.5) d.mood = 'sleep';
            } else if (noticed && noise > 0.45 && dist < heard * 0.6) {
              d.mood = 'watch';
              d.target = null;
            }
            d.timer -= dt;
            if (!d.target || d.timer <= 0) {
              d.mood = settling ? 'wander' : 'sleep';
              d.target = settling ? d.home.clone() : null;
              d.timer = 4 + Math.random() * 8;
            }
            break;
          case 'watch':
            d.target = null;
            // Watching turns into barking if you keep making noise near it.
            if (noise > 0.45 && dist < heard * 0.55 && d.cooldown <= 0) {
              d.mood = 'bark';
              d.barks = 2 + Math.floor(Math.random() * 3);
              d.timer = 0;
            } else if (!noticed) {
              d.timer -= dt;
              if (d.timer <= 0) {
                d.mood = 'sleep';
                d.timer = 3 + Math.random() * 6;
              }
            } else {
              d.timer = 2.5;
            }
            break;
          case 'bark':
            d.timer -= dt;
            if (d.timer <= 0) {
              // A bark carries as far as it carries: the further off, the quieter.
              a.sound?.('bark', Math.max(0.12, 1 - dist / CULL) * 0.9);
              d.timer = 0.34 + Math.random() * 0.16;
              if (--d.barks <= 0) {
                d.mood = 'watch';
                d.timer = 2.5;
                d.cooldown = 4 + Math.random() * 4;
              }
            }
            break;
        }

        // ---- move and pose ---------------------------------------------------------------------
        const walking = d.target !== null;
        if (d.target) {
          to.set(d.target.x - d.at.x, 0, d.target.z - d.at.z);
          const left = to.length();
          if (left < 0.25) {
            d.target = null;
          } else {
            const move = Math.min((settling ? 1.6 : 0.95) * dt, left);
            d.at.addScaledVector(to.normalize(), move);
            d.phase = (d.phase + move / 0.55) % 1;
            face(d, Math.atan2(to.x, to.z), dt);
          }
        } else if (d.mood === 'watch' || d.mood === 'bark') {
          // Look at whoever it is.
          face(d, Math.atan2(player.x - d.at.x, player.z - d.at.z), dt);
        }

        d.group.position.set(d.at.x, a.ground?.heightAt(d.at.x, d.at.z) ?? 0, d.at.z);
        d.group.rotation.y = d.yaw;
        pose(d, walking, time);
      }
    },

    dispose() {
      for (const d of dogs) {
        d.group.traverse((o) => {
          const m = o as Mesh;
          if (m.isMesh) m.geometry.dispose();
        });
        d.group.removeFromParent();
      }
    },
  };
}

/** Turns the dog toward an angle at a dog's pace. */
function face(d: Dog, want: number, dt: number): void {
  d.yaw += Math.atan2(Math.sin(want - d.yaw), Math.cos(want - d.yaw)) * Math.min(dt * 5, 1);
}

/** Legs, tail and the set of the body: sleeping, standing, walking, barking. */
function pose(d: Dog, walking: boolean, time: number): void {
  const down = d.mood === 'sleep' ? 1 : 0;
  const t = d.group.userData as { lie?: number };
  t.lie = (t.lie ?? down) + (down - (t.lie ?? down)) * 0.06;
  const lie = t.lie;
  // Lying down: the body drops to the dust and the legs fold under it.
  d.body.position.y = -0.17 * lie;
  d.body.rotation.x = 6 * DEG * lie;
  d.legsFront.rotation.x = walking ? Math.sin(d.phase * Math.PI * 2) * 30 * DEG : 62 * DEG * lie;
  d.legsBack.rotation.x = walking ? -Math.sin(d.phase * Math.PI * 2) * 30 * DEG : -58 * DEG * lie;
  d.legsFront.position.y = LEG_Y - 0.16 * lie;
  d.legsBack.position.y = LEG_Y - 0.16 * lie;
  // The tail: a slow sweep asleep, a fast wag awake, stiff while barking.
  const wag = d.mood === 'bark' ? 0.1 : d.mood === 'watch' ? 0.5 : walking ? 0.35 : 0.12;
  d.tail.rotation.y = Math.sin(time * (d.mood === 'sleep' ? 1.2 : 7)) * wag;
  d.tail.rotation.x = (d.mood === 'bark' ? -0.35 : -0.1) - 0.5 * lie;
  // A bark comes off the front legs: the whole dog moves with it.
  const push = d.mood === 'bark' ? Math.max(0, Math.sin(time * 26)) * 0.05 : 0;
  d.body.rotation.z = push * 0.3;
  d.body.position.z = push;
}

/** Somewhere near home a dog can reach in a straight line. */
function pick(grid: NavGrid, home: Vector3, at: Vector3, range: number): Vector3 | null {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * range;
    const cell = nearestFree(grid, home.x + Math.cos(a) * r, home.z + Math.sin(a) * r, 1.5);
    if (cell < 0) continue;
    const c = centreOf(grid, cell);
    if (lineClear(grid, at, c)) return new Vector3(c.x, 0, c.z);
  }
  return null;
}

/**
 * One dog: a body with a head on it, two pairs of legs on their own pivots, and a tail. Local
 * frame is +z forward, standing on y = 0.
 */
function buildDog(a: ArtContext, coat: Coat): { group: Group; body: Group; legsFront: Group; legsBack: Group; tail: Group } {
  const group = new Group();
  group.name = 'dog';

  const at = (x: number, y: number, z: number, rx = 0) => new Matrix4().makeRotationX(rx).setPosition(x, y, z);

  // Body, neck and head — one mesh.
  const bodyBatch = new Batch();
  bodyBatch.add('paint', new BoxGeometry(0.2, 0.22, 0.52), at(0, 0.38, 0), coat.fur);
  bodyBatch.add('paint', new BoxGeometry(0.17, 0.14, 0.4), at(0, 0.29, 0.02), coat.belly);
  bodyBatch.add('paint', new BoxGeometry(0.15, 0.17, 0.16), at(0, 0.44, 0.27, -24 * DEG), coat.fur);
  bodyBatch.add('paint', new BoxGeometry(0.15, 0.15, 0.17), at(0, 0.52, 0.37), coat.fur);
  bodyBatch.add('paint', new BoxGeometry(0.09, 0.08, 0.13), at(0, 0.49, 0.5), coat.muzzle);
  for (const side of [-1, 1]) {
    bodyBatch.add('paint', new ConeGeometry(0.045, 0.1, 4).rotateX(10 * DEG), at(side * 0.055, 0.63, 0.34), coat.fur);
  }
  const body = bodyBatch.build(a.kit, { name: 'dog:body' });

  const legs = (z: number, name: string) => {
    const b = new Batch();
    for (const side of [-1, 1]) {
      b.add('paint', new CylinderGeometry(0.032, 0.026, 0.3, 5), new Matrix4().setPosition(side * 0.075, -0.15, 0), coat.fur);
      b.add('paint', new BoxGeometry(0.07, 0.04, 0.1), new Matrix4().setPosition(side * 0.075, -0.29, 0.02), coat.belly);
    }
    const g = b.build(a.kit, { name });
    g.position.set(0, LEG_Y, z);
    return g;
  };
  const legsFront = legs(0.18, 'dog:legs-front');
  const legsBack = legs(-0.18, 'dog:legs-back');

  const tailBatch = new Batch();
  tailBatch.add('paint', new CylinderGeometry(0.028, 0.014, 0.3, 5).rotateX(70 * DEG), new Matrix4().setPosition(0, 0.06, -0.12), coat.fur);
  const tail = tailBatch.build(a.kit, { name: 'dog:tail' });
  tail.position.set(0, 0.42, -0.26);

  // The legs hang off the dog, not off its body: lying down drops the body onto folded legs.
  body.add(tail);
  group.add(body, legsFront, legsBack);
  return { group, body, legsFront, legsBack, tail };
}
