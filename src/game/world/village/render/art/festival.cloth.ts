/**
 * Cloth for the pandal: a parametric grid (tent roof, drapes, swags) with smooth normals and crisp
 * dyed stripes, pleated walls, and the scalloped valance with tassels that edges every shamiana.
 */
import { BufferGeometry, Color, ConeGeometry, Float32BufferAttribute, Vector3 } from 'three';

/**
 * A grid of cloth from a surface P(u, v), u and v in 0..1. Each cell takes one colour from
 * `color(i, j)` (so stripes stay crisp); `shade(u, v)` darkens folds. Normals come from the
 * surface itself, so a sagging roof stays smooth. `size` is the cloth's extent in metres, for UVs.
 */
export function clothGrid(
  nu: number,
  nv: number,
  P: (u: number, v: number) => Vector3,
  color: (i: number, j: number) => Color,
  size: [number, number],
  shade: (u: number, v: number) => number = () => 1,
): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const col: number[] = [];
  const e = 1e-3;
  const du = new Vector3();
  const dv = new Vector3();
  const n = new Vector3();
  const corner = (u: number, v: number, c: Color) => {
    const p = P(u, v);
    du.subVectors(P(Math.min(u + e, 1), v), P(Math.max(u - e, 0), v));
    dv.subVectors(P(u, Math.min(v + e, 1)), P(u, Math.max(v - e, 0)));
    n.crossVectors(du, dv).normalize();
    const k = shade(u, v);
    pos.push(p.x, p.y, p.z);
    nor.push(n.x, n.y, n.z);
    uvs.push((u * size[0]) / 0.9, (v * size[1]) / 0.9);
    col.push(c.r * k, c.g * k, c.b * k);
  };
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const c = color(i, j);
      const [u0, u1, v0, v1] = [i / nu, (i + 1) / nu, j / nv, (j + 1) / nv];
      corner(u0, v0, c);
      corner(u1, v0, c);
      corner(u1, v1, c);
      corner(u0, v0, c);
      corner(u1, v1, c);
      corner(u0, v1, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

/**
 * A pleated cloth wall hanging in the local XY plane from x = 0 to `len`, y0 to y1, folds ±depth/2
 * in z. `color(x, y)` dyes it (sampled at each cell's centre).
 */
export function pleated(len: number, y0: number, y1: number, pleat: number, depth: number, color: (x: number, y: number) => Color, rows = 3): BufferGeometry {
  const nu = Math.max(2, Math.round((len / pleat) * 2));
  const h = y1 - y0;
  return clothGrid(
    nu,
    rows,
    (u, v) => {
      const x = u * len;
      // Soft folds: a rounded zigzag, deeper toward the hem where the cloth hangs free.
      const f = Math.sin((x / pleat) * Math.PI * 2);
      return new Vector3(x, y0 + v * h, f * (depth / 2) * (0.75 + 0.25 * (1 - v)));
    },
    (i, j) => color(((i + 0.5) / nu) * len, y0 + ((j + 0.5) / rows) * h),
    [len, h],
    (u) => 0.84 + 0.16 * Math.cos(((u * len) / pleat) * Math.PI * 2),
  );
}

export interface Valance {
  geo: BufferGeometry[];
  /** Points where the scallops meet — where tassels hang. */
  cusps: Vector3[];
}

/**
 * A scalloped valance along local x (centred), hanging from y = 0 in the plane z = 0: a band, a
 * thin gilt line, then a row of semicircular scallops.
 */
export function valance(len: number, band: number, scallop: number, colors: { band: string; line: string; scallop: string }): Valance {
  const n = Math.max(1, Math.round(len / (scallop * 2)));
  const w = len / n;
  const r = w / 2;
  const pos: number[] = [];
  const col: number[] = [];
  const cb = new Color(colors.band);
  const cl = new Color(colors.line);
  const cs = new Color(colors.scallop);
  const quad = (x0: number, x1: number, ya: number, yb: number, c: Color) => {
    pos.push(x0, ya, 0, x0, yb, 0, x1, yb, 0, x0, ya, 0, x1, yb, 0, x1, ya, 0);
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  };
  const line = 0.025;
  const cusps: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = -len / 2 + i * w;
    const x1 = x0 + w;
    quad(x0, x1, 0, -band, cb);
    quad(x0, x1, -band, -band - line, cl);
    // Scallop: a fan from the top centre of the cell.
    const cx = (x0 + x1) / 2;
    const top = -band - line;
    const seg = 8;
    for (let k = 0; k < seg; k++) {
      const a0 = Math.PI + (k / seg) * Math.PI;
      const a1 = Math.PI + ((k + 1) / seg) * Math.PI;
      pos.push(cx, top, 0, cx + Math.cos(a0) * r, top + Math.sin(a0) * r * 0.9, 0, cx + Math.cos(a1) * r, top + Math.sin(a1) * r * 0.9, 0);
      for (let m = 0; m < 3; m++) col.push(cs.r, cs.g, cs.b);
    }
    cusps.push(new Vector3(x0, top, 0));
    if (i === n - 1) cusps.push(new Vector3(x1, top, 0));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new Float32BufferAttribute(pos.flatMap((v, i) => (i % 3 === 2 ? [] : [v / 0.9])), 2));
  g.computeVertexNormals();
  return { geo: [g], cusps };
}

/** A tassel: a short cord and a little gilt cone hanging from p (in the valance's frame). */
export function tassel(p: Vector3, len = 0.1): BufferGeometry {
  const g = new ConeGeometry(0.022, len, 6, 1, true);
  g.translate(p.x, p.y - 0.035 - len / 2, p.z + 0.004);
  return g;
}
