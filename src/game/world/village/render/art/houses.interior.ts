/**
 * Shelter houses, opened up: the front wall and ground-floor windows are real openings, and behind
 * them the front room where the player waits out the moonlight. Built to the same numbers as the
 * room's colliders (dims.interiorDims), so every wall you see is the wall you touch.
 *
 * The room: a polished red-oxide floor, lime-washed walls with a darker painted dado, teak beams
 * under a plank ceiling, and the family's things — a devghar (home shrine) with its lamp burning
 * for the festival, a rope cot, a tin trunk stacked with quilts, brass vessels on a shelf, a water
 * pot by the door, a garlanded photograph. A farmer's hut gets hay, tools, a lantern and a cot.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
} from 'three';

import { DOOR_H, DOOR_W, type HouseDims, interiorDims, type InteriorDims, PLINTH_H, WALL_T, type WindowOpening } from '../../dims';
import type { HouseDef } from '../../types';
import { rng } from './canvasTextures';
import { Batch, box, boxUV, fill, hashf, lathe } from './geom';
import { TONE } from './palette';
import type { ArtContext } from './runtime';

export interface HouseStyle {
  paint: Color;
  dado: Color;
  wood: Color;
  seed: number;
  hut: boolean;
}

/** Interior lime-wash: pale blue, pale green, cream, rose — each with its darker dado. */
const INNER = [
  { wall: '#c3d0d3', dado: '#5f767b' },
  { wall: '#c9d3be', dado: '#5f7256' },
  { wall: '#e0d3b4', dado: '#8a4a35' },
  { wall: '#dfcbc2', dado: '#7c4b44' },
] as const;

interface Rect {
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

/** [a0,a1] × [y0,y1] minus the holes, as rectangles (columns between hole edges, rows around holes). */
function holed(r: Rect, holes: readonly Rect[]): Rect[] {
  const cuts = [...new Set([r.a0, r.a1, ...holes.flatMap((h) => [h.a0, h.a1])])].filter((a) => a >= r.a0 && a <= r.a1).sort((x, y) => x - y);
  const out: Rect[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const u0 = cuts[i];
    const u1 = cuts[i + 1];
    if (u1 - u0 < 1e-4) continue;
    const mid = (u0 + u1) / 2;
    let y = r.y0;
    for (const h of holes.filter((h) => h.a0 < mid && h.a1 > mid).sort((p, q) => p.y0 - q.y0)) {
      if (h.y0 > y) out.push({ a0: u0, a1: u1, y0: y, y1: h.y0 });
      y = Math.max(y, h.y1);
    }
    if (y < r.y1) out.push({ a0: u0, a1: u1, y0: y, y1: r.y1 });
  }
  return out;
}

/**
 * Colours a wall piece: faces pointing into the room get the interior lime-wash (dado below, a
 * painted line, wall above, darkening toward floor and ceiling); every other face gets the
 * exterior paint with its geru dado band and monsoon splash.
 */
function twoTone(g: BufferGeometry, inward: Vector3, s: HouseStyle, inner: (typeof INNER)[number], ceiling: number): BufferGeometry {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  const innerWall = new Color(inner.wall);
  const innerDado = new Color(inner.dado);
  const stripe = new Color('#efe7d6');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const facing = nor.getX(i) * inward.x + nor.getY(i) * inward.y + nor.getZ(i) * inward.z;
    const h = y - PLINTH_H;
    const noise = 1 + (hashf(x * 3.1 + s.seed, y * 2.3, z * 3.7) - 0.5) * 0.08;
    if (facing > 0.5) {
      // Indoors: lit by one lamp and whatever the windows let in — keep the albedo modest.
      if (h < 0.9) c.copy(innerDado);
      else if (h < 0.95) c.copy(stripe).multiplyScalar(0.85);
      else c.copy(innerWall);
      const floorAO = 1 - 0.3 * Math.max(0, 1 - h / 0.35);
      const ceilAO = 1 - 0.25 * Math.max(0, 1 - (ceiling - y) / 0.4);
      c.multiplyScalar(0.8 * floorAO * ceilAO * noise);
    } else if (facing < -0.5 || Math.abs(nor.getY(i)) < 0.5) {
      // Outdoors (and the reveals of the openings).
      if (h < 0.78) c.copy(s.hut ? s.paint : s.dado);
      else if (h < 0.84 && !s.hut) c.copy(stripe);
      else c.copy(s.paint);
      const splash = 1 - 0.26 * Math.max(0, 1 - h / 1.0);
      c.multiplyScalar(splash * noise * (facing > -0.5 ? 0.82 : 1));
    } else {
      c.copy(s.paint).multiplyScalar(0.8 * noise);
    }
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

/** One box of wall, with enough segments to carry the colour bands. */
function wallBox(sx: number, sy: number, sz: number, cx: number, cy: number, cz: number): BufferGeometry {
  const g = new BoxGeometry(sx, sy, sz, Math.max(1, Math.round(sx * 1.5)), Math.max(2, Math.round(sy * 3)), Math.max(1, Math.round(sz * 1.5)));
  g.translate(cx, cy, cz);
  return boxUV(g, 'plaster');
}

/**
 * The walls of a shelter house at full detail: back block, side walls and front wall as separate
 * pieces with the doorway and the ground-floor windows cut through. Replaces the one-block body.
 */
export function openShell(b: Batch, h: HouseDef, d: HouseDims, s: HouseStyle): InteriorDims {
  const r = interiorDims(h);
  const inner = INNER[Math.floor(hashf(s.seed, 1, 2) * INNER.length) % INNER.length];
  const top = d.eaveH;
  const y0 = PLINTH_H;
  const add = (g: BufferGeometry, inward: Vector3) => b.add('plaster', twoTone(g, inward, s, inner, r.ceilingY));

  // Back block (the rooms behind): its front face is the room's back wall.
  add(wallBox(d.halfW * 2, top - y0, r.zBack + d.halfD, 0, (y0 + top) / 2, (-d.halfD + r.zBack) / 2), new Vector3(0, 0, 1));

  const holesOn = (wall: WindowOpening['wall']) => r.windows.filter((w) => w.wall === wall).map((w) => ({ a0: w.along - w.w / 2, a1: w.along + w.w / 2, y0: w.y - w.h / 2, y1: w.y + w.h / 2 }));

  // Front wall, with the doorway and its windows.
  const frontHoles = [{ a0: d.doorX - DOOR_W / 2, a1: d.doorX + DOOR_W / 2, y0, y1: y0 + DOOR_H }, ...holesOn('front')];
  const fz = (r.zFront + d.halfD) / 2;
  for (const p of holed({ a0: -d.halfW, a1: d.halfW, y0, y1: top }, frontHoles)) {
    add(wallBox(p.a1 - p.a0, p.y1 - p.y0, WALL_T, (p.a0 + p.a1) / 2, (p.y0 + p.y1) / 2, fz), new Vector3(0, 0, -1));
  }
  // Side walls (running along z), each with its window.
  for (const [side, sx] of [['left', -1], ['right', 1]] as const) {
    const x = sx * (d.halfW - WALL_T / 2);
    for (const p of holed({ a0: r.zBack, a1: r.zFront, y0, y1: top }, holesOn(side))) {
      add(wallBox(WALL_T, p.y1 - p.y0, p.a1 - p.a0, x, (p.y0 + p.y1) / 2, (p.a0 + p.a1) / 2), new Vector3(-sx, 0, 0));
    }
  }

  // Inner trim: a teak frame round the doorway and a stone ledge under each window, room side.
  const teak = '#5d3f28';
  const iz = r.zFront - 0.02;
  for (const sxx of [-1, 1]) b.add('teak', fill(box('teak', 0.09, DOOR_H + 0.06, 0.05, d.doorX + sxx * (DOOR_W / 2 + 0.045), y0 + (DOOR_H + 0.06) / 2, iz), teak));
  b.add('teak', fill(box('teak', DOOR_W + 0.18, 0.09, 0.05, d.doorX, y0 + DOOR_H + 0.045, iz), teak));
  for (const w of r.windows) {
    const ledge = box('stone', w.w + 0.12, 0.035, 0.16, 0, w.y - w.h / 2 - 0.0175, 0);
    if (w.wall === 'front') b.add('stone', fill(ledge.translate(w.along, 0, r.zFront - 0.06), '#b5ad9d'));
    else {
      const sx = w.wall === 'left' ? -1 : 1;
      b.add('stone', fill(ledge.rotateY(Math.PI / 2).translate(sx * (d.halfW - WALL_T - 0.06), 0, w.along), '#b5ad9d'));
    }
  }
  return r;
}

/**
 * The room's floor, ceiling and furnishings, in the house's frame. Adds the devghar's flame and
 * its lamp (a pooled light) so the room is lit warm while the moon shows cold through the windows.
 * Returns the batched furniture and the few meshes with their own material (the picture).
 */
export function furnishRoom(a: ArtContext, h: HouseDef, d: HouseDims, s: HouseStyle, world: (lx: number, y: number, lz: number) => Vector3): { batch: Batch; extras: Mesh[] } {
  const r = interiorDims(h);
  const b = new Batch();
  const extras: Mesh[] = [];
  const rand = rng(s.seed * 7 + 3);
  const w = r.x1 - r.x0;
  const depth = r.zFront - r.zBack;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.zBack + r.zFront) / 2;
  const floor = PLINTH_H + 0.022;

  // Floor: polished red oxide, dark and warm; a woven mat in the middle.
  const fl = box('plaster', w, 0.02, depth, cx, floor - 0.01, cz);
  shadeFloor(fl, s.seed);
  b.add('plaster', fl);
  // Ceiling planks and teak beams.
  b.add('wood', fill(box('wood', w, 0.05, depth, cx, r.ceilingY + 0.025, cz), '#4a3222'));
  const beams = Math.max(2, Math.round(w / 1.4));
  for (let i = 1; i < beams; i++) b.add('teak', fill(box('teak', 0.12, 0.14, depth, r.x0 + (w * i) / beams, r.ceilingY - 0.07, cz), '#5a3c26'));

  if (s.hut) {
    hutThings(a, b, r, floor, rand, world);
    return { batch: b, extras };
  }

  // A chatai mat where the family sits.
  const mat = box('fabric', 1.5, 0.012, 0.95, d.doorX + 0.9, floor + 0.006, cz + 0.2);
  stripes(mat, ['#b8955a', '#a4814a', '#8c3a2c'], 0.18, 'x');
  b.add('fabric', mat);

  extras.push(devghar(a, b, r, floor, world));
  charpai(b, r.x0 + 0.5, r.zFront - 1.3, floor, rand);
  trunk(b, r.x1 - 0.55, r.zBack + 0.35, floor, rand);
  vesselShelf(b, r, d.doorX, floor);
  // The water pot by the door, on its ring stand, with a brass lota upturned on top.
  const potX = d.doorX + DOOR_W / 2 + 0.45;
  const potZ = r.zFront - 0.35;
  b.add('teak', fill(new TorusGeometry(0.13, 0.03, 6, 14).rotateX(Math.PI / 2).translate(potX, floor + 0.03, potZ), '#5a3c26'));
  b.add('paint', lathe([[0.001, 0], [0.12, 0.02], [0.2, 0.14], [0.21, 0.22], [0.16, 0.34], [0.09, 0.38], [0.1, 0.42], [0.001, 0.42]], 12).translate(potX, floor + 0.04, potZ), '#8e4a2c');
  b.add('brass', lathe([[0.001, 0.12], [0.05, 0.11], [0.065, 0.06], [0.05, 0.01], [0.035, 0], [0.001, 0]], 10).translate(potX, floor + 0.46, potZ));
  // A garlanded photograph of the grandparents above the cot.
  photo(b, r.x0 + 0.02, floor + 1.75, r.zFront - 1.3, rand);
  return { batch: b, extras };
}

// ---- furniture -----------------------------------------------------------------------------------

function shadeFloor(g: BufferGeometry, seed: number): void {
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    c.set('#7a3a2a').multiplyScalar(0.8 + hashf(pos.getX(i) * 0.7 + seed, 0, pos.getZ(i) * 0.7) * 0.2);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
}

function stripes(g: BufferGeometry, colours: readonly string[], width: number, axis: 'x' | 'z'): void {
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const cs = colours.map((c) => new Color(c));
  for (let i = 0; i < pos.count; i++) {
    const t = axis === 'x' ? pos.getX(i) : pos.getZ(i);
    const c = cs[Math.abs(Math.floor(t / width)) % cs.length];
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
}

/**
 * The devghar: a carved wooden shrine on a wall shelf, a picture of Ganesha inside, a garland over
 * it, and the festival lamp burning in front. It is the room's warm light.
 */
function devghar(a: ArtContext, b: Batch, r: InteriorDims, floor: number, world: (lx: number, y: number, lz: number) => Vector3): Mesh {
  const x = r.x1 - 0.2;
  const z = r.zFront - 0.95;
  const y = floor + 1.0;
  // Shelf and brackets.
  b.add('teak', fill(box('teak', 0.4, 0.05, 0.75, x, y, z), '#5a3c26'));
  for (const dz of [-0.28, 0.28]) b.add('teak', fill(box('teak', 0.05, 0.22, 0.05, r.x1 - 0.05, y - 0.13, z + dz), '#4a3222'));
  // The shrine: plinth, two pillars each side, a stepped roof with a finial, all facing −x.
  const teak = '#6e4a2c';
  b.add('teak', fill(box('teak', 0.34, 0.06, 0.6, x - 0.02, y + 0.055, z), teak));
  for (const dz of [-0.26, 0.26]) b.add('teak', fill(box('teak', 0.04, 0.46, 0.04, x - 0.15, y + 0.31, z + dz), teak));
  b.add('teak', fill(box('teak', 0.36, 0.05, 0.64, x - 0.02, y + 0.56, z), teak));
  b.add('teak', fill(new ConeGeometry(0.3, 0.22, 4).rotateY(Math.PI / 4).scale(0.6, 1, 1.05).translate(x - 0.02, y + 0.695, z), '#5a3c26'));
  b.add('brass', new IcosahedronGeometry(0.03, 1).translate(x - 0.02, y + 0.83, z));
  // The picture: Ganesha, framed in gold, on the shrine's back.
  const pic = new Mesh(new PlaneGeometry(0.34, 0.42).rotateY(-Math.PI / 2).translate(x + 0.1, y + 0.3, z), a.kit.custom('interior:ganesha-picture', () => new MeshStandardMaterial({ map: ganeshaPicture(a), roughness: 0.6 })));
  pic.receiveShadow = true;
  // Marigold garland drooping across the shrine's front.
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const zz = z - 0.27 + 0.54 * t;
    const yy = y + 0.52 - 0.14 * Math.sin(Math.PI * t);
    b.add('paint', new IcosahedronGeometry(0.022, 0).translate(x - 0.19, yy, zz), i % 2 ? TONE.marigold : TONE.marigoldYellow);
  }
  // The lamp, a bell and a kumkum box on the shelf.
  const lamp = new Vector3(x - 0.14, y + 0.085, z - 0.12);
  b.add('brass', lathe([[0.001, 0], [0.05, 0], [0.02, 0.03], [0.015, 0.09], [0.05, 0.1], [0.06, 0.12], [0.001, 0.11]], 10).translate(lamp.x, lamp.y - 0.06, lamp.z));
  a.flames.add(world(lamp.x, lamp.y + 0.065, lamp.z), 1);
  a.lamps.anchor(world(lamp.x - 0.35, lamp.y + 0.35, lamp.z), 1.6, '#ff9a3c', 5.5);
  b.add('brass', lathe([[0.001, 0.07], [0.02, 0.065], [0.035, 0.03], [0.04, 0], [0.001, 0.005]], 10).translate(x - 0.12, y + 0.025, z + 0.16));
  b.add('paint', new CylinderGeometry(0.025, 0.025, 0.02, 10).translate(x - 0.1, y + 0.035, z + 0.05), TONE.sindoor);
  return pic;
}

/** A rope cot (charpai) along the wall, a folded sheet at one end. */
function charpai(b: Batch, x: number, z: number, floor: number, rand: () => number): void {
  const top = floor + 0.42;
  const wood = '#6e4a2c';
  for (const sx of [-0.42, 0.42]) b.add('teak', fill(box('teak', 0.07, 0.07, 1.9, x + sx, top, z), wood));
  for (const sz of [-0.93, 0.93]) b.add('teak', fill(box('teak', 0.9, 0.07, 0.07, x, top, z + sz), wood));
  for (const sx of [-0.42, 0.42]) for (const sz of [-0.93, 0.93]) b.add('teak', fill(box('teak', 0.07, 0.42, 0.07, x + sx, floor + 0.21, z + sz), '#5d3f28'));
  const web = box('fabric', 0.8, 0.02, 1.8, x, top + 0.02, z);
  stripes(web, ['#cdb27c', '#b99a62'], 0.05, 'z');
  b.add('fabric', web);
  const sheet = box('fabric', 0.7, 0.08, 0.4, x, top + 0.07, z - 0.65);
  stripes(sheet, [rand() < 0.5 ? '#8c2f3c' : '#2f4f73', '#e8dcc0'], 0.09, 'x');
  b.add('fabric', sheet);
}

/** A tin trunk, painted and rusting, with quilts folded on top. */
function trunk(b: Batch, x: number, z: number, floor: number, rand: () => number): void {
  b.add('paint', fill(box('paint', 0.8, 0.42, 0.5, x - 0.1, floor + 0.21, z), '#3f5a6e'));
  b.add('iron', new BoxGeometry(0.82, 0.03, 0.52).translate(x - 0.1, floor + 0.3, z));
  const quilts = ['#b5462c', '#e0a52a', '#4b6f86', '#7a2f4a', '#3d6b4a'];
  let y = floor + 0.42;
  for (let i = 0; i < 4; i++) {
    const t = 0.07 + rand() * 0.04;
    const q = box('fabric', 0.72 - i * 0.02, t, 0.46, x - 0.1 + (rand() - 0.5) * 0.04, y + t / 2, z);
    stripes(q, [quilts[(i * 2 + Math.floor(rand() * 5)) % 5], '#efe3c8'], 0.12, 'x');
    b.add('fabric', q);
    y += t;
  }
}

/** A plank shelf on the front wall's inside, between the door and the window: brass and steel. */
function vesselShelf(b: Batch, r: InteriorDims, doorX: number, floor: number): void {
  const x = (r.x0 + (doorX - DOOR_W / 2)) / 2 + 0.25;
  const z = r.zFront - 0.14;
  const y = floor + 1.7;
  b.add('teak', fill(box('teak', 0.9, 0.04, 0.24, x, y, z), '#5a3c26'));
  const profiles: [number, number][][] = [
    [[0.001, 0], [0.08, 0], [0.1, 0.07], [0.07, 0.13], [0.05, 0.14], [0.001, 0.14]],
    [[0.001, 0], [0.06, 0], [0.07, 0.1], [0.035, 0.16], [0.045, 0.19], [0.001, 0.19]],
    [[0.001, 0], [0.09, 0], [0.095, 0.05], [0.001, 0.05]],
  ];
  const at = [-0.32, -0.12, 0.08, 0.28];
  at.forEach((dx, i) => {
    const g = lathe(profiles[i % profiles.length], 12).translate(x + dx, y + 0.02, z);
    if (i === 2) b.add('iron', g);
    else b.add('brass', g);
  });
}

/** An old photograph in a wooden frame, a dried garland round it. On the left wall, facing +x. */
function photo(b: Batch, x: number, y: number, z: number, rand: () => number): void {
  b.add('teak', fill(box('teak', 0.03, 0.44, 0.34, x + 0.015, y, z), '#3a2618'));
  const inner = box('paint', 0.012, 0.36, 0.26, x + 0.03, y, z);
  const pos = inner.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - (y - 0.18)) / 0.36;
    c.set('#6f5a44').lerp(new Color('#c9b48e'), 0.3 + 0.4 * t).multiplyScalar(0.9 + rand() * 0.1);
    col.set([c.r, c.g, c.b], i * 3);
  }
  inner.setAttribute('color', new Float32BufferAttribute(col, 3));
  b.add('paint', inner);
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    b.add('paint', new IcosahedronGeometry(0.018, 0).translate(x + 0.05, y + 0.2 - 0.3 * Math.sin(Math.PI * t) * 0.5 - 0.02, z - 0.16 + 0.32 * t), i % 2 ? '#c46a2a' : '#d9a23a');
  }
}

/** The farm hut: hay against the back wall, tools, a clay grain bin, a cot and a hanging lantern. */
function hutThings(a: ArtContext, b: Batch, r: InteriorDims, floor: number, rand: () => number, world: (lx: number, y: number, lz: number) => Vector3): void {
  // Hay.
  const hay = new IcosahedronGeometry(1, 2);
  hay.scale(0.8, 0.45, 0.55).translate(r.x1 - 0.7, floor + 0.2, r.zBack + 0.5);
  b.add('thatch', fill(hay, TONE.thatch));
  // Clay grain bin (kothi).
  b.add('plaster', fill(lathe([[0.001, 0], [0.3, 0], [0.34, 0.4], [0.3, 0.8], [0.18, 0.9], [0.001, 0.9]], 12).translate(r.x1 - 0.45, floor, r.zFront - 0.5), '#9a6a48'));
  // A sickle and a hoe leaning on the wall.
  b.add('wood', fill(box('wood', 0.04, 1.1, 0.04, r.x0 + 0.08, floor + 0.55, r.zBack + 0.9).rotateX(0.12), '#6e5438'));
  b.add('iron', new BoxGeometry(0.02, 0.06, 0.24).translate(r.x0 + 0.08, floor + 1.1, r.zBack + 0.98));
  // Cot.
  charpai(b, r.x0 + 0.5, (r.zBack + r.zFront) / 2 + 0.3, floor, rand);
  // Hanging lantern.
  const lx = (r.x0 + r.x1) / 2 + 0.4;
  const lz = (r.zBack + r.zFront) / 2;
  const ly = r.ceilingY - 0.5;
  b.add('iron', new BoxGeometry(0.01, 0.4, 0.01).translate(lx, ly + 0.3, lz));
  b.add('iron', new CylinderGeometry(0.07, 0.08, 0.03, 8).translate(lx, ly - 0.1, lz));
  b.add('lamplit', new CylinderGeometry(0.05, 0.05, 0.14, 8).translate(lx, ly, lz));
  a.flames.add(world(lx, ly - 0.03, lz), 0.8);
  a.lamps.anchor(world(lx, ly - 0.1, lz), 1.3, '#ff9a3c', 4.5);
}

/**
 * A calendar-print Ganesha, painted on canvas: seated on a lotus against a red ground in a gold
 * frame — crown, broad ears, the trunk curling to his left, a modak in hand, his mouse below.
 */
function ganeshaPicture(a: ArtContext) {
  return a.bank.canvas('interior:ganesha', [256, 320], (g, w, h) => {
    // Frame and ground.
    g.fillStyle = '#b8862a';
    g.fillRect(0, 0, w, h);
    const bg = g.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.45, h * 0.6);
    bg.addColorStop(0, '#d4462c');
    bg.addColorStop(1, '#7a1c1c');
    g.fillStyle = bg;
    g.fillRect(14, 14, w - 28, h - 28);
    // Halo.
    g.fillStyle = 'rgba(255,214,110,0.9)';
    g.beginPath();
    g.arc(w / 2, h * 0.34, 70, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d4462c';
    g.beginPath();
    g.arc(w / 2, h * 0.34, 62, 0, Math.PI * 2);
    g.fill();
    // Lotus seat.
    g.fillStyle = '#f0a6b0';
    for (let i = -3; i <= 3; i++) {
      g.beginPath();
      g.ellipse(w / 2 + i * 22, h * 0.84, 16, 26, i * 0.25, 0, Math.PI * 2);
      g.fill();
    }
    const skin = '#f09a5f';
    const skinDark = '#d9794a';
    // Legs, folded; the yellow pitambar.
    g.fillStyle = '#f2c230';
    g.beginPath();
    g.ellipse(w / 2, h * 0.76, 72, 24, 0, 0, Math.PI * 2);
    g.fill();
    // Belly and body.
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(w / 2, h * 0.6, 52, 50, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = skinDark;
    g.beginPath();
    g.arc(w / 2, h * 0.63, 4, 0, Math.PI * 2);
    g.fill();
    // Four arms.
    g.strokeStyle = skin;
    g.lineCap = 'round';
    g.lineWidth = 16;
    for (const [sx, a0, a1] of [[-1, 0.5, 0.35], [1, 0.5, 0.35], [-1, 0.42, 0.2], [1, 0.42, 0.2]] as const) {
      g.beginPath();
      g.moveTo(w / 2 + sx * 40, h * a0);
      g.quadraticCurveTo(w / 2 + sx * 78, h * (a0 + 0.02), w / 2 + sx * 70, h * a1 + 30);
      g.stroke();
    }
    // A modak in the lower right hand.
    g.fillStyle = '#f6ecd4';
    g.beginPath();
    g.moveTo(w / 2 + 70, h * 0.6);
    g.quadraticCurveTo(w / 2 + 84, h * 0.66, w / 2 + 70, h * 0.68);
    g.quadraticCurveTo(w / 2 + 56, h * 0.66, w / 2 + 70, h * 0.6);
    g.fill();
    // Ears.
    g.fillStyle = skinDark;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(w / 2 + sx * 42, h * 0.33, 30, 36, sx * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    // Head.
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(w / 2, h * 0.33, 34, 38, 0, 0, Math.PI * 2);
    g.fill();
    // Trunk, curling to his left (the viewer's right), tapering.
    g.strokeStyle = skin;
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      g.lineWidth = 18 - t * 11;
      const x0 = w / 2 + Math.sin(t * 2.4) * 26 * t;
      const y0 = h * 0.38 + t * 70;
      const t1 = (i + 1) / 11;
      const x1 = w / 2 + Math.sin(t1 * 2.4) * 26 * t1 + (t1 > 0.85 ? (t1 - 0.85) * 60 : 0);
      const y1 = h * 0.38 + t1 * 70 - (t1 > 0.85 ? (t1 - 0.85) * 80 : 0);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
    // Tusk, eyes, tilak.
    g.strokeStyle = '#fff6e0';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(w / 2 - 14, h * 0.4);
    g.lineTo(w / 2 - 24, h * 0.44);
    g.stroke();
    g.fillStyle = '#2a1a12';
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(w / 2 + sx * 14, h * 0.32, 4, 2.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#c8121e';
    g.fillRect(w / 2 - 2.5, h * 0.24, 5, 14);
    // Crown.
    g.fillStyle = '#f2c230';
    g.beginPath();
    g.moveTo(w / 2 - 30, h * 0.24);
    g.lineTo(w / 2 + 30, h * 0.24);
    g.lineTo(w / 2 + 18, h * 0.12);
    g.lineTo(w / 2, h * 0.07);
    g.lineTo(w / 2 - 18, h * 0.12);
    g.closePath();
    g.fill();
    g.fillStyle = '#c8121e';
    for (const dx of [-14, 0, 14]) {
      g.beginPath();
      g.arc(w / 2 + dx, h * 0.19, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    // The mouse, waiting below.
    g.fillStyle = '#6f6a66';
    g.beginPath();
    g.ellipse(w * 0.72, h * 0.9, 18, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(w * 0.72 + 16, h * 0.88, 6, 0, Math.PI * 2);
    g.fill();
  }, true, false);
}

// ---- moonbeams -----------------------------------------------------------------------------------

/**
 * Moonlight through a shelter's windows: a soft blue shaft from each opening down to the floor,
 * and the window's patch of light on the floor, barred by its grille. Faked (the real moonlight
 * only reaches rooms whose windows face the moon), so every room reads as "the moon is out there"
 * — rising and fading with the moon. Built in the house's frame; hidden while the moon is.
 */
export function moonbeams(a: ArtContext, h: HouseDef): Mesh[] {
  const r = interiorDims(h);
  const floor = PLINTH_H + 0.03;
  // The moon's direction in the house's frame (the inverse of the house's yaw).
  const m = a.env.moonDir;
  const c = Math.cos(h.rot);
  const s = Math.sin(h.rot);
  const moon = new Vector3(m.x * c - m.z * s, m.y, m.x * s + m.z * c);
  const shaftPos: number[] = [];
  const shaftFade: number[] = [];
  const patchPos: number[] = [];
  const patchUv: number[] = [];
  const patchK: number[] = [];

  for (const w of r.windows) {
    // The opening's centre on the room side, the wall's outward normal, and the axis along it.
    const out = w.wall === 'front' ? new Vector3(0, 0, 1) : new Vector3(w.wall === 'left' ? -1 : 1, 0, 0);
    const along = w.wall === 'front' ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
    const centre = w.wall === 'front' ? new Vector3(w.along, 0, r.zFront) : new Vector3(w.wall === 'left' ? r.x0 : r.x1, 0, w.along);
    // Straight from the moon if it's on this side; otherwise the sky's glow falling steeply in.
    const direct = moon.x * out.x + moon.z * out.z > 0.12 && moon.y > 0.1;
    const light = direct ? moon.clone().negate() : out.clone().negate().add(new Vector3(0, -1.1, 0)).normalize();
    const k = direct ? 1 : 0.5;
    const corner = (u: number, v: number) => centre.clone().addScaledVector(along, u * w.w).setY(w.y + v * w.h);
    const quad = [corner(-0.5, 0.5), corner(0.5, 0.5), corner(0.5, -0.5), corner(-0.5, -0.5)];
    const land = quad.map((p) => p.clone().addScaledVector(light, (p.y - floor) / -light.y));
    // The shaft's four sides, window → floor; fade 0 at the window, 1 on the floor.
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const tri = [quad[i], quad[j], land[j], quad[i], land[j], land[i]];
      const fade = [0, 0, 1, 0, 1, 1];
      tri.forEach((p, n) => {
        shaftPos.push(p.x, p.y, p.z);
        shaftFade.push(fade[n], k);
      });
    }
    // The patch on the floor: u along the window, v up it (so the grille's bars land right).
    const uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
    for (const n of [0, 1, 2, 0, 2, 3]) {
      patchPos.push(land[n].x, floor, land[n].z);
      patchUv.push(uv[n][0], uv[n][1]);
      patchK.push(k);
    }
  }

  const mats = moonMaterials(a);
  const shaft = new Mesh(attributes({ position: [shaftPos, 3], aFade: [shaftFade, 2] }), mats.beam);
  const patch = new Mesh(attributes({ position: [patchPos, 3], uv: [patchUv, 2], aK: [patchK, 1] }), mats.patch);
  for (const mesh of [shaft, patch]) {
    mesh.renderOrder = 3;
    mesh.visible = false;
    mats.meshes.push(mesh);
  }
  return [shaft, patch];
}

function attributes(attrs: Record<string, [number[], number]>): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, [values, size]] of Object.entries(attrs)) g.setAttribute(name, new Float32BufferAttribute(values, size));
  g.computeBoundingSphere();
  return g;
}

interface MoonMaterials {
  beam: ShaderMaterial;
  patch: ShaderMaterial;
  meshes: Mesh[];
}

const moonMats = new WeakMap<ArtContext['kit'], MoonMaterials>();

/** The moonbeams' two materials, shared by every house, following the moon every frame. */
function moonMaterials(a: ArtContext): MoonMaterials {
  const hit = moonMats.get(a.kit);
  if (hit) return hit;
  const uMoon = { value: 0 };
  const colour = { value: new Color('#b9c9ff') };
  const beam = a.kit.custom(
    'interior:moonbeam',
    () =>
      new ShaderMaterial({
        uniforms: { uMoon, uColour: colour },
        vertexShader: `attribute vec2 aFade; varying vec2 vFade;
          void main() { vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uMoon; uniform vec3 uColour; varying vec2 vFade;
          void main() { float a = uMoon * vFade.y * 0.07 * pow(clamp(1.0 - vFade.x, 0.0, 1.0), 1.3); gl_FragColor = vec4(uColour * a, 1.0); }`,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
  );
  const patch = a.kit.custom(
    'interior:moonpatch',
    () =>
      new ShaderMaterial({
        uniforms: { uMoon, uColour: colour, uMap: { value: grilleTexture(a) } },
        vertexShader: `attribute float aK; varying float vK; varying vec2 vUv;
          void main() { vK = aK; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uMoon; uniform vec3 uColour; uniform sampler2D uMap; varying float vK; varying vec2 vUv;
          void main() { float a = texture2D(uMap, vUv).r * uMoon * vK * 0.55; gl_FragColor = vec4(uColour * a, 1.0); }`,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      }),
  );
  const mats: MoonMaterials = { beam, patch, meshes: [] };
  a.tick.push(() => {
    uMoon.value = a.shared.moonlight;
    const on = uMoon.value > 0.01;
    for (const m of mats.meshes) m.visible = on;
  });
  moonMats.set(a.kit, mats);
  return mats;
}

/** A window's light on the floor: a soft-edged rectangle crossed by the grille's five bars. */
function grilleTexture(a: ArtContext) {
  return a.bank.canvas('interior:moon-grille', [128, 128], (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    const grad = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.62);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, '#222');
    g.fillStyle = grad;
    g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#000';
    for (let i = 1; i <= 5; i++) g.fillRect((w / 6) * i - 2, 0, 4, h);
    g.fillRect(0, h / 2 - 2, w, 4);
  }, false, false);
}
