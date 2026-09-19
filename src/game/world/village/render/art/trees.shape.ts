/**
 * Shapes for trees: tapered bark tubes along curved paths, growing boughs, leaf crowns of alpha
 * cards, and the curved, folded blades of palm fronds and banana leaves.
 */
import { BufferGeometry, Color, Float32BufferAttribute, Quaternion, Vector3 } from 'three';
import type { CardSet, Cell } from './trees.gpu';

export const UP = new Vector3(0, 1, 0);
const TAU = Math.PI * 2;

export type Rnd = () => number;
export const range = (r: Rnd, [a, b]: readonly [number, number]) => a + (b - a) * r();

/** A unit vector at `tilt` from vertical, heading `yaw` (0 = +x, toward +z). */
export function dirFrom(yaw: number, tilt: number): Vector3 {
  return new Vector3(Math.cos(yaw) * Math.sin(tilt), Math.cos(tilt), Math.sin(yaw) * Math.sin(tilt));
}

// ---- Tubes --------------------------------------------------------------------------------------

export interface TubeOpts {
  /** Metres per texture repeat. */
  tile: number;
  /** Bark tint at a ring (i), around it (a, radians) and at a world point. */
  colour: (t: number, a: number, p: Vector3) => Color;
  /** Radius multiplier around the ring — flutes and buttresses. */
  flute?: (t: number, a: number) => number;
  /** Where along the path texture v starts (to keep bark continuous across joins). */
  v0?: number;
}

/**
 * A tapered tube along a path (parallel-transport frames, so it never twists), with UVs in metres:
 * u around the circumference, v along the length.
 */
export function tube(path: Vector3[], radii: number[], sides: number, o: TubeOpts): BufferGeometry {
  const rows = path.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const mean = radii.reduce((s, r) => s + r, 0) / rows;
  const wraps = Math.max(1, Math.round((TAU * mean) / o.tile));
  let tangent = new Vector3().subVectors(path[1], path[0]).normalize();
  let normal = new Vector3().crossVectors(tangent, Math.abs(tangent.y) < 0.9 ? UP : new Vector3(1, 0, 0)).normalize();
  const q = new Quaternion();
  let along = o.v0 ?? 0;
  const p = new Vector3();
  const d = new Vector3();
  for (let i = 0; i < rows; i++) {
    const next = new Vector3().subVectors(path[Math.min(i + 1, rows - 1)], path[Math.max(i - 1, 0)]).normalize();
    q.setFromUnitVectors(tangent, next);
    normal.applyQuaternion(q);
    tangent = next;
    const binormal = new Vector3().crossVectors(tangent, normal).normalize();
    normal = new Vector3().crossVectors(binormal, tangent).normalize();
    if (i > 0) along += path[i].distanceTo(path[i - 1]);
    const t = i / (rows - 1);
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * TAU;
      d.copy(normal).multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
      const r = radii[i] * (o.flute ? o.flute(t, a) : 1);
      p.copy(path[i]).addScaledVector(d, r);
      pos.push(p.x, p.y, p.z);
      nor.push(d.x, d.y, d.z);
      uv.push((j / sides) * wraps, along / o.tile);
      const c = o.colour(t, a, p);
      col.push(c.r, c.g, c.b);
      if (i > 0 && j < sides) {
        const a0 = (i - 1) * (sides + 1) + j;
        const b0 = i * (sides + 1) + j;
        idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/**
 * A bough grown from `start` along `dir`: each step bends toward the sky by `rise` (negative
 * droops) and wanders a little. Returns the path.
 */
export function bough(start: Vector3, dir: Vector3, len: number, segs: number, rise: number, wander: number, r: Rnd): Vector3[] {
  const pts = [start.clone()];
  const d = dir.clone().normalize();
  const step = len / segs;
  const p = start.clone();
  for (let i = 0; i < segs; i++) {
    d.addScaledVector(UP, rise * step).add(new Vector3(r() - 0.5, (r() - 0.5) * 0.5, r() - 0.5).multiplyScalar(wander)).normalize();
    p.addScaledVector(d, step);
    pts.push(p.clone());
  }
  return pts;
}

/** Radii tapering from r0 to r1 along a path of n points (slightly convex, like wood). */
export function taper(n: number, r0: number, r1: number, power = 0.8): number[] {
  return Array.from({ length: n }, (_, i) => r0 + (r1 - r0) * (i / (n - 1)) ** power);
}

/** The point a fraction t of the way along a path, and its direction. */
export function along(path: Vector3[], t: number): { p: Vector3; d: Vector3; i: number } {
  const f = t * (path.length - 1);
  const i = Math.min(Math.floor(f), path.length - 2);
  const k = f - i;
  return { p: new Vector3().lerpVectors(path[i], path[i + 1], k), d: new Vector3().subVectors(path[i + 1], path[i]).normalize(), i };
}

// ---- Crowns ---------------------------------------------------------------------------------------

export interface Clump {
  c: Vector3;
  r: number;
}

export interface CrownLook {
  cell: Cell;
  tint: Color;
  /** Card size range, metres. */
  card: readonly [number, number];
  /** Cards per square metre of clump cross-section. */
  density: number;
  /** Vertical squash of the clumps (1 = round). */
  flat: number;
  sway: number;
  /** Share of cards with a different tint (mango's copper flush). */
  flush?: { share: number; tint: Color };
}

/**
 * Fills leaf clumps with alpha cards facing out of the crown, darker inside and underneath (the
 * sky can't reach there), lighter on top. `clear` rejects cards inside buildings.
 */
export function crown(cards: CardSet, clumps: Clump[], look: CrownLook, r: Rnd, clear: (p: Vector3, size: number) => boolean): void {
  if (!clumps.length) return;
  const centre = new Vector3();
  let lo = Infinity;
  let hi = -Infinity;
  for (const k of clumps) {
    centre.add(k.c);
    lo = Math.min(lo, k.c.y - k.r * look.flat);
    hi = Math.max(hi, k.c.y + k.r * look.flat);
  }
  centre.divideScalar(clumps.length);
  const colour = new Color();
  for (const k of clumps) {
    const n = Math.max(3, Math.round(look.density * Math.PI * k.r * k.r));
    for (let i = 0; i < n; i++) {
      // Mostly near the surface; the underside is flatter than the top.
      const d = new Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
      if (d.lengthSq() > 1 || d.lengthSq() < 1e-4) {
        i--;
        continue;
      }
      d.normalize();
      const depth = 0.5 + 0.5 * Math.sqrt(r());
      const p = new Vector3(d.x * k.r, d.y * k.r * look.flat * (d.y < 0 ? 0.7 : 1), d.z * k.r).multiplyScalar(depth).add(k.c);
      const size = range(r, look.card);
      if (!clear(p, size)) continue;
      const out = new Vector3().subVectors(p, centre).normalize();
      const bend = d.clone().multiplyScalar(0.55).add(out).addScaledVector(UP, 0.2).normalize();
      const face = bend.clone().add(new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(1.1)).normalize();
      const right0 = Math.abs(face.y) > 0.95 ? new Vector3(1, 0, 0) : new Vector3().crossVectors(UP, face).normalize();
      const up0 = new Vector3().crossVectors(face, right0);
      const roll = r() * TAU;
      const right = right0.clone().multiplyScalar(Math.cos(roll)).addScaledVector(up0, Math.sin(roll));
      const up = new Vector3().crossVectors(face, right);
      const h = (p.y - lo) / Math.max(hi - lo, 0.1);
      const ao = (0.5 + 0.5 * h) * (0.72 + 0.28 * depth) * (0.9 + 0.2 * r());
      const flush = look.flush && r() < look.flush.share * (0.4 + h);
      colour.copy(flush ? (look.flush as { tint: Color }).tint : look.tint).multiplyScalar(ao);
      cards.add({ p, right, up, w: size, h: size, cell: look.cell, colour, bend, sway: look.sway * (0.6 + 0.8 * r()) });
    }
  }
}

// ---- Leaves with a spine ------------------------------------------------------------------------

export interface BladeOpts {
  /** Metres along the spine. */
  len: number;
  /** Full width across. */
  width: (t: number) => number;
  /** Initial elevation above horizontal (radians) and heading (yaw, radians). */
  pitch: number;
  yaw: number;
  /** Downward bend per metre (gravity) — grows along the blade. */
  droop: number;
  /** V-fold: each half lifts by this angle at the base, and by `foldTip` at the tip. */
  fold: number;
  foldTip: number;
  segs: number;
  colour: (t: number) => Color;
  /** Sway weight (metres) at the tip; the base is rigid. */
  sway: number;
}

/**
 * A folded leaf blade (palm frond, banana leaf): a spine curving under its own weight, two halves
 * lifted into a V along it. u runs across (0 left → 1 right), v along (0 base → 1 tip).
 */
export function blade(base: Vector3, o: BladeOpts): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const sway: number[] = [];
  const idx: number[] = [];
  const dir = new Vector3(Math.cos(o.yaw) * Math.cos(o.pitch), Math.sin(o.pitch), Math.sin(o.yaw) * Math.cos(o.pitch));
  const side = new Vector3(-Math.sin(o.yaw), 0, Math.cos(o.yaw));
  const p = base.clone();
  const step = o.len / o.segs;
  for (let i = 0; i <= o.segs; i++) {
    const t = i / o.segs;
    const n = new Vector3().crossVectors(side, dir).normalize();
    const fold = o.fold + (o.foldTip - o.fold) * t;
    const w = o.width(t) / 2;
    const c = o.colour(t);
    // Left edge, spine, right edge — each half tilted up from the spine by `fold`.
    const left = p.clone().addScaledVector(side, -w * Math.cos(fold)).addScaledVector(n, w * Math.sin(fold));
    const right = p.clone().addScaledVector(side, w * Math.cos(fold)).addScaledVector(n, w * Math.sin(fold));
    for (const [q, u] of [[left, 0], [p, 0.5], [right, 1]] as const) {
      pos.push(q.x, q.y, q.z);
      uv.push(u, t);
      col.push(c.r, c.g, c.b);
      sway.push(o.sway * t * t);
    }
    if (i > 0) {
      const a = (i - 1) * 3;
      const b = i * 3;
      idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
    }
    // Gravity: pitch the spine down, harder toward the tip.
    dir.addScaledVector(UP, -o.droop * step * (0.4 + t * 1.2)).normalize();
    p.addScaledVector(dir, step);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('aSway', new Float32BufferAttribute(sway, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
