/**
 * Geometry for the temple: a quad sheet with per-vertex shade, ratha-plan lofts, turned stone with
 * metre UVs, and ribbed (amalaka) forms.
 *
 * A Nagara temple's plan is a square broken into projections — the central bhadra, the pratiratha
 * either side of it and the karna at each corner, with narrow recesses (salilantara) between. The
 * same plan runs from the base mouldings up through the wall and the whole curve of the shikhara,
 * so one loft over a stack of "rings" (height, half-extent, projection depth) builds all of it.
 */
import { BufferGeometry, Color, Float32BufferAttribute, Group, LatheGeometry, type Material, Matrix4, Mesh, Vector2, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fill, hashf, place } from './geom';

// ---- A batch for the temple's own materials ------------------------------------------------------

const KEEP = ['position', 'normal', 'uv', 'color'];

/**
 * Like `Batch`, for materials outside the shared kit (carved stone, polished basalt, sindoor):
 * one merged mesh per material.
 */
export class MatBatch {
  private readonly parts = new Map<Material, BufferGeometry[]>();

  add(mat: Material, geo: BufferGeometry, m?: Matrix4, color: Color | string = '#ffffff'): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (m) g.applyMatrix4(m);
    for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
    const n = g.getAttribute('position').count;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.getAttribute('color')) g = fill(g, color);
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
    return this;
  }

  /** Adds the merged meshes to `group`. */
  build(group: Group, o: { cast?: boolean; noShadow?: Material[] } = {}): Group {
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, mat);
      mesh.name = `${group.name}:${mat.name}`;
      mesh.castShadow = (o.cast ?? true) && !o.noShadow?.includes(mat);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

// ---- Sheet: hand-built quads ------------------------------------------------------------------

type UV = readonly [number, number];
const ZERO_UV: UV = [0, 0];

/** Accumulates triangles with UVs and a brightness per vertex (cavities, ledges, soot). */
export class Sheet {
  private readonly pos: number[] = [];
  private readonly uv: number[] = [];
  private readonly shade: number[] = [];

  get empty(): boolean {
    return this.pos.length === 0;
  }

  tri(a: Vector3, b: Vector3, c: Vector3, ua: UV = ZERO_UV, ub: UV = ZERO_UV, uc: UV = ZERO_UV, k = 1): this {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    this.shade.push(k, k, k);
    return this;
  }

  /** a→b along the bottom, d→c along the top, counter-clockwise seen from the front. */
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, uv?: readonly [UV, UV, UV, UV], k = 1): this {
    const [ua, ub, uc, ud] = uv ?? [ZERO_UV, ZERO_UV, ZERO_UV, ZERO_UV];
    this.tri(a, b, c, ua, ub, uc, k);
    return this.tri(a, c, d, ua, uc, ud, k);
  }

  /**
   * Flat-shaded geometry. Colour = base × shade × a little per-vertex grain, times `tone(p)` if
   * given (streaks, soot, sun-bleaching).
   */
  build(base: Color | string, o: { grain?: number; seed?: number; tone?: (x: number, y: number, z: number) => number } = {}): BufferGeometry {
    const c = base instanceof Color ? base : new Color(base);
    const n = this.pos.length / 3;
    const col = new Float32Array(n * 3);
    const grain = o.grain ?? 0.07;
    for (let i = 0; i < n; i++) {
      const x = this.pos[i * 3];
      const y = this.pos[i * 3 + 1];
      const z = this.pos[i * 3 + 2];
      const k = this.shade[i] * (1 + (hashf(x * 3.1 + (o.seed ?? 0), y * 2.3, z * 3.7) - 0.5) * grain) * (o.tone ? o.tone(x, y, z) : 1);
      col.set([c.r * k, c.g * k, c.b * k], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }
}

// ---- Ratha plans and lofts ----------------------------------------------------------------------

/**
 * Half a face, centre outward: [from, to, depth] in fractions of the face's half-length. Depth is
 * how far that projection stands out from the karna plane (scaled by the ring's `ds`).
 */
export type Spans = readonly (readonly [number, number, number])[];

/** A plain face. Breakpoints let a caller skip part of it (a doorway). */
export const FLAT = (...breaks: number[]): Spans => {
  const out: [number, number, number][] = [];
  let a = 0;
  for (const b of [...breaks, 1]) {
    out.push([a, b, 0]);
    a = b;
  }
  return out;
};

interface OutlinePoint {
  s: number;
  d: number;
  /** On the bhadra's front face. */
  bhadra: boolean;
}

/** The outline of one face from s = −1 up to (not including) s = 1 — the next face starts there. */
function outline(spans: Spans): OutlinePoint[] {
  const bhadraD = spans[0][2];
  const hasBhadra = spans.length > 1 && spans.some((s) => s[2] !== bhadraD);
  const pts: OutlinePoint[] = [];
  const push = (s: number, d: number, first: boolean) => {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.s - s) < 1e-6 && Math.abs(last.d - d) < 1e-6) return;
    pts.push({ s, d, bhadra: hasBhadra && first && d === bhadraD });
  };
  for (let i = spans.length - 1; i >= 0; i--) {
    const [a, b, d] = spans[i];
    push(-b, d, i === 0);
    push(-a, d, i === 0);
  }
  for (let i = 0; i < spans.length; i++) {
    const [a, b, d] = spans[i];
    push(a, d, i === 0);
    push(b, d, i === 0);
  }
  pts.pop();
  return pts;
}

/** Faces in order: south (+z), east (+x), north (−z), west (−x). */
const T = [new Vector3(1, 0, 0), new Vector3(0, 0, -1), new Vector3(-1, 0, 0), new Vector3(0, 0, 1)];
const N = [new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 0, -1), new Vector3(-1, 0, 0)];
/** Yaw that turns a local +z-facing part to face each side. */
export const FACE_YAW = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

export interface Ring {
  y: number;
  /** Half-extents of the karna plane. */
  hx: number;
  hz: number;
  /** Multiplies the span depths (metres, or the shikhara's current half-width). */
  ds: number;
  /** Extra outward offset for the bhadra front (the shikhara's latā doesn't step back per course). */
  bOff?: number;
  tag?: string;
}

export interface LoftQuad {
  face: number;
  kind: 'bhadra' | 'return' | 'face';
  /** The lower ring's tag and index. */
  tag?: string;
  ring: number;
  /** Face fractions of the quad's two edges (−1…1). */
  s0: number;
  s1: number;
  a: Vector3;
  b: Vector3;
  c: Vector3;
  d: Vector3;
}

/**
 * Lofts the ratha plan through a stack of rings (bottom to top) and hands every quad to `emit`,
 * which picks its material and UVs (or drops it). Equal heights make ledges; equal extents make walls.
 */
export function rathaLoft(rings: readonly Ring[], spansFor: (face: number) => Spans, emit: (q: LoftQuad) => void, cx = 0, cz = 0, faces: readonly number[] = [0, 1, 2, 3]): void {
  const outlines = [0, 1, 2, 3].map((f) => outline(spansFor(f)));
  const point = (r: Ring, f: number, p: OutlinePoint) => {
    const along = (f % 2 === 0 ? r.hx : r.hz) * p.s;
    const out = (f % 2 === 0 ? r.hz : r.hx) + p.d * r.ds + (p.bhadra ? (r.bOff ?? 0) : 0);
    return new Vector3(cx + T[f].x * along + N[f].x * out, r.y, cz + T[f].z * along + N[f].z * out);
  };
  for (const f of faces) {
    const pts = outlines[f];
    const next = outlines[(f + 1) % 4][0];
    for (let k = 0; k + 1 < rings.length; k++) {
      const r0 = rings[k];
      const r1 = rings[k + 1];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = i + 1 < pts.length ? pts[i + 1] : null;
        // The last segment runs to the next face's first point (the shared corner).
        const b0 = q ? point(r0, f, q) : point(r0, (f + 1) % 4, next);
        const b1 = q ? point(r1, f, q) : point(r1, (f + 1) % 4, next);
        const s1 = q ? q.s : 1;
        const kind = q && Math.abs(q.s - p.s) < 1e-6 ? 'return' : p.bhadra && q?.bhadra ? 'bhadra' : 'face';
        emit({ face: f, kind, tag: r0.tag, ring: k, s0: p.s, s1, a: point(r0, f, p), b: b0, c: b1, d: point(r1, f, p) });
      }
    }
  }
}

/** Fan-closes a ring (the top of a wall or the shikhara's shoulder). Hidden caps only. */
export function rathaCap(sheet: Sheet, r: Ring, spansFor: (face: number) => Spans, cx = 0, cz = 0): void {
  const centre = new Vector3(cx, r.y, cz);
  rathaLoft([r, { ...r, hx: 0, hz: 0, ds: 0, bOff: 0 }], spansFor, (q) => {
    if (q.kind !== 'return') sheet.tri(q.a, q.b, centre);
  }, cx, cz);
}

/** Placement on a face: local +x along the face (left to right seen from outside), +z outward. */
export function faceMatrix(face: number, cx: number, cz: number, out: number): Matrix4 {
  return place(cx, 0, cz, FACE_YAW[face]).multiply(new Matrix4().makeTranslation(0, 0, out));
}

// ---- Turned and ribbed stone --------------------------------------------------------------------

/**
 * A lathe from [radius, height] points. A third element of 1 makes a crisp edge there (the point
 * is doubled, so the normals don't smooth across it). UVs run in metres ÷ `tile`.
 */
export function turned(profile: readonly (readonly [number, number, number?])[], segs: number, tile = 1): BufferGeometry {
  const pts: Vector2[] = [];
  for (const [r, y, hard] of profile) {
    pts.push(new Vector2(Math.max(r, 0.0005), y));
    if (hard) pts.push(new Vector2(Math.max(r, 0.0005), y));
  }
  const g = new LatheGeometry(pts, segs);
  const rMax = Math.max(...profile.map((p) => p[0]));
  const uv = g.getAttribute('uv');
  const pos = g.getAttribute('position');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * rMax) / tile, pos.getY(i) / tile);
  return g;
}

/**
 * Ribs around a turned form: radius pulled in along `ribs` grooves (the amalaka's "gooseberry"
 * lobes). Normals are recomputed smooth, so each lobe reads as a rounded cushion.
 */
export function ribbed(g: BufferGeometry, ribs: number, depth: number, sharp = 0.5): BufferGeometry {
  const pos = g.getAttribute('position');
  let rMax = 0;
  for (let i = 0; i < pos.count; i++) rMax = Math.max(rMax, Math.hypot(pos.getX(i), pos.getZ(i)));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    // 1 at a lobe's crest, 0 in the groove; a small power keeps lobes round and grooves sharp.
    const lobe = Math.abs(Math.cos((Math.atan2(x, z) * ribs) / 2)) ** sharp;
    // Deeper grooves where the form is widest; the neck stays round.
    const k = 1 - depth * (1 - lobe) * (r / rMax) ** 2;
    pos.setXYZ(i, x * k, pos.getY(i), z * k);
  }
  g.computeVertexNormals();
  return g;
}
