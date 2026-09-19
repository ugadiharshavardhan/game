/**
 * A 2D walkability grid rasterised from the level's solids, inflated by the player's radius.
 * Used by the level-design tests (reachability, route choice, shelter distance) and by the
 * playthrough autopilot. Pure TypeScript — no Three.js, no physics.
 */
import type { Level, Solid } from './solids';
import type { VillageLayout } from './types';

export interface NavGrid {
  cell: number;
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  /** 1 = blocked. */
  blocked: Uint8Array;
}

export interface NavOptions {
  /** Cell size, metres. */
  cell?: number;
  /** Clearance kept from obstacles — the player's capsule radius plus a margin. */
  radius?: number;
}

/** Height band the player's body occupies: obstacles outside it (eaves, low kerbs) don't block. */
const BODY_LOW = 0.2;
const BODY_HIGH = 1.6;

export function buildNavGrid(layout: VillageLayout, level: Level, opts: NavOptions = {}): NavGrid {
  const cell = opts.cell ?? 0.25;
  const radius = opts.radius ?? 0.34;
  const b = layout.bounds;
  const cols = Math.ceil((b.maxX - b.minX) / cell);
  const rows = Math.ceil((b.maxZ - b.minZ) / cell);
  const grid: NavGrid = { cell, minX: b.minX, minZ: b.minZ, cols, rows, blocked: new Uint8Array(cols * rows) };
  for (const s of level.solids) if (s.nav === 'block' && inBodyBand(s)) stamp(grid, s, radius);
  return grid;
}

function inBodyBand(s: Solid): boolean {
  if (s.kind === 'box') return s.y - s.sy / 2 < BODY_HIGH && s.y + s.sy / 2 > BODY_LOW;
  if (s.kind === 'cyl') return s.y < BODY_HIGH && s.y + s.h > BODY_LOW;
  return false;
}

function stamp(g: NavGrid, s: Solid, r: number): void {
  if (s.kind === 'box') {
    const c = Math.cos(s.rot);
    const sn = Math.sin(s.rot);
    const hx = s.sx / 2 + r;
    const hz = s.sz / 2 + r;
    const ext = Math.abs(hx * c) + Math.abs(hz * sn);
    const ezt = Math.abs(hx * sn) + Math.abs(hz * c);
    forCells(g, s.x - ext, s.z - ezt, s.x + ext, s.z + ezt, (i, x, z) => {
      const dx = x - s.x;
      const dz = z - s.z;
      // World → local: inverse of toWorld's rotation.
      const lx = dx * c - dz * sn;
      const lz = dx * sn + dz * c;
      if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) g.blocked[i] = 1;
    });
  } else if (s.kind === 'cyl') {
    const rr = s.r + r;
    forCells(g, s.x - rr, s.z - rr, s.x + rr, s.z + rr, (i, x, z) => {
      if ((x - s.x) ** 2 + (z - s.z) ** 2 <= rr * rr) g.blocked[i] = 1;
    });
  }
}

function forCells(g: NavGrid, x0: number, z0: number, x1: number, z1: number, fn: (i: number, x: number, z: number) => void): void {
  const c0 = Math.max(0, Math.floor((x0 - g.minX) / g.cell));
  const c1 = Math.min(g.cols - 1, Math.floor((x1 - g.minX) / g.cell));
  const r0 = Math.max(0, Math.floor((z0 - g.minZ) / g.cell));
  const r1 = Math.min(g.rows - 1, Math.floor((z1 - g.minZ) / g.cell));
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      fn(row * g.cols + col, g.minX + (col + 0.5) * g.cell, g.minZ + (row + 0.5) * g.cell);
    }
  }
}

export function cellOf(g: NavGrid, x: number, z: number): number {
  const col = Math.floor((x - g.minX) / g.cell);
  const row = Math.floor((z - g.minZ) / g.cell);
  if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return -1;
  return row * g.cols + col;
}

export function centreOf(g: NavGrid, i: number): { x: number; z: number } {
  return { x: g.minX + ((i % g.cols) + 0.5) * g.cell, z: g.minZ + (Math.floor(i / g.cols) + 0.5) * g.cell };
}

/** The nearest free cell to a point, within `maxDist` metres (e.g. an item on a counter → where you stand). */
export function nearestFree(g: NavGrid, x: number, z: number, maxDist = 2): number {
  const start = cellOf(g, x, z);
  if (start >= 0 && !g.blocked[start]) return start;
  const reach = Math.ceil(maxDist / g.cell);
  let best = -1;
  let bestD = Infinity;
  const col0 = Math.floor((x - g.minX) / g.cell);
  const row0 = Math.floor((z - g.minZ) / g.cell);
  for (let dr = -reach; dr <= reach; dr++) {
    for (let dc = -reach; dc <= reach; dc++) {
      const col = col0 + dc;
      const row = row0 + dr;
      if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) continue;
      const i = row * g.cols + col;
      if (g.blocked[i]) continue;
      const d = dr * dr + dc * dc;
      if (d < bestD && d <= reach * reach) {
        bestD = d;
        best = i;
      }
    }
  }
  return best;
}

const NEIGHBOURS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * Walking distance (metres) from `start` to every cell — Dijkstra over 8-connected cells, with no
 * corner cutting. Infinity where unreachable. `extraBlocked` temporarily closes cells (route tests).
 */
export function distanceField(g: NavGrid, start: number, extraBlocked?: Uint8Array): Float64Array {
  const dist = new Float64Array(g.cols * g.rows).fill(Infinity);
  if (start < 0 || g.blocked[start]) return dist;
  const heap = new MinHeap();
  dist[start] = 0;
  heap.push(start, 0);
  const free = (col: number, row: number) =>
    col >= 0 && row >= 0 && col < g.cols && row < g.rows && !g.blocked[row * g.cols + col] && !(extraBlocked && extraBlocked[row * g.cols + col]);
  while (heap.size) {
    const [i, d] = heap.pop();
    if (d > dist[i]) continue;
    const col = i % g.cols;
    const row = (i - col) / g.cols;
    for (const [dc, dr, w] of NEIGHBOURS) {
      const nc = col + dc;
      const nr = row + dr;
      if (!free(nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (!free(col + dc, row) || !free(col, row + dr))) continue;
      const nd = d + w * g.cell;
      const ni = nr * g.cols + nc;
      if (nd < dist[ni]) {
        dist[ni] = nd;
        heap.push(ni, nd);
      }
    }
  }
  return dist;
}

/** Walks a distance field downhill from `goal` back to its source. Returns cell centres, source first. */
export function traceBack(g: NavGrid, field: Float64Array, goal: number): { x: number; z: number }[] {
  if (goal < 0 || !Number.isFinite(field[goal])) return [];
  const out: number[] = [goal];
  let i = goal;
  while (field[i] > 0) {
    const col = i % g.cols;
    const row = (i - col) / g.cols;
    let best = i;
    for (const [dc, dr] of NEIGHBOURS) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
      const ni = nr * g.cols + nc;
      if (field[ni] < field[best]) best = ni;
    }
    if (best === i) break;
    i = best;
    out.push(i);
  }
  return out.reverse().map((c) => centreOf(g, c));
}

/** Drops waypoints that have a clear straight line past them — a path a person would actually walk. */
export function simplifyPath(g: NavGrid, pts: { x: number; z: number }[]): { x: number; z: number }[] {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  let anchor = 0;
  for (let i = 2; i < pts.length; i++) {
    if (!lineClear(g, pts[anchor], pts[i])) {
      out.push(pts[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * A straight walk from a to b stays clear — with a one-cell margin, because the grid only knows
 * obstacles to the nearest cell and a capsule brushing a corner at that resolution gets caught.
 */
function lineClear(g: NavGrid, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (g.cell * 0.5));
  for (let s = 0; s <= steps; s++) {
    const t = s / Math.max(steps, 1);
    const i = cellOf(g, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    if (i < 0) return false;
    const col = i % g.cols;
    const row = (i - col) / g.cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= g.cols || r >= g.rows || g.blocked[r * g.cols + c]) return false;
      }
    }
  }
  return true;
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, key: number): void {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.ids[0], this.keys[0]];
    const lastId = this.ids.pop() as number;
    const lastKey = this.keys.pop() as number;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.ids.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
