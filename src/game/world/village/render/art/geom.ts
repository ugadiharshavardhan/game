/**
 * Geometry building blocks for the art pass: a merging batch, metre-scaled UVs, vertex weathering,
 * roofs, turned wood and catenaries. Everything is built in a building's local frame, then merged.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type MaterialKit, type MatKey, TILE } from './materials';

// ---- Batch ------------------------------------------------------------------------------------

const KEEP = ['position', 'normal', 'uv', 'color'];

/**
 * Material substitutions for a batch: `key → [into, colour]`. Small metal fittings (grilles, bosses,
 * lamp frames) read just as well as painted colour, and every material a batch drops is a draw call
 * (and a shadow draw) saved.
 */
export type Remap = Partial<Record<MatKey, [MatKey, string]>>;

/**
 * Collects geometry per material and merges it: a whole house becomes one mesh per material.
 * Every geometry gets the same attribute set (position, normal, uv, colour) so they merge cleanly.
 */
export class Batch {
  private readonly parts = new Map<MatKey, BufferGeometry[]>();
  private readonly remap: Remap;

  constructor(opts: { remap?: Remap } = {}) {
    this.remap = opts.remap ?? {};
  }

  /**
   * Takes ownership of `geo`. The third argument is either a placement matrix or a fill colour
   * (used when the geometry has no vertex colours yet); pass both as (matrix, colour).
   */
  add(key: MatKey, geo: BufferGeometry, placeOrColor?: Matrix4 | Color | string, color?: Color | string): this {
    const m = placeOrColor instanceof Matrix4 ? placeOrColor : undefined;
    if (!(placeOrColor instanceof Matrix4) && placeOrColor !== undefined) color = placeOrColor;
    const swap = this.remap[key];
    if (swap) {
      if (color === undefined && !geo.getAttribute('color')) color = swap[1];
      key = swap[0];
    }
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (m) g.applyMatrix4(m);
    for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
    const n = g.getAttribute('position').count;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.getAttribute('color')) g = fill(g, color ?? '#ffffff');
    const list = this.parts.get(key) ?? [];
    list.push(g);
    this.parts.set(key, list);
    return this;
  }

  get empty(): boolean {
    return this.parts.size === 0;
  }

  /** Merge into one Mesh per material. */
  build(kit: MaterialKit, opts: { cast?: boolean; receive?: boolean; name?: string; noShadow?: MatKey[] } = {}): Group {
    const group = new Group();
    group.name = opts.name ?? 'batch';
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, kit.get(key));
      mesh.name = `${group.name}:${key}`;
      const shadowless = opts.noShadow?.includes(key) || key === 'flame' || key === 'glow' || key === 'interior' || key === 'lamplit';
      mesh.castShadow = (opts.cast ?? true) && !shadowless;
      mesh.receiveShadow = (opts.receive ?? true) && key !== 'flame' && key !== 'glow';
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

/** Solid vertex colour for the whole geometry. */
export function fill(g: BufferGeometry, color: Color | string): BufferGeometry {
  const c = color instanceof Color ? color : new Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

/**
 * Paint plus grime: base colour, darkened toward the ground (monsoon splash) and under the eaves,
 * with a little per-vertex variation so no wall is a flat swatch. Heights are in the geometry's frame.
 */
export function weather(g: BufferGeometry, color: Color | string, o: { ground?: number; splash?: number; strength?: number; top?: number; topStrength?: number; seed?: number } = {}): BufferGeometry {
  const c = color instanceof Color ? color : new Color(color);
  const pos = g.getAttribute('position');
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const ground = o.ground ?? 0;
  const splash = o.splash ?? 0.9;
  const strength = o.strength ?? 0.32;
  const top = o.top ?? Infinity;
  const topStrength = o.topStrength ?? 0.18;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const low = 1 - smooth((y - ground) / splash);
    const high = smooth((y - (top - 0.6)) / 0.6);
    const noise = 1 + (hashf(x * 3.1 + (o.seed ?? 0), y * 2.3, z * 3.7) - 0.5) * 0.08;
    const k = (1 - strength * low) * (1 - topStrength * high) * noise;
    col.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

const smooth = (t: number) => {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
};

export function hashf(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---- UVs --------------------------------------------------------------------------------------

/**
 * Box-projected UVs in metres ÷ tile, from each face's dominant normal axis. Consistent texel
 * density everywhere, and seamless across parts merged in the same frame.
 */
export function boxUV(g: BufferGeometry, key: MatKey | number): BufferGeometry {
  const tile = typeof key === 'number' ? key : (TILE[key] ?? 1);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) [u, v] = [x, z];
    else if (ax >= az) [u, v] = [z * Math.sign(nor.getX(i) || 1), y];
    else [u, v] = [-x * Math.sign(nor.getZ(i) || 1), y];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  return g;
}

/** A box already positioned (centre) and box-UV'd for a material. */
export function box(key: MatKey, sx: number, sy: number, sz: number, cx: number, cy: number, cz: number, rotY = 0): BufferGeometry {
  const g = new BoxGeometry(sx, sy, sz);
  if (rotY) g.rotateY(rotY);
  g.translate(cx, cy, cz);
  return boxUV(g, key);
}

/** A box with extra height segments, so vertex weathering has vertices to work with. */
export function slab(key: MatKey, sx: number, sy: number, sz: number, cx: number, cy: number, cz: number, hSeg = 4): BufferGeometry {
  const g = new BoxGeometry(sx, sy, sz, Math.max(1, Math.round(sx)), hSeg, Math.max(1, Math.round(sz)));
  g.translate(cx, cy, cz);
  return boxUV(g, key);
}

// ---- Quads and roofs ---------------------------------------------------------------------------

/**
 * A quad from four corners (counter-clockwise seen from the front), with UVs laid out in metres:
 * u along a→b, v along a→d. Optional thickness extrudes it backwards along its normal.
 */
export function quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, tile = 1): BufferGeometry {
  const g = new BufferGeometry();
  const ab = a.distanceTo(b) / tile;
  const ad = a.distanceTo(d) / tile;
  const dc = d.distanceTo(c) / tile;
  const pos = [a, b, c, a, c, d].flatMap((p) => [p.x, p.y, p.z]);
  // For trapezoids, keep u proportional along each edge.
  const uv = [0, 0, ab, 0, dc + (ab - dc) / 2, ad, 0, 0, dc + (ab - dc) / 2, ad, (ab - dc) / 2, ad];
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function tri(a: Vector3, b: Vector3, c: Vector3, tile = 1): BufferGeometry {
  const g = new BufferGeometry();
  const ab = a.distanceTo(b) / tile;
  const h = new Vector3().subVectors(c, a).cross(new Vector3().subVectors(b, a).normalize()).length() / tile;
  g.setAttribute('position', new Float32BufferAttribute([a, b, c].flatMap((p) => [p.x, p.y, p.z]), 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, ab, 0, ab / 2, h], 2));
  g.computeVertexNormals();
  return g;
}

/** Same surface, facing the other way (roof soffits, cloth). */
export function flipped(g: BufferGeometry): BufferGeometry {
  const f = g.clone();
  const pos = f.getAttribute('position');
  const uv = f.getAttribute('uv');
  for (let i = 0; i < pos.count; i += 3) {
    for (const attr of [pos, uv]) {
      if (!attr) continue;
      const size = attr.itemSize;
      const arr = attr.array as Float32Array;
      for (let k = 0; k < size; k++) {
        const t = arr[(i + 1) * size + k];
        arr[(i + 1) * size + k] = arr[(i + 2) * size + k];
        arr[(i + 2) * size + k] = t;
      }
    }
  }
  f.computeVertexNormals();
  return f;
}

export interface RoofParts {
  /** Tiled slopes (tile material). */
  tiles: BufferGeometry[];
  /** Undersides of the overhang (wood). */
  soffits: BufferGeometry[];
  /** Triangular wall infill at gable ends (plaster). */
  gables: BufferGeometry[];
  /** Ridge and hip caps (terracotta, drawn with the tiles). */
  caps: BufferGeometry[];
  /** Fascia boards along the eaves (wood). */
  fascia: BufferGeometry[];
}

/**
 * A pitched clay-tile roof over a hw × hd rectangle (half-extents) whose walls top out at `eave`.
 * The slope continues past the walls by `over`. 'gable' ridges along x; 'hip' slopes on all four
 * sides. Tile rows run down the slope.
 */
export function pitchedRoof(style: 'gable' | 'hip', hw: number, hd: number, eave: number, rise: number, over: number, tile: number): RoofParts {
  const pitch = rise / hd;
  const drop = over * pitch;
  const ex = hw + (style === 'gable' ? over * 0.7 : over);
  const ez = hd + over;
  const ey = eave - drop;
  const ry = eave + rise;
  const ridge = style === 'gable' ? ex : Math.max(hw - hd, 0.05);
  const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const t = 0.08; // tile thickness
  const out: RoofParts = { tiles: [], soffits: [], gables: [], caps: [], fascia: [] };

  // Front (+z) and back (−z) slopes.
  const front = quad(P(-ex, ey, ez), P(ex, ey, ez), P(ridge, ry, 0), P(-ridge, ry, 0), tile);
  const back = quad(P(ex, ey, -ez), P(-ex, ey, -ez), P(-ridge, ry, 0), P(ridge, ry, 0), tile);
  out.tiles.push(front, back);
  out.soffits.push(flipped(front).translate(0, -t, 0), flipped(back).translate(0, -t, 0));

  if (style === 'hip') {
    const right = tri(P(ex, ey, ez), P(ex, ey, -ez), P(ridge, ry, 0), tile);
    const left = tri(P(-ex, ey, -ez), P(-ex, ey, ez), P(-ridge, ry, 0), tile);
    out.tiles.push(right, left);
    out.soffits.push(flipped(right).translate(0, -t, 0), flipped(left).translate(0, -t, 0));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      out.caps.push(cap(P(sx * ex, ey + t, sz * ez), P(sx * ridge, ry + t, 0), 0.07));
    }
  } else {
    // Gable-end infill: the wall rises to meet the ridge.
    for (const s of [1, -1]) {
      out.gables.push(s > 0 ? tri(P(hw, eave, hd), P(hw, eave, -hd), P(hw, ry, 0), 2.2) : tri(P(-hw, eave, -hd), P(-hw, eave, hd), P(-hw, ry, 0), 2.2));
      // Barge boards along the sloped edges.
      for (const sz of [1, -1]) out.fascia.push(beam(P(s * ex, ey, sz * ez), P(s * ex, ry, 0), 0.05, 0.16));
    }
  }
  out.caps.push(cap(P(-ridge - (style === 'gable' ? 0.05 : 0), ry + t, 0), P(ridge + (style === 'gable' ? 0.05 : 0), ry + t, 0), 0.09));
  // Fascia along the eaves.
  out.fascia.push(beam(P(-ex, ey - 0.05, ez), P(ex, ey - 0.05, ez), 0.04, 0.14), beam(P(ex, ey - 0.05, -ez), P(-ex, ey - 0.05, -ez), 0.04, 0.14));
  return out;
}

/** A lean-to (veranda) roof from a high edge at the wall down to a low edge at the posts. */
export function leanTo(x0: number, x1: number, zHigh: number, yHigh: number, zLow: number, yLow: number, tile: number): { top: BufferGeometry; under: BufferGeometry } {
  const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const top = quad(P(x0, yLow, zLow), P(x1, yLow, zLow), P(x1, yHigh, zHigh), P(x0, yHigh, zHigh), tile);
  return { top, under: flipped(top).translate(0, -0.07, 0) };
}

/** A half-round clay cap along a ridge or hip. */
export function cap(a: Vector3, b: Vector3, radius: number): BufferGeometry {
  const len = a.distanceTo(b);
  const g = new CylinderGeometry(radius, radius, len, 8, Math.max(1, Math.round(len / 0.4)), true, 0, Math.PI);
  g.rotateY(Math.PI / 2);
  return orient(g, a, b);
}

/** A rectangular timber from a to b. */
export function beam(a: Vector3, b: Vector3, w: number, h: number): BufferGeometry {
  const len = a.distanceTo(b);
  const g = boxUV(new BoxGeometry(w, len, h), 'wood');
  return orient(g, a, b);
}

/** Aligns a y-axis geometry centred at the origin to run from a to b. */
export function orient(g: BufferGeometry, a: Vector3, b: Vector3): BufferGeometry {
  const dir = new Vector3().subVectors(b, a);
  const len = dir.length();
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.divideScalar(len || 1));
  return g.applyMatrix4(new Matrix4().compose(new Vector3().addVectors(a, b).multiplyScalar(0.5), q, new Vector3(1, 1, 1)));
}

// ---- Turned and round things -----------------------------------------------------------------

/** A lathe from a [radius, height] profile. */
export function lathe(profile: [number, number][], segments = 12): BufferGeometry {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);
}

/** A turned wooden veranda post with square base and capital, `h` tall, standing at the origin. */
export function turnedPost(h: number, r = 0.08): BufferGeometry[] {
  const base = box('teak', r * 2.6, 0.22, r * 2.6, 0, 0.11, 0);
  const capital = box('teak', r * 2.8, 0.14, r * 2.8, 0, h - 0.07, 0);
  const s = h - 0.36;
  const shaft = lathe([
    [r * 1.05, 0.22], [r * 1.25, 0.28], [r * 0.95, 0.34], [r, 0.22 + s * 0.2], [r * 1.2, 0.22 + s * 0.24], [r * 0.9, 0.22 + s * 0.28],
    [r * 0.95, 0.22 + s * 0.7], [r * 1.2, 0.22 + s * 0.75], [r * 0.9, 0.22 + s * 0.8], [r * 1.1, h - 0.16], [r * 1.25, h - 0.14],
  ], 10);
  boxUV(shaft, 'teak');
  return [base, shaft, capital];
}

/** Points along a hanging rope between a and b (sag metres at the middle). */
export function catenary(a: Vector3, b: Vector3, sag: number, n: number): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    out.push(p);
  }
  return out;
}

/** Matrix for placing a part: position, yaw, uniform or xyz scale. */
export function place(x: number, y: number, z: number, rotY = 0, s: number | [number, number, number] = 1): Matrix4 {
  const sc = Array.isArray(s) ? new Vector3(...s) : new Vector3(s, s, s);
  return new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rotY), sc);
}
