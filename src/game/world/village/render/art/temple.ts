/**
 * The Ganesh temple — the village's landmark, at the head of the main road. Built from the layout
 * and templeDims, so every part stands where its collider is (solids.ts).
 *
 * Anatomy, from the gate in:
 *   courtyard wall of dressed basalt with coping and lamp-bearing piers · the kaman (south gateway)
 *   with its cusped arch, bell, toran and plaque · the stone mūshak on its pedestal, facing the god ·
 *   the deepastambha, its rows of diyas lit · the jagati (platform) of stacked basalt mouldings,
 *   and its steps between low sloping side walls · the mandapa: lathe-turned basalt pillars with
 *   stepped bracket capitals, beams, a coffered lotus ceiling, a flat roof with a sloping chhajja,
 *   a parapet with kalash finials, brass bells and marigold garlands at the entrance · the turtle
 *   (kasav) in the floor, facing the sanctum · the garbhagriha in sandstone on its moulded base,
 *   lamp niches, a carved doorway, and within it the svayambhu Ganesha — a sindoor-smeared stone,
 *   garlanded, between two brass samai — whose glow rises after a prayer · the Nagara shikhara and
 *   its saffron flag (temple.shikhara.ts).
 *
 * Two levels of detail (THREE.LOD): full, and a distant silhouette. Lamps, flowers, bells and
 * offerings are culled beyond ~48 m.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  LOD,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector2,
  Vector3,
  Mesh,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STEP_RISE, STEP_RUN, templeDims } from '../../dims';
import type { P2, VillageLayout, WallDef } from '../../types';
import { glow, rangoli } from './canvasTextures';
import { Batch, beam, box, boxUV, fill, place, weather } from './geom';
import { TONE } from './palette';
import type { ArtContext } from './runtime';
import { faceMatrix, FLAT, MatBatch, rathaCap, rathaLoft, type Ring, Sheet, type Spans, turned } from './temple.geom';
import { BASALT, BASALT_DARK, bell, deepastambha, deity, diya, festoon, hangingLamp, type Lit, marigolds, mushak, samai } from './temple.props';
import { flag, spire } from './temple.shikhara';
import { carvedMaterial, PANEL, stripV } from './temple.textures';

/** LOD switch distance from the platform's centre, metres. */
const LOD1 = 62;
/** Small things (lamps, flowers, bells, offerings) are hidden beyond this. */
const DETAIL = 48;

/** Warm Deccan sandstone for the sanctum, spire and mandapa roof; basalt below. */
const SANDSTONE = new Color(TONE.stone).lerp(new Color('#c69a73'), 0.55);
const SOOT = '#3d3129';

/** Everything measured once, from the layout and templeDims. */
interface Plan {
  /** Platform: top height, centre z, half-extents, south edge. */
  P: number;
  pz: number;
  phx: number;
  phz: number;
  front: number;
  steps: number;
  stepsHalf: number;
  /** Mandapa pillars and the roof slab (collider extents). */
  pillarXs: number[];
  pillarZs: number[];
  ceiling: number;
  roofHx: number;
  roofZ0: number;
  roofZ1: number;
  /** Sanctum: centre z, half-width, wall top. */
  sz: number;
  sh: number;
  sTop: number;
  spireH: number;
  offer: P2;
  walls: WallDef[];
  deepa: P2;
  mushak: P2;
  /** Local frame origin in world x (the temple's axis). */
  ox: number;
}

function plan(L: VillageLayout): Plan {
  const t = L.temple;
  const d = templeDims(t);
  const lm = (kind: string) => L.landmarks.find((l) => l.kind === kind) ?? { x: t.x, z: t.z };
  const deepa = lm('deepastambha');
  const mu = lm('shrine');
  return {
    P: t.platformH,
    pz: d.platformZ,
    phx: t.platformW / 2,
    phz: t.platformD / 2,
    front: d.platformZ + t.platformD / 2,
    steps: d.stepsCount,
    stepsHalf: d.stepsWidth / 2,
    pillarXs: d.pillarXs,
    pillarZs: d.pillarZs,
    ceiling: t.platformH + d.mandapaH,
    roofHx: (d.mandapaW + 0.8) / 2,
    roofZ0: d.mandapaBack - 0.4,
    roofZ1: d.mandapaFront + 0.4,
    sz: (d.sanctumFront + d.sanctumBack) / 2,
    sh: d.sanctumW / 2,
    sTop: t.platformH + d.sanctumH,
    spireH: d.shikharaH,
    offer: { x: t.offerX - t.x, z: t.offerZ },
    walls: L.walls.filter((w) => w.kind === 'temple'),
    deepa: { x: deepa.x - t.x, z: deepa.z },
    mushak: { x: mu.x - t.x, z: mu.z },
    ox: t.x,
  };
}

interface Mats {
  carved: MeshStandardMaterial;
  basalt: MeshStandardMaterial;
  sindoor: MeshStandardMaterial;
  halo: MeshBasicMaterial;
}

function materials(a: ArtContext): Mats {
  return {
    carved: carvedMaterial(a),
    // Oiled, polished basalt: lathe-turned pillars, the pitha, the mūshak.
    basalt: a.kit.custom('temple:basalt', () => {
      const s = a.bank.set('Plaster001');
      return new MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, normalScale: new Vector2(0.35, 0.35), roughness: 0.46, metalness: 0, vertexColors: true });
    }),
    // Sindoor thick with ghee: a waxy sheen, and it glows as the lamps flare after a prayer.
    sindoor: a.kit.custom('temple:sindoor', () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0, emissive: new Color('#ff4412'), emissiveIntensity: 0.16 })),
    halo: a.kit.custom('temple:halo', () => new MeshBasicMaterial({ map: glow(a.bank), color: new Color(1, 0.52, 0.2), transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false })),
  };
}

export function build(a: ArtContext): boolean {
  const p = plan(a.layout);
  const m = materials(a);
  const root = new Group();
  root.name = 'temple';
  root.position.set(p.ox, 0, 0);

  const lod = new LOD();
  lod.position.set(0, 0, p.pz);
  let staffTop = new Vector3();
  for (const [lvl, dist] of [[0, 0], [1, LOD1]] as const) {
    const { group, staff } = level(a, p, m, lvl);
    group.position.z = -p.pz;
    lod.addLevel(group, dist);
    staffTop = staff;
  }
  root.add(lod);

  const detail = details(a, p, m);
  root.add(detail);
  a.culler.add(detail, new Vector3(p.ox, 0, p.pz + 3), DETAIL);

  // The flag, outside the LODs so it never pops, rippling in the evening wind.
  const f = flag(a, staffTop);
  root.add(f.mesh);
  a.tick.push((_dt, time) => {
    f.update(time);
    const g = a.shared.templeGlow;
    m.sindoor.emissiveIntensity = 0.16 + 1.2 * g;
    m.halo.opacity = 0.4 + 0.6 * g;
  });

  a.root.add(root);
  return true;
}

/** One level of detail: 0 = everything architectural; 1 = the distant silhouette. */
function level(a: ArtContext, p: Plan, m: Mats, lvl: 0 | 1): { group: Group; staff: Vector3 } {
  const b = new Batch();
  const mb = new MatBatch();
  platform(b, mb, p, m, lvl);
  steps(b, p, lvl);
  sanctum(b, mb, p, m, lvl);
  const staff = spire(b, mb, m.carved, { cx: 0, cz: p.sz, base: p.sTop, b0: p.sh - 0.1, bs: 1.5, body: p.spireH * 0.82, stone: SANDSTONE }, lvl);
  mandapa(b, mb, p, m, lvl);
  courtyard(b, p, lvl);
  gate(b, mb, p, m, lvl);
  deepastambha(b, mb, m.basalt, lvl === 0 ? litIn(a, p) : () => {}, p.deepa.x, p.deepa.z, lvl);
  mushak(b, mb, m.basalt, p.mushak.x, p.mushak.z, lvl);
  const group = b.build(a.kit, { name: `temple:lod${lvl}`, cast: true });
  mb.build(group, { cast: true });
  return { group, staff };
}

/** Registers flames given in the temple's frame. */
function litIn(a: ArtContext, p: Plan): Lit {
  return (v, size = 1) => a.flames.add(new Vector3(v.x + p.ox, v.y, v.z), size);
}

/** Shade for a lofted quad from its facing: tops catch the sky, undersides and returns fall dark. */
function facing(q: { a: Vector3; b: Vector3; d: Vector3; kind?: string }): number {
  const n = new Vector3().subVectors(q.b, q.a).cross(new Vector3().subVectors(q.d, q.a)).normalize();
  if (n.y > 0.5) return 1.1;
  if (n.y < -0.5) return 0.66;
  return q.kind === 'return' ? 0.84 : 1;
}

/** UVs for a band quad in the carved atlas: u along the band (metres ÷ repeat), v across it. */
function bandUV(strip: Parameters<typeof stripV>[0], u0: number, u1: number): readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]] {
  const [v0, v1] = stripV(strip);
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}

// ---- Platform and steps ---------------------------------------------------------------------------

/** The jagati's mouldings, bottom to top: [height, projection]. */
const JAGATI: [number, number][] = [
  [0, 0.08], [0.1, 0.08], [0.1, 0.03], [0.14, 0.07], [0.22, 0.07], [0.26, 0.02], [0.26, 0], [0.3, 0], [0.3, -0.03], [0.36, -0.03],
  [0.36, 0.02], [0.6, 0.02], [0.6, 0.05], [0.66, 0.05], [0.66, -0.02], [0.78, -0.02], [0.78, 0.06], [0.9, 0.06],
];
const JAGATI_FAR: [number, number][] = [[0, 0.06], [0.1, 0.06], [0.1, 0.02], [0.78, 0.02], [0.78, 0.06], [0.9, 0.06]];

function platform(b: Batch, mb: MatBatch, p: Plan, m: Mats, lvl: 0 | 1): void {
  const k = p.P / 0.9;
  const rings: Ring[] = (lvl === 0 ? JAGATI : JAGATI_FAR).map(([y, off]) => ({ y: y * k, hx: p.phx + off, hz: p.phz + off, ds: 0 }));
  const stone = new Sheet();
  const frieze = new Sheet();
  const along = (v: Vector3, face: number) => (face % 2 === 0 ? v.x : v.z) / 1.92;
  rathaLoft(rings, () => FLAT(), (q) => {
    const band = lvl === 0 && q.a.y > 0.35 * k && q.d.y < 0.61 * k && q.a.y !== q.d.y;
    if (band) frieze.quad(q.a, q.b, q.c, q.d, bandUV('rosette', along(q.a, q.face), along(q.b, q.face)));
    else stone.quad(q.a, q.b, q.c, q.d, undefined, facing(q));
  }, 0, p.pz);
  const basalt = new Color(BASALT);
  const tone = (_x: number, y: number) => 0.8 + 0.2 * Math.min(y / 0.5, 1);
  b.add('stone', boxUV(stone.build(basalt, { tone, seed: 1 }), 1.8));
  if (!frieze.empty) mb.add(m.carved, frieze.build(basalt.clone().multiplyScalar(1.05), { tone }));
  // The floor: worn basalt flags, paler where feet pass.
  const e = 0.06;
  const floor = new Sheet().quad(
    new Vector3(-p.phx - e, p.P, p.pz + p.phz + e),
    new Vector3(p.phx + e, p.P, p.pz + p.phz + e),
    new Vector3(p.phx + e, p.P, p.pz - p.phz - e),
    new Vector3(-p.phx - e, p.P, p.pz - p.phz - e),
  );
  b.add('stone', boxUV(floor.build('#9a9087', { grain: 0.1 }), 2.4));
}

function steps(b: Batch, p: Plan, lvl: 0 | 1): void {
  const cheek = 0.3;
  const inner = lvl === 0 ? p.stepsHalf - cheek : p.stepsHalf;
  for (let i = 0; i < p.steps; i++) {
    const top = p.P - STEP_RISE * (i + 1);
    const z = p.front + STEP_RUN * (i + 0.5);
    b.add('stone', weather(box('stone', inner * 2, top, STEP_RUN, 0, top / 2, z), '#8e857c', { ground: 0, splash: 0.3, strength: 0.25 }));
    if (lvl === 0) b.add('stone', fill(box('stone', inner * 2 + 0.02, 0.035, 0.04, 0, top - 0.0175, z + STEP_RUN / 2 + 0.01), '#a0978d'));
  }
  if (lvl === 1) return;
  // Low side walls whose coping follows the flight, ending in a turned knob.
  const run = STEP_RUN * p.steps;
  const z0 = p.front + run + 0.12;
  const z1 = p.front;
  for (const sx of [-1, 1]) {
    const xa = sx * inner;
    const xb = sx * (p.stepsHalf + 0.06);
    const [xl, xr] = sx < 0 ? [xb, xa] : [xa, xb];
    const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const lo = 0.26;
    const hi = p.P + 0.24;
    const s = new Sheet();
    s.quad(P(xl, 0, z0), P(xr, 0, z0), P(xr, lo, z0), P(xl, lo, z0));
    s.quad(P(xr, 0, z0), P(xr, 0, z1), P(xr, hi, z1), P(xr, lo, z0), undefined, 0.92);
    s.quad(P(xl, 0, z1), P(xl, 0, z0), P(xl, lo, z0), P(xl, hi, z1), undefined, 0.92);
    s.quad(P(xl, lo, z0), P(xr, lo, z0), P(xr, hi, z1), P(xl, hi, z1), undefined, 1.08);
    b.add('stone', boxUV(s.build(BASALT, { seed: 5 }), 1.8));
    b.add('stone', weather(box('stone', xr - xl, 0.24, 0.34, (xl + xr) / 2, p.P + 0.12, z1 - 0.17), BASALT, { ground: p.P, strength: 0.1 }));
    // Coping along the slope, and the knob at its foot.
    const cx = (xl + xr) / 2;
    b.add('stone', fill(beam(new Vector3(cx, lo + 0.03, z0 + 0.02), new Vector3(cx, hi + 0.03, z1), xr - xl + 0.06, 0.07), '#8a8178'));
    b.add('stone', fill(box('stone', xr - xl + 0.06, 0.07, 0.4, cx, hi + 0.035, z1 - 0.18), '#8a8178'));
    b.add('stone', fill(turned([[0.001, 0], [0.1, 0.02], [0.13, 0.1], [0.1, 0.19], [0.05, 0.22], [0.07, 0.26], [0.001, 0.3]], 12, 1).translate(cx, lo + 0.05, z0 - 0.12), '#847a70'));
  }
}

// ---- Sanctum ------------------------------------------------------------------------------------

/** The sanctum's plan: bhadra, recess, pratiratha, recess, karna (depths in metres). */
const SANCTUM_SPANS: Spans = [[0, 0.24, 0.14], [0.24, 0.27, -0.03], [0.27, 0.56, 0.05], [0.56, 0.6, -0.03], [0.6, 1, 0]];
/** The doorway face: flat, with a break where the door frame stands. */
const DOOR_BREAK = 0.39;
/** Vedibandha, jangha and varandika: [height above the platform, projection]. */
const SANCTUM: [number, number][] = [
  [0, 0.1], [0.1, 0.1], [0.16, 0.05], [0.22, 0.11], [0.4, 0.11], [0.5, 0.04], [0.56, 0.09], [0.62, 0.04], [0.62, -0.02], [0.7, -0.02], [0.7, 0.02],
  [0.8, 0.09], [0.85, 0.09], [0.85, 0], [2.72, 0], [3.4, 0], [3.4, 0.04], [3.5, 0.04], [3.54, 0.06], [3.82, 0.28], [3.88, 0.28], [3.88, 0], [3.96, 0],
  [3.96, 0.1], [4.2, 0.1],
];
const SANCTUM_FAR: [number, number][] = [[0, 0.1], [0.85, 0.1], [0.85, 0], [3.5, 0], [3.5, 0.06], [3.82, 0.28], [3.88, 0.28], [3.88, 0.1], [4.2, 0.1]];
/** The doorway, in the south face's frame (x across, heights above the platform). */
const DOOR = { half: 0.55, sill: 0.12, head: 2.3, frame: 1.16, lintel: 2.72, passage: 0.8 };
/** The chamber inside: half-width, depth behind the door face, height. */
const CELL = { half: 2.1, back: 5.12, h: 3.1 };

function sanctum(b: Batch, mb: MatBatch, p: Plan, m: Mats, lvl: 0 | 1): void {
  const kar = p.sh - 0.04;
  const P0 = p.P;
  const spans = (f: number) => (f === 0 ? FLAT(DOOR_BREAK) : SANCTUM_SPANS);
  const rings: Ring[] = (lvl === 0 ? SANCTUM : SANCTUM_FAR).map(([h, off]) => ({ y: P0 + h, hx: kar + off, hz: kar + off, ds: 1 }));
  const stone = new Sheet();
  const carved = new Sheet();
  const along = (v: Vector3, f: number) => (f % 2 === 0 ? v.x : v.z);
  const inBand = (q: { a: Vector3; d: Vector3 }, y0: number, y1: number) => q.a.y >= P0 + y0 - 1e-4 && q.d.y <= P0 + y1 + 1e-4 && q.a.y !== q.d.y;
  rathaLoft(rings, spans, (q) => {
    if (lvl === 0) {
      // The doorway's frame fills the gap on the south face; the niches are built into the bhadra.
      if (q.face === 0 && Math.abs(q.s0 + DOOR_BREAK) < 1e-6 && q.d.y <= P0 + DOOR.lintel + 1e-4) return;
      if (q.kind === 'bhadra' && inBand(q, 0.85, 2.72)) return;
      if (q.kind !== 'return' && inBand(q, 0.22, 0.4)) {
        carved.quad(q.a, q.b, q.c, q.d, bandUV('rosette', along(q.a, q.face) / 1.44, along(q.b, q.face) / 1.44));
        return;
      }
      if (q.kind !== 'return' && inBand(q, 2.72, 3.4)) {
        carved.quad(q.a, q.b, q.c, q.d, bandUV('chain', along(q.a, q.face) / 3.4, along(q.b, q.face) / 3.4));
        return;
      }
    }
    stone.quad(q.a, q.b, q.c, q.d, undefined, facing(q));
  }, 0, p.sz);
  rathaCap(stone, rings[rings.length - 1], spans, 0, p.sz);
  // Monsoon splash low down, soot and lichen under the cornice.
  const tone = (_x: number, y: number) => (0.84 + 0.16 * Math.min((y - P0) / 1.2, 1)) * (y > P0 + 3.3 && y < P0 + 3.9 ? 0.9 : 1);
  b.add('stone', boxUV(stone.build(SANDSTONE, { tone, seed: 2 }), 2.4));
  if (!carved.empty) mb.add(m.carved, carved.build(SANDSTONE, { tone }));

  if (lvl === 1) {
    // Far away the doorway is only a dark opening.
    b.add('interior', new PlaneGeometry(DOOR.half * 2, DOOR.head - DOOR.sill).translate(0, P0 + (DOOR.head + DOOR.sill) / 2, p.sz + kar + 0.02));
    return;
  }
  for (const f of [1, 2, 3]) niche(b, p, kar, f);
  doorway(b, mb, p, m, kar);
  cell(b, p, kar);
}

/** A lamp niche (devakoshtha) sunk into the bhadra of face `f`, with pilasters, sill and hood. */
function niche(b: Batch, p: Plan, kar: number, f: number): void {
  const P0 = p.P;
  const bw = 0.24 * kar;
  const front = 0.14;
  const back = front - 0.3;
  const nw = 0.33;
  const y0 = P0 + 0.85;
  const y1 = P0 + 2.72;
  const n0 = P0 + 1.35;
  const n1 = P0 + 2.35;
  const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const s = new Sheet();
  const rect = (x0: number, x1: number, ya: number, yb: number, z: number, k = 1) => s.quad(P(x0, ya, z), P(x1, ya, z), P(x1, yb, z), P(x0, yb, z), undefined, k);
  rect(-bw, -nw, y0, y1, front);
  rect(nw, bw, y0, y1, front);
  rect(-nw, nw, y0, n0, front);
  rect(-nw, nw, n1, y1, front);
  // Inside the niche: back, sides, soffit and sill, darkened by years of lamp smoke.
  rect(-nw, nw, n0, n1, back, 0.55);
  s.quad(P(-nw, n0, back), P(-nw, n0, front), P(-nw, n1, front), P(-nw, n1, back), undefined, 0.6);
  s.quad(P(nw, n0, front), P(nw, n0, back), P(nw, n1, back), P(nw, n1, front), undefined, 0.6);
  s.quad(P(-nw, n1, front), P(nw, n1, front), P(nw, n1, back), P(-nw, n1, back), undefined, 0.4);
  s.quad(P(-nw, n0, back), P(nw, n0, back), P(nw, n0, front), P(-nw, n0, front), undefined, 0.8);
  const g = s.build(SANDSTONE, { seed: f }).applyMatrix4(faceMatrix(f, 0, p.sz, kar));
  b.add('stone', boxUV(g, 2.4));
  // Pilasters, a projecting sill, and a hood over it.
  const mm = faceMatrix(f, 0, p.sz, kar);
  const c = SANDSTONE.clone().multiplyScalar(0.96);
  for (const sx of [-1, 1]) b.add('stone', fill(box('stone', 0.09, n1 - n0 + 0.12, 0.06, sx * (nw + 0.045), (n0 + n1) / 2, front + 0.03), c), mm);
  b.add('stone', fill(box('stone', 0.84, 0.06, 0.12, 0, n0 - 0.03, front + 0.05), c), mm);
  b.add('stone', fill(box('stone', 0.96, 0.1, 0.14, 0, n1 + 0.11, front + 0.06), c), mm);
  b.add('stone', fill(box('stone', 0.72, 0.1, 0.08, 0, n1 + 0.21, front + 0.03), c), mm);
}

/** The carved doorway on the south face: threshold, three jambs a side, lintel, moonstone. */
function doorway(b: Batch, mb: MatBatch, p: Plan, m: Mats, kar: number): void {
  const P0 = p.P;
  const mm = faceMatrix(0, 0, p.sz, kar);
  const frame = SANDSTONE.clone().multiplyScalar(0.9);
  const stoneAt = (sx: number, sy: number, sz: number, cx: number, cy: number, cz: number, c = frame) => b.add('stone', fill(box('stone', sx, sy, sz, cx, cy, cz), c), mm);
  const D = DOOR;
  // Passage through the wall: reveals and soffit.
  const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const pass = new Sheet();
  pass.quad(P(-D.half, P0, -D.passage), P(-D.half, P0, 0), P(-D.half, P0 + D.head, 0), P(-D.half, P0 + D.head, -D.passage), undefined, 0.6);
  pass.quad(P(D.half, P0, 0), P(D.half, P0, -D.passage), P(D.half, P0 + D.head, -D.passage), P(D.half, P0 + D.head, 0), undefined, 0.6);
  pass.quad(P(-D.half, P0 + D.head, 0), P(D.half, P0 + D.head, 0), P(D.half, P0 + D.head, -D.passage), P(-D.half, P0 + D.head, -D.passage), undefined, 0.45);
  pass.quad(P(-D.half, P0 + 0.005, 0), P(D.half, P0 + 0.005, 0), P(D.half, P0 + 0.005, -D.passage), P(-D.half, P0 + 0.005, -D.passage), undefined, 0.7);
  b.add('stone', boxUV(pass.build(SANDSTONE).applyMatrix4(mm), 2.4));

  // Threshold (udumbara), worn and smeared with kumkum.
  stoneAt(D.half * 2 + 0.34, D.sill, 0.42, 0, P0 + D.sill / 2, -0.01, new Color(BASALT_DARK));
  const jambs: [number, number, number, 'scroll' | 'rosette' | null][] = [
    [D.half, D.half + 0.17, 0.09, 'scroll'],
    [D.half + 0.17, D.half + 0.35, 0.12, 'rosette'],
    [D.half + 0.35, D.frame, 0.16, null],
  ];
  const carvedSheet = new Sheet();
  for (const sx of [-1, 1]) {
    for (const [x0, x1, depth, strip] of jambs) {
      const cx = (sx * (x0 + x1)) / 2;
      const yb = strip ? P0 + D.sill : P0;
      stoneAt(x1 - x0, D.head - (yb - P0), depth + 0.02, cx, (yb + P0 + D.head) / 2, depth / 2 - 0.01);
      if (!strip) continue;
      // The carved face, laid up the jamb.
      const xa = sx < 0 ? -x1 : x0;
      const xb = sx < 0 ? -x0 : x1;
      const z = depth + 0.0015;
      const [v0, v1] = stripV(strip);
      const u0 = 0;
      const u1 = (D.head - D.sill) / (strip === 'scroll' ? 1.3 : 1.44);
      carvedSheet.quad(P(xa, yb, z), P(xb, yb, z), P(xb, P0 + D.head, z), P(xa, P0 + D.head, z), [[u0, v0], [u0, v1], [u1, v1], [u1, v0]]);
    }
    // Pilaster base and capital on the outer jamb.
    stoneAt(D.frame - D.half - 0.33, 0.3, 0.22, sx * (D.half + 0.35 + (D.frame - D.half - 0.35) / 2), P0 + 0.15, 0.1);
    stoneAt(D.frame - D.half - 0.31, 0.16, 0.21, sx * (D.half + 0.35 + (D.frame - D.half - 0.35) / 2), P0 + D.head - 0.08, 0.1);
  }
  // Lintel (uttaranga): a lotus band under a creeper band, a rosette block at its centre.
  stoneAt(D.frame * 2, D.lintel - D.head, 0.18, 0, P0 + (D.head + D.lintel) / 2, 0.07);
  const lz = 0.1615;
  const half = D.frame;
  const band = (ya: number, yb: number, strip: 'lotus' | 'scroll', rep: number) =>
    carvedSheet.quad(P(-half, ya, lz), P(half, ya, lz), P(half, yb, lz), P(-half, yb, lz), bandUV(strip, 0, (half * 2) / rep));
  band(P0 + D.head, P0 + D.head + 0.2, 'lotus', 1.6);
  band(P0 + D.head + 0.2, P0 + D.lintel, 'scroll', 1.75);
  stoneAt(0.44, 0.38, 0.06, 0, P0 + (D.head + D.lintel) / 2, 0.19);
  const [rv0, rv1] = stripV('rosette');
  carvedSheet.quad(P(-0.2, P0 + D.head + 0.03, 0.2205), P(0.2, P0 + D.head + 0.03, 0.2205), P(0.2, P0 + D.lintel - 0.03, 0.2205), P(-0.2, P0 + D.lintel - 0.03, 0.2205), [[0.004, rv0], [0.121, rv0], [0.121, rv1], [0.004, rv1]]);
  stoneAt(D.frame * 2 + 0.3, 0.09, 0.26, 0, P0 + D.lintel + 0.045, 0.1);
  mb.add(m.carved, carvedSheet.build(frame, { grain: 0.04 }).applyMatrix4(mm));

  // The half-moon step (ardhachandra) before the threshold.
  const moon = new CylinderGeometry(0.64, 0.64, 0.03, 24, 1, false, -Math.PI / 2, Math.PI).translate(0, P0 + 0.015, 0.2);
  b.add('stone', fill(boxUV(moon, 'stone'), BASALT_DARK), mm);
}

/** The garbhagriha within: a small dark chamber, walls black with lamp soot. */
function cell(b: Batch, p: Plan, kar: number): void {
  const P0 = p.P;
  const C = CELL;
  const D = DOOR;
  const z0 = -D.passage;
  const z1 = -C.back;
  const y1 = P0 + C.h;
  const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const s = new Sheet();
  // Inward-facing: floor, back, sides, ceiling, and the front wall around the door.
  s.quad(P(-C.half, P0 + 0.004, z0), P(-C.half, P0 + 0.004, z1), P(C.half, P0 + 0.004, z1), P(C.half, P0 + 0.004, z0), undefined, 1.3);
  s.quad(P(-C.half, P0, z1), P(C.half, P0, z1), P(C.half, y1, z1), P(-C.half, y1, z1));
  s.quad(P(-C.half, P0, z0), P(-C.half, P0, z1), P(-C.half, y1, z1), P(-C.half, y1, z0));
  s.quad(P(C.half, P0, z1), P(C.half, P0, z0), P(C.half, y1, z0), P(C.half, y1, z1));
  s.quad(P(-C.half, y1, z1), P(C.half, y1, z1), P(C.half, y1, z0), P(-C.half, y1, z0), undefined, 0.6);
  const front = (x0: number, x1: number, ya: number, yb: number) => s.quad(P(x1, ya, z0), P(x0, ya, z0), P(x0, yb, z0), P(x1, yb, z0));
  front(-C.half, -D.half, P0, y1);
  front(D.half, C.half, P0, y1);
  front(-D.half, D.half, P0 + D.head, y1);
  const tone = (_x: number, y: number) => 1.1 - 0.45 * Math.min(Math.max((y - P0 - 1.2) / 1.9, 0), 1);
  b.add('stone', boxUV(s.build(SOOT, { tone, grain: 0.12 }).applyMatrix4(faceMatrix(0, 0, p.sz, kar)), 1.6));
}

// ---- Mandapa ------------------------------------------------------------------------------------

/** Chalukyan lathe-turned shaft, heights above the platform (ends at the upper block). */
const SHAFT: [number, number, number?][] = [
  [0.2, 0.6, 1], [0.215, 0.64], [0.19, 0.69], [0.2, 0.92], [0.235, 0.98], [0.235, 1.02], [0.2, 1.07], [0.24, 1.26], [0.268, 1.38], [0.255, 1.48], [0.2, 1.58],
  [0.225, 1.62], [0.19, 1.67], [0.23, 1.78], [0.258, 1.86], [0.23, 1.94], [0.17, 2.0], [0.17, 2.06], [0.24, 2.1], [0.255, 2.16], [0.2, 2.22], [0.18, 2.3, 1],
];
const CAPITAL: [number, number, number?][] = [[0.16, 2.52, 1], [0.16, 2.58], [0.22, 2.6], [0.27, 2.64], [0.27, 2.67], [0.22, 2.7, 1], [0.001, 2.7]];

function mandapa(b: Batch, mb: MatBatch, p: Plan, m: Mats, lvl: 0 | 1): void {
  const P0 = p.P;
  const H = p.ceiling - P0;
  const basalt = new Color(BASALT);
  const dark = new Color(BASALT_DARK);
  const zc = (p.roofZ0 + p.roofZ1) / 2;
  const hz = (p.roofZ1 - p.roofZ0) / 2;
  const [rv0, rv1] = stripV('rosette');
  const [cv0, cv1] = stripV('chain');

  // ---- Pillars ----
  const carvedBlocks = new Sheet();
  const shaft = lvl === 0 ? turned(SHAFT, 20, 1.6) : null;
  const capital = lvl === 0 ? turned(CAPITAL, 20, 1.6) : null;
  for (const px of p.pillarXs) {
    for (const pz of p.pillarZs) {
      if (lvl === 1) {
        b.add('stone', fill(new CylinderGeometry(0.22, 0.25, H - 0.2, 8).translate(px, P0 + (H - 0.2) / 2, pz), dark));
        b.add('stone', fill(box('stone', 0.9, 0.2, 0.9, px, P0 + H - 0.1, pz), basalt));
        continue;
      }
      b.add('stone', weather(box('stone', 0.54, 0.08, 0.54, px, P0 + 0.04, pz), basalt, { ground: P0, splash: 0.2, strength: 0.2 }));
      // Square blocks at foot and head, their faces carved (rosettes below, bells above).
      block(carvedBlocks, px, pz, P0 + 0.08, P0 + 0.6, 0.23, [0.004, 0.121], [rv0, rv1]);
      block(carvedBlocks, px, pz, P0 + 2.3, P0 + 2.52, 0.21, [0.0, 0.125], [cv0, cv1]);
      mb.add(m.basalt, (shaft as ReturnType<typeof turned>).clone().translate(px, P0, pz), undefined, dark);
      mb.add(m.basalt, (capital as ReturnType<typeof turned>).clone().translate(px, P0, pz), undefined, dark);
      b.add('stone', fill(box('stone', 0.52, 0.06, 0.52, px, P0 + 2.73, pz), basalt));
      // Stepped (taranga) bracket arms in both directions.
      for (const [len, y] of [[0.52, 2.79], [0.78, 2.85], [1.02, 2.91]]) {
        b.add('stone', fill(box('stone', len, 0.06, 0.3, px, P0 + y, pz), basalt));
        b.add('stone', fill(box('stone', 0.3, 0.06, len, px, P0 + y, pz), basalt));
      }
    }
  }
  shaft?.dispose();
  capital?.dispose();
  if (!carvedBlocks.empty) mb.add(m.carved, carvedBlocks.build(basalt, { grain: 0.05 }));

  // ---- Beams, ceiling, roof slab ----
  const beamY = p.ceiling - 0.08;
  const xs = p.pillarXs;
  const x0 = Math.min(...xs) - 0.5;
  const x1 = Math.max(...xs) + 0.5;
  for (const pz of p.pillarZs) b.add('stone', fill(box('stone', x1 - x0, 0.16, 0.34, 0, beamY, pz), basalt));
  const [zf, zb] = [Math.max(...p.pillarZs), Math.min(...p.pillarZs)];
  const wallFace = p.sz + p.sh;
  for (const px of xs) {
    const zEnd = Math.abs(px) < p.sh ? wallFace : zb - 0.3;
    b.add('stone', fill(box('stone', 0.34, 0.16, zf + 0.3 - zEnd, px, beamY, (zf + 0.3 + zEnd) / 2), basalt));
  }
  const slab = boxUV(new BoxGeometry(p.roofHx * 2, 0.5, hz * 2).translate(0, p.ceiling + 0.25, zc), 2.4);
  b.add('stone', weather(slab, SANDSTONE, { ground: p.ceiling, splash: 0.3, strength: 0.2 }));
  if (lvl === 0) {
    // Coffered lotus ceiling in the central bay.
    const inner = Math.min(...xs.map(Math.abs));
    const cs = new Sheet();
    const n = 4;
    const cw = (inner * 2) / n;
    const cd = (zf - zb) / n;
    for (let j = 0; j < n; j++) {
      const za = zb + j * cd;
      cs.quad(new Vector3(-inner, p.ceiling - 0.004, za), new Vector3(-inner, p.ceiling - 0.004, za + cd), new Vector3(inner, p.ceiling - 0.004, za + cd), new Vector3(inner, p.ceiling - 0.004, za), [[0, rv0], [0, rv1], [n * 0.125, rv1], [n * 0.125, rv0]]);
    }
    void cw;
    mb.add(m.carved, cs.build(SANDSTONE.clone().multiplyScalar(0.8)));
  }

  // ---- Chhajja: the sloping stone eave round the roof ----
  const ch = new Sheet();
  const eave = (y: number, grow: number): Ring => ({ y, hx: p.roofHx + grow, hz: hz + grow, ds: 0 });
  const top: Ring[] = [eave(p.ceiling + 0.44, 0), eave(p.ceiling + 0.1, 0.6), eave(p.ceiling + 0.02, 0.6)];
  rathaLoft(top, () => FLAT(), (q) => ch.quad(q.a, q.b, q.c, q.d, undefined, facing(q)), 0, zc);
  const under: Ring[] = [eave(p.ceiling + 0.02, 0.6), eave(p.ceiling + 0.3, 0)];
  rathaLoft(under, () => FLAT(), (q) => ch.quad(q.a, q.d, q.c, q.b, undefined, 0.62), 0, zc);
  b.add('stone', boxUV(ch.build(SANDSTONE, { seed: 7 }), 2.4));

  // ---- Parapet with kalash finials ----
  const py = p.ceiling + 0.5;
  const t = 0.26;
  const runs: [number, number, number, number][] = [
    [-p.roofHx, p.roofZ1 - t, p.roofHx, p.roofZ1],
    [-p.roofHx, p.roofZ0, -p.roofHx + t, p.roofZ1],
    [p.roofHx - t, p.roofZ0, p.roofHx, p.roofZ1],
    [-p.roofHx, p.roofZ0, -p.sh, p.roofZ0 + t],
    [p.sh, p.roofZ0, p.roofHx, p.roofZ0 + t],
  ];
  const par = SANDSTONE.clone().multiplyScalar(0.97);
  for (const [ax, az, bx, bz] of runs) {
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const w = bx - ax;
    const d = bz - az;
    b.add('stone', weather(box('stone', w + 0.06, 0.08, d + 0.06, cx, py + 0.04, cz), par, { ground: py, strength: 0.1 }));
    b.add('stone', weather(slabBox(w, 0.4, d, cx, py + 0.28, cz), par, { ground: py, splash: 0.3, strength: 0.15, top: py + 0.5, topStrength: 0.1 }));
    b.add('stone', fill(box('stone', w + 0.08, 0.1, d + 0.08, cx, py + 0.53, cz), par.clone().multiplyScalar(1.04)));
  }
  const finial = turned([[0.001, 0], [0.16, 0], [0.17, 0.05, 1], [0.12, 0.08], [0.16, 0.16], [0.17, 0.22], [0.12, 0.3], [0.07, 0.34], [0.11, 0.38], [0.05, 0.46], [0.001, 0.56]], lvl === 0 ? 12 : 6, 1);
  const fy = py + 0.58;
  const hx = p.roofHx - t / 2;
  const spots: [number, number][] = [[-hx, p.roofZ1 - t / 2], [hx, p.roofZ1 - t / 2], [-hx, p.roofZ0 + t / 2], [hx, p.roofZ0 + t / 2], [-hx, zc], [hx, zc]];
  if (lvl === 0) for (const x of [-1.3, 1.3]) spots.push([x, p.roofZ1 - t / 2]);
  for (const [x, z] of spots) b.add('stone', fill(finial.clone().translate(x, fy, z), par));
  finial.dispose();
}

/** A box with some height segments, for weathering. */
function slabBox(sx: number, sy: number, sz: number, cx: number, cy: number, cz: number): ReturnType<typeof box> {
  return boxUV(new BoxGeometry(sx, sy, sz, 1, 3, 1).translate(cx, cy, cz), 'stone');
}

/** The four carved faces (and plain top) of a square pillar block. */
function block(s: Sheet, x: number, z: number, y0: number, y1: number, h: number, u: [number, number], v: [number, number]): void {
  const P = (px: number, py: number, pz: number) => new Vector3(x + px, py, z + pz);
  const uv = [[u[0], v[0]], [u[1], v[0]], [u[1], v[1]], [u[0], v[1]]] as const;
  s.quad(P(-h, y0, h), P(h, y0, h), P(h, y1, h), P(-h, y1, h), uv);
  s.quad(P(h, y0, h), P(h, y0, -h), P(h, y1, -h), P(h, y1, h), uv);
  s.quad(P(h, y0, -h), P(-h, y0, -h), P(-h, y1, -h), P(h, y1, -h), uv);
  s.quad(P(-h, y0, -h), P(-h, y0, h), P(-h, y1, h), P(-h, y1, -h), uv);
  s.quad(P(-h, y1, h), P(h, y1, h), P(h, y1, -h), P(-h, y1, -h), [[u[0], v[0]], [u[0], v[0]], [u[0], v[0]], [u[0], v[0]]]);
}

// ---- Courtyard wall and gateways ------------------------------------------------------------------

/** The south gateway's clear half-width (where the wall colliders end). */
function gateHalf(p: Plan): number {
  let best = Infinity;
  for (const w of p.walls) {
    for (const e of [w.points[0], w.points[w.points.length - 1]]) {
      if (Math.abs(e.z - p.walls[0].points[0].z) < 0.01 && Math.abs(e.x) < 6) best = Math.min(best, Math.abs(e.x) - w.thickness / 2);
    }
  }
  return Number.isFinite(best) ? best : 2.35;
}

function courtyard(b: Batch, p: Plan, lvl: 0 | 1): void {
  const ends = new Map<string, number>();
  const key = (q: P2) => `${q.x.toFixed(2)},${q.z.toFixed(2)}`;
  for (const w of p.walls) for (const q of [w.points[0], w.points[w.points.length - 1]]) ends.set(key(q), (ends.get(key(q)) ?? 0) + 1);
  const stone = new Color(BASALT);
  for (const w of p.walls) {
    const H = w.height;
    const T = w.thickness;
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const e = w.points[i + 1];
      const len = Math.hypot(e.x - a.x, e.z - a.z);
      const rot = Math.atan2(e.x - a.x, e.z - a.z);
      const mm = place((a.x + e.x) / 2 - p.ox, 0, (a.z + e.z) / 2, rot);
      const L = len + T;
      if (lvl === 1) {
        b.add('stone', fill(box('stone', T, H, L, 0, H / 2, 0), stone), mm);
        continue;
      }
      b.add('stone', weather(box('stone', T + 0.08, 0.22, L + 0.08, 0, 0.11, 0), stone.clone().multiplyScalar(0.92), { ground: 0, splash: 0.3, strength: 0.3 }), mm);
      b.add('stone', weather(slabBox(T, H - 0.36, L, 0, (H - 0.36) / 2 + 0.2, 0), stone, { ground: 0, splash: 0.9, strength: 0.3, top: H - 0.16, topStrength: 0.12, seed: i }), mm);
      b.add('stone', fill(box('stone', T + 0.12, 0.12, L + 0.12, 0, H - 0.1, 0), '#8f867c'), mm);
      b.add('stone', fill(box('stone', T - 0.14, 0.06, L - 0.1, 0, H + 0.0, 0), '#8a8177'), mm);
      // Piers every few metres, each capped for a diya.
      const n = Math.max(1, Math.round(len / 3.2));
      for (let k = 0; k <= n; k++) {
        const along = -len / 2 + (len * k) / n;
        const endPt = k === 0 ? a : k === n ? e : null;
        if (endPt && (ends.get(key(endPt)) ?? 0) === 1) continue;
        b.add('stone', weather(box('stone', T + 0.14, H + 0.1, 0.62, 0, (H + 0.1) / 2, along), stone.clone().multiplyScalar(0.95), { ground: 0, splash: 0.8, strength: 0.28 }), mm);
        b.add('stone', fill(box('stone', T + 0.24, 0.08, 0.72, 0, H + 0.14, along), '#958b80'), mm);
      }
    }
    // Side gates: tall piers with kalash tops where the wall stops.
    for (const q of [w.points[0], w.points[w.points.length - 1]]) {
      if ((ends.get(key(q)) ?? 0) !== 1 || Math.abs(q.x - p.ox) < 6) continue;
      const nb = q === w.points[0] ? w.points[1] : w.points[w.points.length - 2];
      const l = Math.hypot(nb.x - q.x, nb.z - q.z);
      const dx = (nb.x - q.x) / l;
      const dz = (nb.z - q.z) / l;
      const cx = q.x - p.ox - dx * (T / 2 - 0.36);
      const cz = q.z - dz * (T / 2 - 0.36);
      b.add('stone', weather(box('stone', 0.72, 2.3, 0.72, cx, 1.15, cz), stone, { ground: 0, splash: 0.9, strength: 0.3 }));
      b.add('stone', fill(box('stone', 0.84, 0.1, 0.84, cx, 2.35, cz), '#958b80'));
      if (lvl === 0) b.add('stone', fill(turned([[0.001, 0], [0.2, 0], [0.24, 0.12], [0.2, 0.26], [0.1, 0.32], [0.13, 0.36], [0.05, 0.48], [0.001, 0.56]], 12, 1).translate(cx, 2.4, cz), '#8f867c'));
    }
  }
}

/** The kaman: a cusped Maratha arch over the south gate, with a plaque, cornice and finials. */
function gate(b: Batch, mb: MatBatch, p: Plan, m: Mats, lvl: 0 | 1): void {
  const s = gateHalf(p);
  const z = p.walls[0].points[0].z;
  const pw = 0.66;
  const depth = 0.72;
  const spring = 2.6;
  const top = 4.95;
  const stone = new Color(BASALT);
  for (const sx of [-1, 1]) {
    const cx = sx * (s + pw / 2);
    b.add('stone', weather(box('stone', pw + 0.14, 0.3, depth + 0.14, cx, 0.15, z), stone.clone().multiplyScalar(0.9), { ground: 0, splash: 0.3 }));
    b.add('stone', weather(slabBox(pw, spring - 0.45, depth, cx, 0.3 + (spring - 0.45) / 2, z), stone, { ground: 0, splash: 1, strength: 0.3 }));
    b.add('stone', fill(box('stone', pw + 0.12, 0.15, depth + 0.12, cx, spring - 0.075, z), '#8c837a'));
  }
  // The arch and the wall above it: front, back and the scalloped soffit.
  const n = lvl === 0 ? 56 : 14;
  const rise = 1.28;
  const archY = (x: number) => {
    const u = Math.min(Math.abs(x) / s, 1);
    const base = rise * Math.sqrt(Math.max(0, 1 - u ** 2.3)) + 0.16 * Math.max(0, 1 - u / 0.3) ** 2;
    const t = (x + s) / (2 * s);
    const cusp = lvl === 0 ? 0.13 * (1 - Math.abs(Math.sin(Math.PI * 7 * t)) ** 0.45) : 0;
    return spring + base - cusp * (1 - 0.5 * u);
  };
  const w = new Sheet();
  const zf = z + depth / 2;
  const zb = z - depth / 2;
  const P = (x: number, y: number, zz: number) => new Vector3(x, y, zz);
  for (let i = 0; i < n; i++) {
    const xa = -s + (2 * s * i) / n;
    const xb = -s + (2 * s * (i + 1)) / n;
    const ya = archY(xa);
    const yb = archY(xb);
    w.quad(P(xa, ya, zf), P(xb, yb, zf), P(xb, top, zf), P(xa, top, zf));
    w.quad(P(xb, yb, zb), P(xa, ya, zb), P(xa, top, zb), P(xb, top, zb));
    w.quad(P(xb, yb, zf), P(xa, ya, zf), P(xa, ya, zb), P(xb, yb, zb), undefined, 0.7);
  }
  // Above the piers, up to the cornice.
  for (const sx of [-1, 1]) {
    const xa = sx * s;
    const xb = sx * (s + pw);
    const [l, r] = sx < 0 ? [xb, xa] : [xa, xb];
    w.quad(P(l, spring, zf), P(r, spring, zf), P(r, top, zf), P(l, top, zf));
    w.quad(P(r, spring, zb), P(l, spring, zb), P(l, top, zb), P(r, top, zb));
    w.quad(sx > 0 ? P(xb, spring, zf) : P(xb, spring, zb), sx > 0 ? P(xb, spring, zb) : P(xb, spring, zf), sx > 0 ? P(xb, top, zb) : P(xb, top, zf), sx > 0 ? P(xb, top, zf) : P(xb, top, zb), undefined, 0.9);
  }
  b.add('stone', boxUV(w.build(stone, { seed: 11, tone: (_x, y) => 0.9 + 0.1 * Math.min((y - spring) / 2, 1) }), 1.8));
  // Cornice, parapet and finials.
  const W = s + pw;
  b.add('stone', fill(box('stone', W * 2 + 0.3, 0.14, depth + 0.3, 0, top + 0.07, z), '#948a80'));
  b.add('stone', weather(box('stone', W * 2 - 0.2, 0.36, depth - 0.1, 0, top + 0.32, z), stone, { ground: top, strength: 0.1 }));
  b.add('stone', fill(box('stone', W * 2, 0.08, depth + 0.02, 0, top + 0.54, z), '#948a80'));
  const fin = turned([[0.001, 0], [0.24, 0], [0.26, 0.06, 1], [0.18, 0.1], [0.26, 0.24], [0.27, 0.32], [0.17, 0.44], [0.1, 0.5], [0.16, 0.56], [0.06, 0.74], [0.001, 0.86]], lvl === 0 ? 14 : 8, 1);
  b.add('stone', fill(fin.clone().translate(0, top + 0.58, z), '#8d8379'));
  for (const sx of [-1, 1]) b.add('stone', fill(fin.clone().scale(0.6, 0.6, 0.6).translate(sx * (W - 0.2), top + 0.58, z), '#8d8379'));
  fin.dispose();
  if (lvl === 1) return;
  // The plaque over the arch, facing the road: श्री गणेश मंदिर.
  const [u0, u1] = PANEL.plaque;
  const [v0, v1] = stripV('panel');
  const pz = zf + 0.03;
  const plaque = new Sheet().quad(P(-0.78, 4.12, pz), P(0.78, 4.12, pz), P(0.78, 4.9, pz), P(-0.78, 4.9, pz), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  mb.add(m.carved, plaque.build('#e6dccd', { grain: 0.02 }));
  b.add('stone', fill(box('stone', 1.66, 0.86, 0.03, 0, 4.51, zf + 0.012), '#6f665e'));
}

// ---- Living detail ------------------------------------------------------------------------------

function details(a: ArtContext, p: Plan, m: Mats): Group {
  const g = new Group();
  g.name = 'temple:details';
  const b = new Batch();
  const mb = new MatBatch();
  const lit = litIn(a, p);
  const world = (x: number, y: number, z: number) => new Vector3(x + p.ox, y, z);
  const P0 = p.P;
  const kar = p.sh - 0.04;
  const door = p.sz + kar;

  // ---- The sanctum: the god, his lamps, the doors standing open ----
  const deityFront = door - 3.62;
  const { heart } = deity(b, mb, m, 0, P0, deityFront);
  for (const sx of [-1, 1]) samai(b, lit, sx * 0.86, P0, deityFront + 0.2, 1);
  a.lamps.anchor(world(0, P0 + 1.1, door - 1.2), 2.6, '#ffa04a', 7);
  // Soft halos: behind him, and round each samai.
  const halo: BufferGeometry[] = [];
  halo.push(new PlaneGeometry(1.9, 1.9).translate(heart.x, heart.y, heart.z - 0.2));
  for (const sx of [-1, 1]) halo.push(new PlaneGeometry(0.8, 0.8).translate(sx * 0.86, P0 + 0.74, deityFront + 0.24));
  halo.push(new PlaneGeometry(1.3, 2.3).translate(0, P0 + DOOR.sill + 1.1, door - DOOR.passage - 0.05));
  const haloMesh = new Mesh(mergeGeometries(halo, false), m.halo);
  haloMesh.name = 'temple:halo';
  haloMesh.renderOrder = 3;
  for (const h of halo) h.dispose();
  g.add(haloMesh);
  // Door leaves folded back into the passage, brass-studded.
  for (const sx of [-1, 1]) {
    const x = sx * (DOOR.half - 0.035);
    const zc = door - 0.12 - 0.3;
    b.add('teak', fill(box('teak', 0.05, DOOR.head - DOOR.sill - 0.04, 0.58, x, P0 + DOOR.sill + (DOOR.head - DOOR.sill) / 2, zc), '#5a3a24'));
    for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) b.add('brass', new CylinderGeometry(0.018, 0.018, 0.02, 6).rotateZ(Math.PI / 2).translate(x - sx * 0.03, P0 + 0.35 + r * 0.33, zc - 0.2 + c * 0.2));
  }
  // Kumkum and haldi dabbed on the threshold, flowers laid on it.
  for (let i = 0; i < 7; i++) b.add('paint', new CylinderGeometry(0.018, 0.018, 0.004, 8).translate(-0.45 + i * 0.15, P0 + DOOR.sill + 0.002, door + 0.02), i % 2 ? TONE.turmeric : TONE.vermilion);
  for (const [fx, c] of [[-0.25, TONE.marigold], [0.05, '#c11a2a'], [0.3, TONE.marigoldYellow]] as const) b.add('paint', new CylinderGeometry(0.04, 0.035, 0.03, 8).translate(fx, P0 + DOOR.sill + 0.015, door + 0.08), c);
  // Toran of mango leaves and marigolds across the door's lintel.
  festoon(b, new Vector3(-DOOR.frame, P0 + DOOR.lintel - 0.04, door + 0.24), new Vector3(DOOR.frame, P0 + DOOR.lintel - 0.04, door + 0.24), 0.14, 0.035, true, 8);
  diya(b, lit, -0.5, P0 + 0.03, door + 0.5);
  diya(b, lit, 0.5, P0 + 0.03, door + 0.5);
  // A lamp in each niche.
  for (const f of [1, 2, 3]) {
    const v = new Vector3(0, P0 + 1.35, 0).applyMatrix4(faceMatrix(f, 0, p.sz, kar));
    diya(b, lit, v.x, v.y, v.z);
  }

  // ---- The mandapa: the kasav, bells, garlands, the hanging lamp ----
  const [tu0, tu1] = PANEL.turtle;
  const [tv0, tv1] = stripV('panel');
  const T = 0.5;
  const ox = p.offer.x;
  const oz = p.offer.z;
  const kasav = new Sheet().quad(new Vector3(ox - T, P0 + 0.004, oz + T), new Vector3(ox + T, P0 + 0.004, oz + T), new Vector3(ox + T, P0 + 0.004, oz - T), new Vector3(ox - T, P0 + 0.004, oz - T), [[tu0, tv0], [tu1, tv0], [tu1, tv1], [tu0, tv1]]);
  mb.add(m.carved, kasav.build('#6d655d', { grain: 0.03 }));
  const zFront = Math.max(...p.pillarZs);
  const beamUnder = p.ceiling - 0.16;
  bell(b, 0, beamUnder, zFront, 1.25, 0.34);
  for (const sx of [-1, 1]) bell(b, sx * 0.62, beamUnder, zFront, 0.8, 0.22);
  hangingLamp(b, lit, 0, p.ceiling, oz + 0.2, 0.7);
  a.lamps.anchor(world(0, p.ceiling - 0.9, oz + 0.2), 2.0, '#ff9a3c', 7);
  // Garlands swagged from the chhajja's edge, and a toran along the front beam.
  const lipY = p.ceiling + 0.02;
  const lipZ = p.roofZ1 + 0.6;
  const lipX = p.roofHx + 0.6;
  const fx = [-lipX, ...p.pillarXs, lipX];
  for (let i = 0; i + 1 < fx.length; i++) festoon(b, new Vector3(fx[i], lipY, lipZ + 0.02), new Vector3(fx[i + 1], lipY, lipZ + 0.02), 0.32, 0.045, false, i === 0 || i === fx.length - 2 ? 7 : 5);
  for (const sx of [-1, 1]) {
    const zs = [lipZ, ...p.pillarZs.slice().sort((q, r) => r - q).slice(1), p.roofZ0 - 0.6];
    for (let i = 0; i + 1 < zs.length; i++) festoon(b, new Vector3(sx * (lipX + 0.02), lipY, zs[i]), new Vector3(sx * (lipX + 0.02), lipY, zs[i + 1]), 0.3, 0.045, false, 5);
  }
  festoon(b, new Vector3(Math.min(...p.pillarXs), beamUnder, zFront + 0.2), new Vector3(Math.max(...p.pillarXs), beamUnder, zFront + 0.2), 0.12, 0.035, true, 0);
  // Marigold strands wound down the front pillars.
  for (const px of p.pillarXs) {
    const pts: Vector3[] = [];
    for (let i = 0; i < 40; i++) {
      const t = i / 39;
      const ang = t * Math.PI * 5;
      pts.push(new Vector3(px + Math.sin(ang) * 0.27, P0 + 2.2 - t * 1.3, zFront + Math.cos(ang) * 0.27));
    }
    marigolds(b, pts, 0.04);
  }

  // ---- Diyas: the steps, the platform's edge, the mūshak, the courtyard wall ----
  const inner = p.stepsHalf - 0.3;
  for (let i = 0; i < p.steps; i++) {
    const top = P0 - STEP_RISE * (i + 1);
    for (const sx of [-1, 1]) diya(b, lit, sx * (inner - 0.14), top, p.front + STEP_RUN * (i + 0.5));
  }
  for (const sx of [-1, 1]) {
    for (let x = p.stepsHalf + 0.5; x < p.phx - 0.2; x += 0.75) diya(b, lit, sx * x, P0, p.front - 0.2);
  }
  for (const sx of [-1, 1]) diya(b, lit, p.mushak.x + sx * 0.3, 1.0, p.mushak.z + 0.34);
  for (const w of p.walls) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a0 = w.points[i];
      const e = w.points[i + 1];
      const len = Math.hypot(e.x - a0.x, e.z - a0.z);
      const n = Math.max(1, Math.round(len / 3.2));
      for (let k = 1; k < n; k++) diya(b, lit, a0.x + ((e.x - a0.x) * k) / n - p.ox, w.height + 0.18, a0.z + ((e.z - a0.z) * k) / n);
    }
  }
  // At the foot of the lamp tower: fresh diyas stacked, a brass oil pot — the lighting goes on.
  const dx = p.deepa.x + 0.75;
  const dz = p.deepa.z + 0.35;
  for (let i = 0; i < 5; i++) diya(b, lit, dx + (i % 3) * 0.05, 0.02 + i * 0.018, dz + (i % 2) * 0.03, false);
  b.add('brass', turned([[0.001, 0], [0.09, 0], [0.12, 0.06], [0.11, 0.13], [0.05, 0.19], [0.05, 0.23], [0.07, 0.25], [0.001, 0.25]], 12).translate(dx - 0.25, 0, dz + 0.1));
  a.lamps.anchor(world(p.deepa.x, 2.6, p.deepa.z), 2.2, '#ff9a3c', 7);

  // ---- The gate: bell under the arch, toran across it ----
  const s = gateHalf(p);
  const gz = p.walls[0].points[0].z;
  bell(b, 0, 2.6 + 1.28 + 0.16, gz, 1.1, 0.42);
  festoon(b, new Vector3(-s + 0.05, 2.62, gz + 0.38), new Vector3(s - 0.05, 2.62, gz + 0.38), 0.3, 0.045, true, 9);
  for (const sx of [-1, 1]) diya(b, lit, sx * (s + 0.33), 2.6 + 0.005, gz);
  a.lamps.anchor(world(0, 2.3, gz - 0.8), 1.6, '#ff9a3c', 6);

  const built = b.build(a.kit, { name: 'temple:details', cast: false });
  mb.build(built, { cast: false });
  g.add(built);

  // Rangoli at the gate and at the foot of the steps (one mesh, one draw).
  const r1 = new PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2).translate(0, 0.012, (p.mushak.z + p.front + STEP_RUN * p.steps) / 2 - 0.1);
  const r2 = new PlaneGeometry(1.25, 1.25).rotateX(-Math.PI / 2).translate(0, 0.012, (gz + p.mushak.z) / 2 - 0.05);
  const rg = new Mesh(mergeGeometries([r1, r2], false), a.kit.decal('rangoli-lotus-1', rangoli(a.bank, 'lotus', 1)));
  r1.dispose();
  r2.dispose();
  rg.name = 'temple:rangoli';
  rg.receiveShadow = true;
  g.add(rg);
  return g;
}
