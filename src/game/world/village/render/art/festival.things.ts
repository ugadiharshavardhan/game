/**
 * Small ritual objects, shared by the pandal, the street and the offerings: clay diyas, brass
 * thalis, the kalash, the samai lamp, coconuts, woven baskets, marigold heaps, hibiscus, modak and
 * durva. Each is built at the origin (base on y = 0) and placed with a matrix into a FestBatch.
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  Vector3,
} from 'three';
import { rng } from './canvasTextures';
import type { FestBatch } from './festival.kit';
import { hashf, lathe, orient, place } from './geom';
import { TONE } from './palette';

const CLAY = '#9c4a2a';

/** A clay diya with its wick; returns where the flame sits (in the diya's frame). */
export function diya(b: FestBatch, m: Matrix4, color = CLAY, wick = false): Vector3 {
  b.add('paint', lathe([[0.001, 0], [0.05, 0.006], [0.068, 0.03], [0.07, 0.04], [0.058, 0.036], [0.001, 0.022]], 8), m, color);
  if (wick) b.add('paint', new BoxGeometry(0.03, 0.006, 0.006).translate(0.035, 0.034, 0), m, '#e8dcc0');
  return new Vector3(0.048, 0.036, 0);
}

/** A brass thali: a shallow plate with a turned rim. */
export function thali(b: FestBatch, m: Matrix4, r: number): void {
  b.add('brass', lathe([[0.001, 0], [r * 0.82, 0], [r * 0.92, 0.008], [r, 0.022], [r * 0.975, 0.026], [r * 0.9, 0.013], [r * 0.8, 0.009], [0.001, 0.009]], 16), m);
}

/** A small brass bowl (vati) holding a mound of powder. */
export function vati(b: FestBatch, m: Matrix4, powder: string, r = 0.035): void {
  b.add('brass', lathe([[0.001, 0], [r * 0.6, 0], [r, r * 0.5], [r * 1.05, r * 0.8], [r * 0.95, r * 0.8], [r * 0.85, r * 0.45], [0.001, r * 0.3]], 14), m);
  b.add('paint', lathe([[r * 0.95, r * 0.6], [r * 0.9, r * 0.72], [r * 0.5, r * 0.95], [0.001, r * 1.05]], 12), m, powder);
}

/** A heap of rice or powder: a low cone with a rounded top. */
export function heap(b: FestBatch, m: Matrix4, r: number, h: number, color: string): void {
  b.add('paint', lathe([[0.001, 0], [r, 0], [r * 0.65, h * 0.6], [r * 0.3, h * 0.93], [0.001, h]], 14), m, color);
}

/** The kalash: a brass pot of water, five mango leaves at its mouth, a coconut on top, red thread. */
export function kalash(b: FestBatch, m: Matrix4, s = 1): void {
  const k = new Matrix4().multiplyMatrices(m, new Matrix4().makeScale(s, s, s));
  b.add('brass', lathe([[0.001, 0], [0.07, 0], [0.075, 0.015], [0.06, 0.03], [0.1, 0.07], [0.13, 0.13], [0.12, 0.19], [0.075, 0.24], [0.068, 0.265], [0.09, 0.285], [0.084, 0.295], [0.062, 0.28]], 14), k);
  // Red-and-yellow thread tied three times round the neck.
  b.add('paint', lathe([[0.078, 0.232], [0.081, 0.238], [0.078, 0.245]], 16), k, TONE.vermilion);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const leaf = mangoLeaf(0.2, 0.055);
    // Stalk at the mouth, leaf leaning out and up.
    leaf.rotateX(-1.05);
    leaf.rotateY(a);
    leaf.translate(Math.sin(a) * 0.05, 0.29, Math.cos(a) * 0.05);
    b.add('paint', leaf, k, i % 2 ? TONE.mangoLeaf : '#4a7a2e');
  }
  coconut(b, new Matrix4().multiplyMatrices(k, place(0, 0.285, 0)), 'brown', true);
}

/** A mango leaf lying along +z from its stalk at the origin, gently folded at the midrib. */
export function mangoLeaf(len: number, wid: number): BufferGeometry {
  const pts: number[] = [];
  const n = 4;
  const half = (t: number) => wid * 0.5 * Math.sin(Math.PI * Math.min(t * 1.1, 1)) ** 0.8;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const z0 = t0 * len;
    const z1 = t1 * len;
    const droop = (t: number) => -0.25 * len * t * t;
    for (const s of [-1, 1]) {
      const a = [0, droop(t0), z0];
      const b0 = [s * half(t0), droop(t0) + half(t0) * 0.25, z0];
      const c = [s * half(t1), droop(t1) + half(t1) * 0.25, z1];
      const d = [0, droop(t1), z1];
      if (s > 0) pts.push(...a, ...d, ...c, ...a, ...c, ...b0);
      else pts.push(...a, ...b0, ...c, ...a, ...c, ...d);
    }
  }
  return twoSided(pts);
}

/**
 * A coconut. 'brown': husked, with the fibre tuft left on top the way it is offered; 'green': a
 * tender coconut with its calyx. Base on y = 0.
 */
export function coconut(b: FestBatch, m: Matrix4, kind: 'brown' | 'green' = 'brown', upright = false, seed = 1): void {
  const r = rng(seed * 13 + 3);
  if (kind === 'brown') {
    const g = new IcosahedronGeometry(0.068, 1);
    g.scale(1, upright ? 1.2 : 1.12, 1);
    g.translate(0, 0.075, 0);
    speckle(g, '#7a4c28', 0.18, seed);
    const tuft = new ConeGeometry(0.03, 0.055, 6);
    tuft.translate(0, 0.165, 0);
    const lay = upright ? new Matrix4() : new Matrix4().makeRotationZ(1.35 + r() * 0.3).setPosition(0, -0.005, 0);
    const mm = new Matrix4().multiplyMatrices(m, lay);
    b.add('paint', g, mm);
    b.add('paint', tuft, mm, '#5c3a1e');
  } else {
    const g = new IcosahedronGeometry(0.1, 1);
    g.scale(1, 1.12, 0.95);
    g.translate(0, 0.1, 0);
    speckle(g, '#6f8a2c', 0.12, seed);
    const cap = lathe([[0.038, 0.19], [0.042, 0.2], [0.03, 0.212], [0.001, 0.215]], 8);
    const lay = upright ? new Matrix4() : new Matrix4().makeRotationZ(1.4 + r() * 0.25).setPosition(0, 0.01, 0);
    const mm = new Matrix4().multiplyMatrices(m, lay);
    b.add('paint', g, mm);
    b.add('paint', cap, mm, '#7a6a3a');
  }
}

/** Vertex colour with blotchy variation — husk, clay, stone. */
export function speckle(g: BufferGeometry, color: string, amount: number, seed: number): void {
  const c = new Color(color);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - amount + hashf(pos.getX(i) * 40 + seed, pos.getY(i) * 40, pos.getZ(i) * 40) * amount * 2;
    col.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
}

/**
 * A woven bamboo basket (topli): tapered, with a rolled rim; the weave is painted into the vertex
 * colours. Base on y = 0; `r` is the rim radius.
 */
export function basket(b: FestBatch, m: Matrix4, r: number, h: number, seed = 1): void {
  const rows = Math.max(3, Math.round(h / 0.03));
  const prof: [number, number][] = [[0.001, 0.004]];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    prof.push([r * (0.72 + 0.28 * t ** 0.8), h * t]);
  }
  prof.push([r * 1.05, h + 0.01], [r * 1.07, h + 0.022], [r * 0.97, h + 0.012]);
  for (let i = rows; i >= 0; i--) {
    const t = i / rows;
    prof.push([r * (0.72 + 0.28 * t ** 0.8) - 0.01, Math.max(h * t, 0.012)]);
  }
  prof.push([0.001, 0.012]);
  const g = lathe(prof, 16);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const light = new Color('#bb9157');
  const dark = new Color('#86653a');
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const weave = Math.sin(a * 16) * Math.sin(y * 105 + seed);
    c.copy(light).lerp(dark, 0.5 + 0.5 * weave).multiplyScalar(0.92 + hashf(x * 9, y * 9, z * 9 + seed) * 0.16);
    if (y > h) c.copy(dark).multiplyScalar(0.9);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  b.add('paint', g, m);
}

/** A domed heap of flower heads (marigold, rose) on whatever surface the matrix puts it on. */
export function flowerHeap(b: FestBatch, m: Matrix4, r: number, h: number, count: number, palette: string[], seed = 1, size = 0.034): void {
  const rr = rng(seed * 17 + 1);
  for (let i = 0; i < count; i++) {
    const a = rr() * Math.PI * 2;
    const d = Math.sqrt(rr()) * r;
    const y = h * (1 - (d / r) ** 2) * (0.75 + rr() * 0.25) + size * 0.6;
    const s = size * (0.85 + rr() * 0.3);
    const g = new IcosahedronGeometry(s, 0);
    g.rotateY(rr() * 3);
    g.scale(1, 0.85, 1);
    g.translate(Math.cos(a) * d, y, Math.sin(a) * d);
    b.add('paint', g, m, palette[Math.floor(rr() * palette.length)]);
  }
}

export const MARIGOLDS = ['#ee8f1a', '#f09a1c', '#e27514', '#f5c233', '#ef9a1a'];

/** A red hibiscus (jaswand) — Ganesha's flower — open face up, its staminal column standing out. */
export function hibiscus(b: FestBatch, m: Matrix4, s = 1): void {
  const sm = new Matrix4().multiplyMatrices(m, new Matrix4().makeScale(s, s, s));
  // The cup, inside and out: five lobed petals.
  const cup: [number, number][] = [[0.004, 0], [0.02, 0.012], [0.042, 0.024], [0.056, 0.03]];
  for (const prof of [cup, [...cup].reverse()]) {
    const petals = lathe(prof, 10);
    const pos = petals.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const k = 0.72 + 0.28 * Math.abs(Math.cos(a * 2.5));
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    petals.computeVertexNormals();
    b.add('paint', petals, sm, prof === cup ? '#9c1018' : '#c0141e');
  }
  b.add('paint', new CylinderGeometry(0.0025, 0.0025, 0.05, 3, 1, true).rotateZ(0.5).translate(0.012, 0.03, 0), sm, '#d8323a');
  b.add('paint', new BoxGeometry(0.01, 0.01, 0.01).translate(0.024, 0.052, 0), sm, TONE.marigoldYellow);
}

/**
 * An ukadiche modak: steamed rice-flour dumpling, pleated to a point. Base on y = 0.
 * The pleats are ridges pinched into a lathe, converging at the tip.
 */
export function modak(b: FestBatch, m: Matrix4, s = 1): void {
  const g = lathe([[0.001, 0], [0.028, 0.003], [0.035, 0.016], [0.029, 0.034], [0.015, 0.053], [0.001, 0.07]], 12);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.14 * Math.max(0, Math.cos(a * 6)) * Math.min(y / 0.03, 1);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  g.computeVertexNormals();
  b.add('paint', g, new Matrix4().multiplyMatrices(m, new Matrix4().makeScale(s, s, s)), '#efe5cf');
}

/**
 * A bundle of durva grass tied with red thread — offered in odd counts, 21 blades a bundle. Lies
 * along +x from its cut ends at the origin.
 */
export function durva(b: FestBatch, m: Matrix4, seed = 1, blades = 21): void {
  const r = rng(seed * 7 + 5);
  const tie = 0.05;
  for (let i = 0; i < blades; i++) {
    const len = 0.11 + r() * 0.07;
    const spread = (r() - 0.5) * 0.5;
    const lift = r() * 0.012;
    const w = 0.0035;
    const pts: number[] = [];
    const seg = 3;
    const z0 = (r() - 0.5) * 0.01;
    const at = (t: number) => {
      const x = t * len;
      // Bundled tight at the tie, fanning out beyond it and settling onto the surface.
      const fan = Math.max(0, x - tie) * spread;
      return [x, 0.004 + lift * Math.max(0.3, 1 - Math.max(0, x - tie) * 8), z0 * Math.min(1, x / tie) * 0.4 + fan];
    };
    for (let k = 0; k < seg; k++) {
      const [x0, y0, z0] = at(k / seg);
      const [x1, y1, z1] = at((k + 1) / seg);
      const w0 = w * (1 - (k / seg) * 0.8);
      const w1 = w * (1 - ((k + 1) / seg) * 0.8);
      pts.push(x0, y0, z0 - w0, x1, y1, z1 - w1, x1, y1, z1 + w1, x0, y0, z0 - w0, x1, y1, z1 + w1, x0, y0, z0 + w0);
    }
    const g = twoSided(pts);
    const c = new Color(i % 3 ? '#4e8a2c' : '#6c9c38').offsetHSL(0, 0, (r() - 0.5) * 0.08);
    b.add('paint', g, m, c);
  }
  // The red thread, wound round the bundle.
  b.add('paint', orient(new CylinderGeometry(0.009, 0.009, 0.012, 8, 1, true), new Vector3(tie - 0.006, 0.013, 0), new Vector3(tie + 0.006, 0.013, 0)), m, TONE.vermilion);
}

/** Thin geometry seen from both sides with a front-side material: each triangle twice, flipped. */
export function twoSided(pts: number[]): BufferGeometry {
  const out = pts.slice();
  for (let i = 0; i < pts.length; i += 9) out.push(...pts.slice(i, i + 3), ...pts.slice(i + 6, i + 9), ...pts.slice(i + 3, i + 6));
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * A brass samai: the tall standing oil lamp of a Maharashtrian puja — domed foot, turned stem, a
 * five-wick oil pan, a finial above. Returns the wick positions (in the lamp's frame).
 */
export function samai(b: FestBatch, m: Matrix4, h = 1): Vector3[] {
  const s = h;
  const prof: [number, number][] = [
    [0.001, 0], [0.14, 0], [0.145, 0.014], [0.125, 0.03], [0.08, 0.055], [0.045, 0.09], [0.03, 0.13],
    [0.03, 0.24], [0.052, 0.265], [0.032, 0.29], [0.026, 0.44], [0.046, 0.465], [0.026, 0.49], [0.022, 0.6],
    // The oil pan: underside out to the rim, over it, and back across the floor to the stem.
    [0.05, 0.615], [0.125, 0.635], [0.142, 0.662], [0.128, 0.668], [0.05, 0.648],
    [0.018, 0.66], [0.018, 0.84], [0.036, 0.862], [0.02, 0.885], [0.016, 0.94],
    // Finial: a lotus bud.
    [0.032, 0.965], [0.036, 0.995], [0.022, 1.03], [0.001, 1.07],
  ];
  b.add('brass', lathe(prof.map(([r, y]) => [r * s, y * s]), 12), m);
  const wicks: Vector3[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.2;
    const p = new Vector3(Math.cos(a) * 0.118 * s, 0.664 * s, Math.sin(a) * 0.118 * s);
    // A little pinched spout for each wick.
    b.add('brass', new ConeGeometry(0.018 * s, 0.05 * s, 6).rotateZ(Math.PI / 2).rotateY(-a).translate(p.x * 1.08, p.y - 0.006 * s, p.z * 1.08), m);
    b.add('paint', new BoxGeometry(0.02 * s, 0.005, 0.005).rotateY(-a).translate(p.x, p.y + 0.004, p.z), m, '#e8dcc0');
    wicks.push(new Vector3(p.x * 1.12, p.y + 0.004, p.z * 1.12));
  }
  return wicks;
}
