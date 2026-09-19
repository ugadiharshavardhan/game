/**
 * Geometry helpers shared by the greybox and the art renderer.
 */
import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { P2 } from '../types';

/**
 * A flat ribbon along a polyline (roads, paths): mitred joins, UVs in metres along and across.
 * `lift` raises it off the ground to avoid z-fighting.
 */
export function ribbon(points: P2[], width: number, lift: number, extendEnds = 0): BufferGeometry {
  const pts = points.map((p) => ({ ...p }));
  if (extendEnds > 0 && pts.length >= 2) {
    const ext = (a: P2, b: P2) => {
      const l = Math.hypot(a.x - b.x, a.z - b.z) || 1;
      a.x += ((a.x - b.x) / l) * extendEnds;
      a.z += ((a.z - b.z) / l) * extendEnds;
    };
    ext(pts[0], pts[1]);
    ext(pts[pts.length - 1], pts[pts.length - 2]);
  }
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(i - 1, 0)];
    const next = pts[Math.min(i + 1, pts.length - 1)];
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // Mitre: scale the offset so the ribbon keeps its width through the bend (capped).
    let miter = 1;
    if (i > 0 && i < pts.length - 1) {
      const ax = pts[i].x - prev.x;
      const az = pts[i].z - prev.z;
      const al = Math.hypot(ax, az) || 1;
      const cos = (ax / al) * dx + (az / al) * dz;
      miter = Math.min(1 / Math.max(Math.sqrt((1 + cos) / 2), 0.5), 2);
    }
    const nx = -dz * (width / 2) * miter;
    const nz = dx * (width / 2) * miter;
    if (i > 0) along += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    pos.push(pts[i].x + nx, lift, pts[i].z + nz, pts[i].x - nx, lift, pts[i].z - nz);
    uv.push(0, along, width, along);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Ribbons face up regardless of winding.
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/** Paints a whole geometry one colour (vertex colour attribute), for merged single-material meshes. */
export function tint(g: BufferGeometry, color: Color | string, jitter = 0, seed = 0): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = color instanceof Color ? color : new Color(color);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  let r = seed * 9301 + 49297;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280) * 2 - 1;
  const j = jitter ? rand() * jitter : 0;
  for (let i = 0; i < n; i++) {
    col[i * 3] = Math.max(c.r * (1 + j), 0);
    col[i * 3 + 1] = Math.max(c.g * (1 + j), 0);
    col[i * 3 + 2] = Math.max(c.b * (1 + j), 0);
  }
  geo.setAttribute('color', new BufferAttribute(col, 3));
  if (geo !== g) g.dispose();
  return geo;
}

/**
 * Bakes objects' world transforms into their geometry and merges them — hundreds of static parts
 * become one draw call. Every input must carry the same attributes.
 */
export function mergeBaked(parts: BufferGeometry[]): BufferGeometry {
  const prepared = parts.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(x.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) x.deleteAttribute(name);
    if (!x.getAttribute('uv')) x.setAttribute('uv', new Float32BufferAttribute(new Float32Array(x.getAttribute('position').count * 2), 2));
    return x;
  });
  const merged = mergeGeometries(prepared, false);
  for (const p of prepared) p.dispose();
  if (!merged) throw new Error('mergeBaked: incompatible geometry attributes');
  return merged;
}

/** Applies an object's full world matrix to a clone of its geometry. */
export function bakeWorld(o: Object3D & { geometry: BufferGeometry }): BufferGeometry {
  o.updateWorldMatrix(true, false);
  return o.geometry.clone().applyMatrix4(o.matrixWorld);
}

/** Deterministic pseudo-random in [0, 1) from integer seeds. */
export function hash(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) {
    h ^= Math.floor(v * 1000) | 0;
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
