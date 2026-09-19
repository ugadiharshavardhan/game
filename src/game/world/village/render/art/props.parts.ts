/**
 * Shared parts for the shops and the village props: clay pots and diyas, gunny sacks, marigold
 * heaps and garlands, fruit, bamboo, cloth — plus the plumbing both modules need (lathe UVs in
 * metres, merging meshes that use one-off materials, LOD groups, local → world placement).
 *
 * Every part is built at the origin in its own frame (base on y = 0 unless noted) and handed to a
 * Batch with a placement matrix, so the same pot can sit on a shelf, a stall or a well parapet.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  LOD,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toWorld } from '../../dims';
import { type Batch, fill, hashf, orient } from './geom';
import { TONE } from './palette';

// ---- Placement ------------------------------------------------------------------------------

/** Local → world for a feature at (x, z) turned by `rot` (same convention as dims.toWorld). */
export type Framer = (lx: number, y: number, lz: number) => Vector3;

export function framer(x: number, z: number, rot: number): Framer {
  return (lx, y, lz) => {
    const p = toWorld({ x, z }, rot, lx, lz);
    return new Vector3(p.x, y, p.z);
  };
}

/** A feature's root group, placed and turned like its collider. */
export function featureRoot(name: string, x: number, z: number, rot: number): Group {
  const g = new Group();
  g.name = name;
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return g;
}

/** THREE.LOD from [object, fromDistance] pairs; an empty level at `hideAt` culls it entirely. */
export function lodOf(levels: [Object3D, number][], hideAt?: number): LOD {
  const l = new LOD();
  for (const [o, d] of levels) l.addLevel(o, d, 0.08);
  if (hideAt !== undefined) l.addLevel(new Group(), hideAt, 0.05);
  return l;
}

// ---- Custom-material meshes -----------------------------------------------------------------

const KEEP = ['position', 'normal', 'uv', 'color'];

/**
 * Like Batch, for the few one-off materials (signboards, glass, painted planters): collects
 * geometry and merges it into a single mesh.
 */
export class Merge {
  private readonly parts: BufferGeometry[] = [];

  add(geo: BufferGeometry, m?: Matrix4, color?: Color | string): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (m) g.applyMatrix4(m);
    for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
    const n = g.getAttribute('position').count;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.getAttribute('color')) g = fill(g, color ?? '#ffffff');
    this.parts.push(g);
    return this;
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  build(material: Material, name: string, cast = false): Mesh | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const g of this.parts) g.dispose();
    this.parts.length = 0;
    if (!merged) return null;
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, material);
    mesh.name = name;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    return mesh;
  }
}

// ---- Geometry helpers ------------------------------------------------------------------------

/**
 * A lathe whose UVs are in metres ÷ tile: u around the circumference at the widest radius, v along
 * the profile's length — so a stone ring or a haystack takes its texture at the same scale as a wall.
 * Repeat a profile point to get a hard edge there.
 */
export function latheM(profile: [number, number][], segments: number, tile: number, phiStart = 0, phiLength = Math.PI * 2): BufferGeometry {
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments, phiStart, phiLength);
  const cum = [0];
  for (let i = 1; i < profile.length; i++) cum.push(cum[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const rMax = Math.max(...profile.map((p) => p[0]));
  const uv = g.getAttribute('uv');
  const n = profile.length;
  for (let i = 0; i <= segments; i++) for (let j = 0; j < n; j++) uv.setXY(i * n + j, ((i / segments) * phiLength * rMax) / tile, cum[j] / tile);
  return g;
}

/** Multiplies existing vertex colours by k(x, y, z) — soot above a stove, damp at a waterline. */
export function shade(g: BufferGeometry, k: (x: number, y: number, z: number) => number): BufferGeometry {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  if (!col) return g;
  for (let i = 0; i < pos.count; i++) {
    const f = k(pos.getX(i), pos.getY(i), pos.getZ(i));
    col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  }
  col.needsUpdate = true;
  return g;
}

/**
 * Per-face colour from a palette, chosen by hashing each triangle's centre — a mosaic that reads
 * as many small things (flower heads, grains, pebbles) at no extra geometry.
 */
export function mosaic(g: BufferGeometry, palette: readonly string[], seed = 0, jitter = 0.12): BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  if (src !== g) g.dispose();
  const pos = src.getAttribute('position');
  const cols = palette.map((c) => new Color(c));
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const h = hashf(cx * 17.3 + seed, cy * 11.1, cz * 13.7);
    const c = cols[Math.floor(h * cols.length) % cols.length];
    const k = 1 + (hashf(cz * 5.1, cx * 7.7 + seed, cy * 3.3) - 0.5) * 2 * jitter;
    for (let v = 0; v < 3; v++) out.set([c.r * k, c.g * k, c.b * k], (i + v) * 3);
  }
  src.setAttribute('color', new BufferAttribute(out, 3));
  return src;
}

/** A lumpy mound (grain in a sack, a heap of marigolds): a squashed, displaced hemisphere. */
export function mound(r: number, h: number, seed: number, detail = 2, lump = 0.12): BufferGeometry {
  const g = new IcosahedronGeometry(1, detail);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + (hashf(x * 3.1 + seed, y * 3.7, z * 2.9) - 0.5) * 2 * lump;
    pos.setXYZ(i, x * r * k, Math.max(y, -0.05) * h * k, z * r * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A cylinder between two points (rope, rod, pipe, bamboo). */
export function rod(a: Vector3, b: Vector3, r: number, sides = 6, open = true): BufferGeometry {
  return orient(new CylinderGeometry(r, r, a.distanceTo(b), sides, 1, open), a, b);
}

/** A length of bamboo from a to b: a smooth culm with slightly swollen nodes every ~0.4 m. */
export function bamboo(b: Batch, a: Vector3, e: Vector3, r: number, color: string, seed = 0): void {
  const c = new Color(color).multiplyScalar(0.92 + hashf(a.x, a.z, seed) * 0.16);
  b.add('paint', rod(a, e, r, 6, false), c);
  const len = a.distanceTo(e);
  const n = Math.floor(len / 0.42);
  const node = c.clone().multiplyScalar(0.72);
  for (let i = 1; i <= n; i++) {
    const t = (i - 0.35 + hashf(i, seed, a.x) * 0.3) / (n + 0.3);
    const p = new Vector3().lerpVectors(a, e, t);
    const d = new Vector3().subVectors(e, a).normalize().multiplyScalar(0.012);
    b.add('paint', rod(p.clone().sub(d), p.clone().add(d), r * 1.14, 6, false), node);
  }
}

// ---- Clay, brass and the puja --------------------------------------------------------------

/** Round-bellied water pot (matka), ~0.42 m tall, mouth closed so no backfaces show. */
export const MATKA: [number, number][] = [
  [0.001, 0], [0.06, 0.004], [0.14, 0.04], [0.195, 0.12], [0.212, 0.2], [0.196, 0.28], [0.14, 0.345], [0.09, 0.37], [0.088, 0.395], [0.108, 0.415], [0.1, 0.425], [0.001, 0.4],
];
/** Shallow cooking / storage pot (handi), wider than tall. */
export const HANDI: [number, number][] = [
  [0.001, 0], [0.1, 0.005], [0.17, 0.04], [0.2, 0.1], [0.19, 0.16], [0.15, 0.2], [0.15, 0.22], [0.165, 0.235], [0.001, 0.215],
];
/** Tall storage jar (ranjan). */
export const RANJAN: [number, number][] = [
  [0.001, 0], [0.1, 0.005], [0.17, 0.08], [0.22, 0.25], [0.23, 0.38], [0.2, 0.52], [0.13, 0.6], [0.12, 0.64], [0.14, 0.66], [0.001, 0.63],
];
/** A clay diya, 0.14 m across. */
export const DIYA: [number, number][] = [[0.001, 0], [0.045, 0.005], [0.065, 0.025], [0.07, 0.04], [0.055, 0.035], [0.001, 0.02]];
/** Brass lota / kalash. */
export const LOTA: [number, number][] = [
  [0.001, 0], [0.05, 0.003], [0.085, 0.03], [0.095, 0.07], [0.08, 0.11], [0.045, 0.14], [0.04, 0.16], [0.06, 0.18], [0.001, 0.17],
];

export const CLAY = ['#9c4a2a', '#a8583a', '#8e4a2c', '#b0643f', '#94502f'] as const;

/** A clay pot with a darker waist band and a little per-pot colour variation. */
export function pot(b: Batch, profile: [number, number][], m: Matrix4, color: string, seed: number, band = true): void {
  const c = new Color(color).offsetHSL((hashf(seed, 1, 2) - 0.5) * 0.02, 0, (hashf(seed, 3, 4) - 0.5) * 0.06);
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 10);
  const top = profile.reduce((a, p) => Math.max(a, p[1]), 0);
  fill(g, c);
  shade(g, (_x, y) => (band && Math.abs(y / top - 0.62) < 0.05 ? 0.72 : 1) * (0.86 + 0.14 * Math.min(y / (top * 0.3), 1)));
  b.add('paint', g, m);
}

/** A clay diya with oil; optionally painted for the festival. Returns the flame point (local). */
export function diya(b: Batch, m: Matrix4, color = '#9c4a2a'): void {
  b.add('paint', new LatheGeometry(DIYA.map(([r, y]) => new Vector2(r, y)), 10), m, color);
}

// ---- Sacks, flowers, fruit -----------------------------------------------------------------

export const GRAIN = {
  rice: ['#e9e2cf', '#ddd3bb', '#f1ead8'],
  wheat: ['#c99a55', '#b8883f', '#d4a862'],
  toor: ['#e0b43c', '#d5a22b', '#e8c257'],
  masoor: ['#c0603a', '#b0512f', '#cd6c44'],
  moong: ['#6f8a3a', '#7d9a45', '#5f7a31'],
  jowar: ['#e5d7b0', '#d8c797', '#efe3c0'],
  sugar: ['#f4f1ea', '#e9e5dc', '#fbf9f4'],
  onion: ['#a8484a', '#b8605a', '#93403f', '#c07560'],
  potato: ['#b89468', '#a8845a', '#c4a276'],
} as const;

/**
 * An open gunny sack with its mouth rolled down and grain heaped inside (h ≈ 0.55). Jute on the
 * `fabric` material, the grain a mosaic on `paint`.
 */
export function sack(b: Batch, m: Matrix4, grain: readonly string[], seed: number, h = 0.52, r = 0.23): void {
  const jute = new Color('#b89a6c').offsetHSL(0, (hashf(seed, 2, 9) - 0.5) * 0.1, (hashf(seed, 5, 1) - 0.5) * 0.08);
  const body = latheM(
    [
      [0.001, 0], [r * 0.82, 0], [r * 0.97, 0.03], [r * 1.04, h * 0.3], [r * 1.02, h * 0.62], [r * 0.95, h * 0.8], [r * 1.02, h * 0.84], [r * 1.12, h * 0.9], [r * 1.1, h * 0.97], [r * 0.97, h], [r * 0.9, h * 0.96],
    ],
    11,
    0.9,
  );
  fill(body, jute);
  shade(body, (x, y, z) => (y < 0.06 ? 0.78 : 1) * (Math.abs(y - h * 0.9) < h * 0.07 ? 0.86 : 1) * (0.94 + hashf(x * 9, z * 9, seed) * 0.1));
  b.add('fabric', body, m);
  b.add('paint', mosaic(mound(r * 0.9, 0.09, seed, 2, 0.05).translate(0, h * 0.93, 0), grain, seed, 0.1), m);
}

/** A mound of loose marigolds — a mosaic of orange and yellow flower heads. */
export function marigoldHeap(b: Batch, m: Matrix4, r: number, h: number, seed: number, palette: readonly string[] = [TONE.marigold, TONE.marigoldYellow, '#e8841a', '#f0a62a']): void {
  b.add('paint', mosaic(mound(r, h, seed, 2, 0.16), palette, seed, 0.14), m);
}

/**
 * A string of flower beads along a polyline — the garlands on stalls, signs and awnings.
 * `every` > 0 hangs a mango leaf at every n-th bead.
 */
export function garland(b: Batch, pts: Vector3[], opts: { bead?: number; colors?: readonly string[]; every?: number; m?: Matrix4 } = {}): void {
  const bead = opts.bead ?? 0.028;
  const colors = opts.colors ?? [TONE.marigold, TONE.marigoldYellow];
  let k = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const e = pts[i + 1];
    const n = Math.max(1, Math.round(a.distanceTo(e) / (bead * 1.75)));
    for (let j = 0; j < n; j++) {
      const p = new Vector3().lerpVectors(a, e, j / n);
      const g = new IcosahedronGeometry(bead, 0).translate(p.x, p.y, p.z);
      b.add('paint', opts.m ? g.applyMatrix4(opts.m) : g, colors[k % colors.length]);
      if (opts.every && k % opts.every === 0) {
        const leaf = new CylinderGeometry(0.001, 0.022, 0.13, 3).translate(p.x, p.y - 0.08, p.z);
        b.add('paint', opts.m ? leaf.applyMatrix4(opts.m) : leaf, k % (opts.every * 2) ? TONE.mangoLeaf : '#4f7d2e');
      }
      k++;
    }
  }
}

/** A hanging garland: a straight drop of beads with a tassel of marigolds at the bottom. */
export function hangingGarland(b: Batch, top: Vector3, len: number, colors: readonly string[], seed: number): void {
  const bottom = top.clone().add(new Vector3((hashf(seed, 1, 0) - 0.5) * 0.03, -len, (hashf(seed, 0, 1) - 0.5) * 0.03));
  garland(b, [top, bottom], { bead: 0.03, colors });
  b.add('paint', new IcosahedronGeometry(0.045, 0).translate(bottom.x, bottom.y - 0.04, bottom.z), colors[0]);
}

/** A coconut: brown husked or green tender. ~0.2 m. */
export function coconut(b: Batch, m: Matrix4, green: boolean, seed: number): void {
  const g = new IcosahedronGeometry(green ? 0.12 : 0.095, 1);
  g.scale(1, green ? 1.1 : 0.9, green ? 0.95 : 0.86);
  const base = new Color(green ? '#6f8434' : '#6b4a2c').offsetHSL(0, 0, (hashf(seed, 7, 3) - 0.5) * 0.08);
  fill(g, base);
  shade(g, (x, y, z) => 0.85 + hashf(x * 40, y * 40 + seed, z * 40) * 0.25);
  b.add('paint', g, m);
}

/** A hand of bananas: a curved fan of fingers off one crown. */
export function bananaHand(b: Batch, m: Matrix4, ripe: number, seed: number): void {
  const col = new Color('#7f9a2e').lerp(new Color('#e2c04a'), ripe);
  for (let i = 0; i < 6; i++) {
    const t = (i - 2.5) / 2.5;
    const f = new IcosahedronGeometry(0.02, 1);
    f.scale(1, 1, 5.2).rotateX(-0.5 - Math.abs(t) * 0.15).rotateY(t * 0.55).translate(Math.sin(t * 0.55) * 0.07, 0.03, Math.cos(t * 0.55) * 0.07);
    fill(f, col.clone().offsetHSL(0, 0, (hashf(i, seed, 1) - 0.5) * 0.06));
    b.add('paint', f, m);
  }
  b.add('paint', new CylinderGeometry(0.015, 0.02, 0.05, 5).rotateX(Math.PI / 2).translate(0, 0.03, 0), m, '#5a5a2a');
}

/** A mango / guava / pomegranate: a slightly egg-shaped fruit. */
export function fruit(b: Batch, m: Matrix4, r: number, color: string, seed: number, stretch = 1.2): void {
  const g = new IcosahedronGeometry(r, 1);
  g.scale(1, stretch, 0.92);
  fill(g, new Color(color).offsetHSL((hashf(seed, 2, 2) - 0.5) * 0.03, 0, (hashf(seed, 1, 5) - 0.5) * 0.08));
  shade(g, (_x, y) => (y > r * 0.6 ? 0.9 : 1));
  b.add('paint', g, m);
}

/** A shallow woven basket (topli), rim radius r. Returns the height of the rim. */
export function basket(b: Batch, m: Matrix4, r: number, h: number, seed: number): number {
  const g = latheM([[0.001, 0], [r * 0.7, 0], [r * 0.72, 0.01], [r, h], [r * 1.04, h + 0.01], [r * 0.96, h], [r * 0.7, 0.03], [0.001, 0.03]], 12, 0.9);
  fill(g, new Color('#9b7a45').offsetHSL(0, 0, (hashf(seed, 3, 3) - 0.5) * 0.06));
  shade(g, (x, y, z) => 0.8 + 0.2 * Math.abs(Math.sin(Math.atan2(z, x) * 18)) * (y > 0.02 ? 1 : 0.5));
  b.add('fabric', g, m);
  return h;
}

/** A banana leaf laid flat as a bed for flowers or offerings: a long rounded blade with a midrib. */
export function leafBed(b: Batch, m: Matrix4, len: number, wid: number): void {
  const g = new CylinderGeometry(wid / 2, wid / 2, 0.006, 12, 1).scale(len / wid, 1, 1);
  b.add('paint', g, m, '#4d7a2c');
  b.add('paint', new CylinderGeometry(0.006, 0.006, len * 0.96, 4).rotateZ(Math.PI / 2).translate(0, 0.004, 0), m, '#8aa24a');
}

// ---- Cloth ---------------------------------------------------------------------------------

/**
 * A cloth sheet between four corners, sagging by `sag` in the middle (a tarp roof, a canopy).
 * Subdivided so the sag reads; double-sided through the fabric material.
 */
export function sheet(p00: Vector3, p10: Vector3, p11: Vector3, p01: Vector3, sag: number, nu = 8, nv = 6, tile = 0.9): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const at = (u: number, v: number) => {
    const a = new Vector3().lerpVectors(p00, p10, u);
    const c = new Vector3().lerpVectors(p01, p11, u);
    const p = a.lerp(c, v);
    p.y -= sag * 16 * u * (1 - u) * v * (1 - v);
    return p;
  };
  const wu = p00.distanceTo(p10) / tile;
  const wv = p00.distanceTo(p01) / tile;
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const q = [at(i / nu, j / nv), at((i + 1) / nu, j / nv), at((i + 1) / nu, (j + 1) / nv), at(i / nu, (j + 1) / nv)];
      const t = [[i / nu, j / nv], [(i + 1) / nu, j / nv], [(i + 1) / nu, (j + 1) / nv], [i / nu, (j + 1) / nv]];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        pos.push(q[k].x, q[k].y, q[k].z);
        uv.push(t[k][0] * wu, t[k][1] * wv);
      }
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A scalloped valance along a→b hanging `drop` metres: the edge of every stall canopy and awning. */
export function valance(a: Vector3, e: Vector3, drop: number, scallops: number): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const len = a.distanceTo(e);
  for (let i = 0; i < scallops; i++) {
    const n = 5;
    for (let k = 0; k < n; k++) {
      const t0 = (i + k / n) / scallops;
      const t1 = (i + (k + 1) / n) / scallops;
      const d0 = drop * (0.55 + 0.45 * Math.sin((k / n) * Math.PI));
      const d1 = drop * (0.55 + 0.45 * Math.sin(((k + 1) / n) * Math.PI));
      const p0 = new Vector3().lerpVectors(a, e, t0);
      const p1 = new Vector3().lerpVectors(a, e, t1);
      const q = [p0, p1, p1.clone().setY(p1.y - d1), p0.clone().setY(p0.y - d0)];
      const t = [[t0 * len, 0], [t1 * len, 0], [t1 * len, -d1], [t0 * len, -d0]];
      for (const j of [0, 3, 2, 0, 2, 1]) {
        pos.push(q[j].x, q[j].y, q[j].z);
        uv.push(t[j][0] / 0.9, t[j][1] / 0.9);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Deterministic hash of an id, for per-feature seeds. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Placement shorthand: translate + yaw + optional tilt about x (radians) + scale. */
export function at(x: number, y: number, z: number, rotY = 0, s: number | [number, number, number] = 1, tiltX = 0): Matrix4 {
  const m = new Matrix4().makeRotationY(rotY);
  if (tiltX) m.multiply(new Matrix4().makeRotationX(tiltX));
  const sc = Array.isArray(s) ? s : [s, s, s];
  m.scale(new Vector3(sc[0], sc[1], sc[2]));
  m.setPosition(x, y, z);
  return m;
}
