/**
 * Everything that grows below the trees: the grass that follows the camera, shrubs, weeds and
 * wildflowers, the three fields, the tulsi garden's beds, the leafy hedges, and the tree clumps on
 * the hills beyond the village edge.
 *
 * Placement reads the ground's own surface weights (no grass on roads, soil or paving) and a
 * rasterised map of every collider (no grass through a plinth, no leaves through a roof).
 */
import { BoxGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, type Material, Sphere, Vector3 } from 'three';
import type { Level, Solid } from '../../solids';
import type { FenceDef, P2, VillageLayout } from '../../types';
import { LEAF_QUAD, rng } from './canvasTextures';
import type { Ground } from './ground';
import { type CardSet, type Cell, crossedQuads, type Merger, quadCell, tint } from './trees.gpu';
import { type Plant, VEG } from './trees.paint';
import { hashf } from './geom';
import { blade, crown, dirFrom, type Rnd, taper, tube, UP } from './trees.shape';

const TAU = Math.PI * 2;

// ---- Site: what stands where -------------------------------------------------------------------

/**
 * The colliders rasterised onto a half-metre grid: which cells are taken at ground level (grown by
 * a margin) and how high the tallest thing over each cell reaches.
 */
export class Site {
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  readonly cell = 0.5;
  private readonly foot: Uint8Array;
  private readonly top: Float32Array;

  constructor(level: Level, layout: VillageLayout, pad = 0.3) {
    const b = layout.bounds;
    this.x0 = b.minX - 12;
    this.z0 = b.minZ - 12;
    this.nx = Math.ceil((b.maxX - b.minX + 24) / this.cell);
    this.nz = Math.ceil((b.maxZ - b.minZ + 24) / this.cell);
    this.foot = new Uint8Array(this.nx * this.nz);
    this.top = new Float32Array(this.nx * this.nz);
    for (const s of level.solids) {
      if (s.tag.startsWith('edge')) continue;
      const tree = s.tag.startsWith('tree:');
      const low = bottomOf(s) < 0.4;
      this.raster(s, pad, (i) => {
        if (low) this.foot[i] = 1;
        if (!tree) this.top[i] = Math.max(this.top[i], topOf(s));
      });
    }
  }

  private index(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.cell);
    const j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  /** Something stands on the ground here (within the margin). */
  blocked(x: number, z: number): boolean {
    const i = this.index(x, z);
    return i >= 0 && this.foot[i] === 1;
  }

  /** Top of the highest building, wall or roof over this point (0 if open sky). */
  topAt(x: number, z: number): number {
    const i = this.index(x, z);
    return i >= 0 ? this.top[i] : 0;
  }

  /** May a leaf card of this size sit at p without poking into a building? */
  clearFor(p: Vector3, size: number): boolean {
    const h = size * 0.35;
    for (const [dx, dz] of [[0, 0], [h, 0], [-h, 0], [0, h], [0, -h]]) {
      const t = this.topAt(p.x + dx, p.z + dz);
      if (t > 0 && p.y - h < t + 0.35) return false;
    }
    return true;
  }

  private raster(s: Solid, pad: number, mark: (i: number) => void): void {
    let inside: (x: number, z: number) => boolean;
    let minX: number;
    let maxX: number;
    let minZ: number;
    let maxZ: number;
    if (s.kind === 'box') {
      const c = Math.cos(s.rot);
      const sn = Math.sin(s.rot);
      const hx = s.sx / 2 + pad;
      const hz = s.sz / 2 + pad;
      const ex = Math.abs(hx * c) + Math.abs(hz * sn);
      const ez = Math.abs(hx * sn) + Math.abs(hz * c);
      [minX, maxX, minZ, maxZ] = [s.x - ex, s.x + ex, s.z - ez, s.z + ez];
      inside = (x, z) => {
        const dx = x - s.x;
        const dz = z - s.z;
        return Math.abs(dx * c - dz * sn) <= hx && Math.abs(dx * sn + dz * c) <= hz;
      };
    } else if (s.kind === 'cyl') {
      const rr = s.r + pad;
      [minX, maxX, minZ, maxZ] = [s.x - rr, s.x + rr, s.z - rr, s.z + rr];
      inside = (x, z) => (x - s.x) ** 2 + (z - s.z) ** 2 <= rr * rr;
    } else {
      const hull = convexHull(s.points.map((p) => ({ x: p.x, z: p.z })));
      minX = Math.min(...hull.map((p) => p.x)) - pad;
      maxX = Math.max(...hull.map((p) => p.x)) + pad;
      minZ = Math.min(...hull.map((p) => p.z)) - pad;
      maxZ = Math.max(...hull.map((p) => p.z)) + pad;
      inside = (x, z) => insideHull(hull, x, z, pad);
    }
    for (let z = Math.floor((minZ - this.z0) / this.cell); z <= Math.ceil((maxZ - this.z0) / this.cell); z++) {
      for (let x = Math.floor((minX - this.x0) / this.cell); x <= Math.ceil((maxX - this.x0) / this.cell); x++) {
        if (x < 0 || z < 0 || x >= this.nx || z >= this.nz) continue;
        if (inside(this.x0 + (x + 0.5) * this.cell, this.z0 + (z + 0.5) * this.cell)) mark(z * this.nx + x);
      }
    }
  }
}

const bottomOf = (s: Solid) => (s.kind === 'box' ? s.y - s.sy / 2 : s.kind === 'cyl' ? s.y : Math.min(...s.points.map((p) => p.y)));
const topOf = (s: Solid) => (s.kind === 'box' ? s.y + s.sy / 2 : s.kind === 'cyl' ? s.y + s.h : Math.max(...s.points.map((p) => p.y)));

function convexHull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower: P2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: P2[] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Inside a counter-clockwise convex hull, grown by `pad`. */
function insideHull(h: P2[], x: number, z: number, pad: number): boolean {
  for (let i = 0; i < h.length; i++) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const l = Math.hypot(ex, ez) || 1;
    if ((ex * (z - a.z) - ez * (x - a.x)) / l < -pad) return false;
  }
  return true;
}

// ---- Terrain helpers ------------------------------------------------------------------------------

/** Height of the ground mesh itself (its triangles, not the smooth function), 0 without ground. */
export function groundHeight(ground: Ground | null): (x: number, z: number) => number {
  if (!ground) return () => 0;
  const geo = ground.mesh.geometry;
  const prm = (geo as unknown as { parameters: { width: number; height: number; widthSegments: number; heightSegments: number } }).parameters;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return ground.heightAt;
  const cols = prm.widthSegments + 1;
  const dx = prm.width / prm.widthSegments;
  const dz = prm.height / prm.heightSegments;
  const pos = geo.getAttribute('position');
  const y = (i: number, j: number) => pos.getY(Math.min(Math.max(j, 0), prm.heightSegments) * cols + Math.min(Math.max(i, 0), prm.widthSegments));
  return (x, z) => {
    const fx = (x - bb.min.x) / dx;
    const fz = (z - bb.min.z) / dz;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    // PlaneGeometry splits each cell along the (i, j+1)–(i+1, j) diagonal.
    if (u + v <= 1) return y(i, j) + u * (y(i + 1, j) - y(i, j)) + v * (y(i, j + 1) - y(i, j));
    return y(i + 1, j + 1) + (1 - u) * (y(i, j + 1) - y(i + 1, j + 1)) + (1 - v) * (y(i + 1, j) - y(i + 1, j + 1));
  };
}

/** Smooth value noise in 0..1. */
export function noise2(seed: number): (x: number, z: number) => number {
  const h = (i: number, j: number) => hashf(i, j, seed);
  return (x, z) => {
    const i = Math.floor(x);
    const j = Math.floor(z);
    const fx = x - i;
    const fz = z - j;
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// ---- Grass ------------------------------------------------------------------------------------------

/** Where grass grows, 0..1: never on roads, soil, paving or anything built. */
export function grassiness(site: Site, ground: Ground | null, patches: (x: number, z: number) => number): (x: number, z: number) => number {
  return (x, z) => {
    if (site.blocked(x, z)) return 0;
    const s = ground ? ground.surfaceAt(x, z) : { road: 0, soil: 0, paving: 0, lush: 0 };
    const bare = Math.max(s.road / 0.1, s.soil / 0.35, s.paving / 0.08);
    if (bare >= 1) return 0;
    return Math.min(1, (0.22 + 0.62 * patches(x * 0.09, z * 0.09) ** 1.5 + 0.7 * s.lush) * (1 - bare) ** 1.5);
  };
}

/**
 * Grass tufts in a ring around the camera — one instanced draw, no shadows. Every tuft in the
 * village is generated up front, sorted into 8 m cells; as the camera moves, the cells within
 * reach are copied into the instance buffer, and the shader sinks tufts into the ground toward the
 * ring's edge so it never shows.
 */
export class Meadow {
  readonly mesh: InstancedMesh;
  private readonly mats: Float32Array;
  private readonly cols: Float32Array;
  private readonly cells: { x: number; z: number; start: number; count: number }[] = [];
  private readonly last = new Vector3(Infinity, 0, Infinity);
  private readonly reach: number;

  constructor(tufts: { x: number; y: number; z: number; w: number; h: number; yaw: number; c: Color }[], material: Material, reach: number) {
    this.reach = reach;
    const size = 8;
    const buckets = new Map<string, typeof tufts>();
    for (const t of tufts) {
      const key = `${Math.floor(t.x / size)},${Math.floor(t.z / size)}`;
      const list = buckets.get(key) ?? [];
      list.push(t);
      buckets.set(key, list);
    }
    this.mats = new Float32Array(tufts.length * 16);
    this.cols = new Float32Array(tufts.length * 3);
    let n = 0;
    for (const [key, list] of buckets) {
      const [cx, cz] = key.split(',').map(Number);
      this.cells.push({ x: (cx + 0.5) * size, z: (cz + 0.5) * size, start: n, count: list.length });
      for (const t of list) {
        const c = Math.cos(t.yaw);
        const s = Math.sin(t.yaw);
        // Unit quad centred on the origin: lift by half its height so it stands on the ground.
        this.mats.set([c * t.w, 0, -s * t.w, 0, 0, t.h, 0, 0, s, 0, c, 0, t.x, t.y + t.h / 2 - 0.03, t.z, 1], n * 16);
        this.cols.set([t.c.r, t.c.g, t.c.b], n * 3);
        n++;
      }
    }
    const capacity = Math.min(tufts.length, 30000);
    this.mesh = new InstancedMesh(crossedQuads(), material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.name = 'trees:grass';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.boundingSphere = new Sphere(new Vector3(), reach);
  }

  update(cam: Vector3): void {
    if ((cam.x - this.last.x) ** 2 + (cam.z - this.last.z) ** 2 < 2.5 * 2.5) return;
    this.last.copy(cam);
    const r = this.reach + 6;
    const near = this.cells.filter((c) => (c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 < r * r).sort((a, b) => (a.x - cam.x) ** 2 + (a.z - cam.z) ** 2 - ((b.x - cam.x) ** 2 + (b.z - cam.z) ** 2));
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const col = (this.mesh.instanceColor as InstancedBufferAttribute).array as Float32Array;
    const cap = this.mesh.instanceMatrix.count;
    let n = 0;
    for (const c of near) {
      const k = Math.min(c.count, cap - n);
      if (k <= 0) break;
      m.set(this.mats.subarray(c.start * 16, (c.start + k) * 16), n * 16);
      col.set(this.cols.subarray(c.start * 3, (c.start + k) * 3), n * 3);
      n += k;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    (this.mesh.instanceColor as InstancedBufferAttribute).needsUpdate = true;
    (this.mesh.boundingSphere as Sphere).center.set(cam.x, 0, cam.z);
  }
}

/** Scatter every grass tuft in the village. */
export function sowGrass(layout: VillageLayout, grass: (x: number, z: number) => number, lush: (x: number, z: number) => number, seed: number) {
  const r = rng(seed);
  const b = layout.bounds;
  const step = 0.42;
  const out: { x: number; y: number; z: number; w: number; h: number; yaw: number; c: Color }[] = [];
  const dry = new Color(1.05, 0.95, 0.62);
  const wet = new Color(0.78, 1.0, 0.62);
  for (let z = b.minZ; z < b.maxZ; z += step) {
    for (let x = b.minX; x < b.maxX; x += step) {
      const px = x + r() * step;
      const pz = z + r() * step;
      const d = grass(px, pz);
      if (d <= 0 || r() > d * 0.85) continue;
      const l = lush(px, pz);
      const tall = 0.6 + 0.8 * d + 0.3 * l;
      const c = dry.clone().lerp(wet, Math.min(1, 0.25 + 0.5 * l + 0.3 * d)).multiplyScalar(0.8 + 0.3 * r());
      out.push({ x: px, y: 0, z: pz, w: (0.34 + 0.3 * r()) * tall, h: (0.22 + 0.22 * r()) * tall, yaw: r() * TAU, c });
    }
  }
  return out;
}

// ---- Rooted plants (crops, flowers, weeds) -------------------------------------------------------------

const _right = new Vector3();
const _up = new Vector3();

/** A plant as 2–3 crossed rooted cards from the vegetation atlas. */
export function plant(veg: CardSet, p: Vector3, cell: Cell, w: number, h: number, colour: Color, r: Rnd, o: { cross?: number; lean?: number; sway?: number } = {}): void {
  const n = o.cross ?? 2;
  const yaw0 = r() * Math.PI;
  const lean = o.lean ?? 0.08;
  const tilt = new Vector3((r() - 0.5) * lean, 1, (r() - 0.5) * lean).normalize();
  for (let i = 0; i < n; i++) {
    const yaw = yaw0 + (i / n) * Math.PI;
    _right.set(Math.cos(yaw), 0, Math.sin(yaw));
    _up.copy(tilt);
    const right = _right.clone().addScaledVector(_up, -_right.dot(_up)).normalize();
    veg.add({ p, right, up: _up.clone(), w, h, cell, colour, bend: UP, sway: (o.sway ?? 0.05) * h, rooted: true });
  }
}

/** A small bush of floating leaf cards, sitting on the ground at (x, y, z). */
export function bush(leaves: CardSet, x: number, y: number, z: number, size: number, cell: Cell, tint: Color, r: Rnd, cards = 6): void {
  crown(leaves, [{ c: new Vector3(x, y + size * 0.4, z), r: size * 0.45 }], { cell, tint, card: [size * 0.7, size * 0.95], density: cards / (Math.PI * (size * 0.45) ** 2), flat: 0.8, sway: 0.03 }, r, () => true);
}

// ---- Fields -----------------------------------------------------------------------------------------------

/** Crops in rows along each field's furrows (the same rows ground.ts paints), no colliders. */
export function sowFields(veg: CardSet, layout: VillageLayout, keepOut: P2[], seed: number): void {
  const r = rng(seed);
  for (const f of layout.fields) {
    const c = Math.cos(f.rot);
    const s = Math.sin(f.rot);
    const world = (lx: number, lz: number) => new Vector3(f.x + lx * c + lz * s, 0, f.z - lx * s + lz * c);
    const rows = Math.floor(f.w / 0.7);
    for (let i = 0; i < rows; i++) {
      const lx = -f.w / 2 + (i + 0.5) * 0.7;
      const edge = i === 0 || i === rows - 1 ? 0.85 : 1;
      const spacing = f.crop === 'millet' ? 0.3 : f.crop === 'sugarcane' ? 0.5 : 0.42;
      // Vegetables: row groups of brinjal, chilli, greens, with a marigold row at the edge.
      const vegKind: Plant = i < 2 ? 'marigold' : ['brinjal', 'brinjal', 'chilli', 'chilli', 'greens', 'greens', 'greens'][Math.floor(((i - 2) / (rows - 2)) * 7)] as Plant;
      for (let lz = -f.d / 2 + 0.35; lz < f.d / 2 - 0.3; lz += spacing * (0.85 + r() * 0.3)) {
        if (r() < 0.05) continue;
        const p = world(lx + (r() - 0.5) * 0.08, lz);
        if (keepOut.some((k) => Math.hypot(k.x - p.x, k.z - p.z) < 1.9)) continue;
        if (f.crop === 'millet') {
          const h = (1.55 + r() * 0.5) * edge;
          plant(veg, p, r() < 0.8 ? VEG.bajra : VEG.jowar, h * 0.34, h, new Color(1, 1, 0.92).multiplyScalar(0.85 + 0.25 * r()), r, { sway: 0.06 });
        } else if (f.crop === 'sugarcane') {
          const h = (2.2 + r() * 0.55) * edge;
          plant(veg, p, VEG.cane, h * 0.34, h, new Color(1, 1, 1).multiplyScalar(0.85 + 0.25 * r()), r, { cross: 3, sway: 0.05 });
        } else {
          const size = vegKind === 'greens' ? 0.4 : vegKind === 'marigold' ? 0.75 : vegKind === 'brinjal' ? 0.85 : 0.65;
          plant(veg, p, VEG[vegKind], size * (0.85 + r() * 0.3), size * (0.85 + r() * 0.3), new Color(1, 1, 1).multiplyScalar(0.88 + 0.2 * r()), r, { sway: 0.04 });
        }
      }
    }
  }
}

// ---- Hedges -------------------------------------------------------------------------------------------------

/** A clipped leafy hedge on each hedge line: dark core, shrub-leaf cards over it, ragged top. */
export function plantHedges(leaves: CardSet, merge: Merger, fences: FenceDef[], seed: number): void {
  const r = rng(seed);
  const cell = quadCell(LEAF_QUAD.shrub);
  const cellB = quadCell(LEAF_QUAD.banyan);
  const cellN = quadCell(LEAF_QUAD.neem);
  const H = 1.15;
  const T = 0.8;
  for (const f of fences) {
    if (f.kind !== 'hedge') continue;
    for (let i = 0; i + 1 < f.points.length; i++) {
      const a = f.points[i];
      const b = f.points[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dir = new Vector3((b.x - a.x) / len, 0, (b.z - a.z) / len);
      const side = new Vector3(-dir.z, 0, dir.x);
      const rot = Math.atan2(b.x - a.x, b.z - a.z);
      // The core: shade inside the hedge, so it never reads as see-through.
      const core = new BoxGeometry(T - 0.14, H - 0.12, len - 0.1);
      core.rotateY(rot);
      core.translate((a.x + b.x) / 2, (H - 0.12) / 2, (a.z + b.z) / 2);
      merge.add('paint', tint(core, '#3f5a2c'));
      const steps = Math.ceil(len / 0.24);
      for (let k = 0; k <= steps; k++) {
        const t = Math.min((k + (r() - 0.5) * 0.6) / steps, 1) * len;
        const at = new Vector3(a.x, 0, a.z).addScaledVector(dir, t);
        // Both faces (low and high) and the top, each with cards facing out.
        const out = side.clone().negate();
        for (const [n, off, y] of [
          [side, T / 2 - 0.1, 0.25 + r() * 0.3],
          [side, T / 2 - 0.1, 0.65 + r() * 0.3],
          [out, T / 2 - 0.1, 0.25 + r() * 0.3],
          [out, T / 2 - 0.1, 0.65 + r() * 0.3],
          [UP, 0, H - 0.15 + r() * 0.1],
          [UP, 0, H - 0.15 + r() * 0.1],
        ] as const) {
          const p = at.clone().addScaledVector(n === UP ? side : n, n === UP ? (r() - 0.5) * (T - 0.3) : off).setY(y);
          const face = n.clone().add(new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.8)).normalize();
          const right = Math.abs(face.y) > 0.9 ? dir.clone() : new Vector3().crossVectors(UP, face).normalize();
          const roll = r() * TAU;
          const up0 = new Vector3().crossVectors(face, right);
          const rr = right.clone().multiplyScalar(Math.cos(roll)).addScaledVector(up0, Math.sin(roll));
          const uu = new Vector3().crossVectors(face, rr);
          const size = 0.55 + r() * 0.25;
          const shade = (0.72 + 0.4 * (y / H)) * (0.88 + 0.24 * r());
          const kind = r();
          leaves.add({ p, right: rr, up: uu, w: size, h: size, cell: kind < 0.6 ? cell : kind < 0.8 ? cellB : cellN, colour: new Color(1.0, 1.12, 0.92).multiplyScalar(shade), bend: n.clone().addScaledVector(UP, 0.6).normalize(), sway: 0.015 });
        }
      }
    }
  }
}

// ---- Hills beyond the edge ---------------------------------------------------------------------------------

/** Tree clumps, palms and scrub on the rising land outside the village, so the horizon isn't bare. */
export function plantHills(g: { merge: Merger; leaves: CardSet; veg: CardSet }, ground: Ground, height: (x: number, z: number) => number, seed: number): void {
  // Beyond the edge nothing is close enough to need its shadow: these meshes don't cast.
  const r = rng(seed);
  const geo = ground.mesh.geometry;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return;
  const groves = noise2(seed + 3);
  const cells = [quadCell(LEAF_QUAD.mango), quadCell(LEAF_QUAD.banyan), quadCell(LEAF_QUAD.neem)];
  const bark = new Color(0.72, 0.72, 0.75);
  const step = 8.5;
  for (let z = bb.min.z + 5; z < bb.max.z - 5; z += step) {
    for (let x = bb.min.x + 5; x < bb.max.x - 5; x += step) {
      const px = x + (r() - 0.5) * step;
      const pz = z + (r() - 0.5) * step;
      const d = ground.outside(px, pz);
      if (d < 3.5) continue;
      const g0 = groves(px / 26, pz / 26);
      const p = smooth(0.4, 0.7, g0) * 0.85 + 0.06 - (d > 55 ? 0.12 : 0);
      if (r() > p) continue;
      const n = 1 + Math.floor(r() * 3 * g0);
      for (let k = 0; k < n; k++) {
        const tx = px + (r() - 0.5) * 6;
        const tz = pz + (r() - 0.5) * 6;
        if (ground.outside(tx, tz) < 3.5) continue;
        const y0 = height(tx, tz);
        const kind = r();
        const palmy = (tx > 25 || tz > 25) && d < 30;
        if (palmy && kind < 0.25) hillPalm(g.merge, tx, y0, tz, 0.8 + r() * 0.35, r);
        else if (kind < 0.4) {
          // Scrub: a low bush and seeding grass.
          bush(g.leaves, tx, y0 - 0.15, tz, 1.4 + r() * 1.2, quadCell(LEAF_QUAD.shrub), new Color(0.85, 0.95, 0.8), r, 5);
          plant(g.veg, new Vector3(tx + 1, y0 - 0.05, tz), VEG.tallGrass, 0.5, 1.4, new Color(1, 0.95, 0.8), r);
        } else hillTree(g, tx, height(tx, tz), tz, 0.8 + r() * 0.5, cells[Math.floor(r() * cells.length)], bark, r);
      }
    }
  }
}

function hillTree(g: { merge: Merger; leaves: CardSet }, x: number, y0: number, z: number, k: number, cell: Cell, bark: Color, r: Rnd): void {
  const trunkH = (1.7 + r() * 1.1) * k;
  const lean = dirFrom(r() * TAU, r() * 0.15);
  const path = [new Vector3(x, y0 - 0.5, z), new Vector3(x, y0 + trunkH * 0.5, z).addScaledVector(lean, trunkH * 0.5), new Vector3(x, y0, z).addScaledVector(lean, trunkH + 0.6)];
  const c = bark.clone().multiplyScalar(0.85 + 0.3 * r());
  g.merge.add('hill-bark', tube(path, taper(3, 0.3 * k, 0.18 * k), 5, { tile: 1.4, colour: () => c }));
  const top = path[2];
  const R = (2.2 + r() * 1.0) * k;
  const clumps = [{ c: top.clone().addScaledVector(UP, R * 0.6), r: R }];
  for (let i = 0; i < 2; i++) {
    const a = r() * TAU;
    clumps.push({ c: top.clone().add(new Vector3(Math.cos(a) * R * 0.55, R * 0.25, Math.sin(a) * R * 0.55)), r: R * 0.75 });
  }
  // About fourteen big cards: enough to read as a crown through the haze.
  const density = 14 / (Math.PI * R * R * (1 + 2 * 0.75 * 0.75));
  crown(g.leaves, clumps, { cell, tint: new Color(0.85, 0.95, 0.82), card: [2.4 * k, 3.3 * k], density, flat: 0.8, sway: 0.03 }, r, () => true);
}

function hillPalm(merge: Merger, x: number, y0: number, z: number, k: number, r: Rnd): void {
  const H = (7 + r() * 3) * k;
  const lean = dirFrom(r() * TAU, 0.1 + r() * 0.12);
  const path: Vector3[] = [];
  for (let i = 0; i <= 5; i++) {
    const f = i / 5;
    path.push(new Vector3(x, y0 - 0.4, z).addScaledVector(UP, (H + 0.4) * f).addScaledVector(lean, H * f * f * 0.6));
  }
  merge.add('hill-bark', tube(path, taper(6, 0.2 * k, 0.14 * k), 5, { tile: 1.4, colour: () => new Color(1.1, 1.2, 1.3) }));
  const top = path[5];
  for (let i = 0; i < 9; i++) {
    const age = i / 8;
    merge.add('hill-palm', frond(top, i * 2.4 + r(), 1.0 - age * 1.4, (3.4 + r()) * k, k));
  }
}

/** A simplified frond for distant palms. */
function frond(base: Vector3, yaw: number, pitch: number, len: number, k: number) {
  const c = new Color(0.9, 0.95, 0.9);
  return blade(base, { len, width: (f) => 1.3 * k * Math.min(1, f * 6), pitch, yaw, droop: 0.4, fold: 0.4, foldTip: -0.5, segs: 3, colour: () => c, sway: 0.12 });
}
