/**
 * The shikhara: a Nagara (latina) spire over the sanctum, and its saffron flag.
 *
 * Anatomy, bottom to top: the curved body on the temple's pancharatha plan — the central lata
 * (bhadra) a continuous band of gavaksha mesh, the pratiratha and karna stepped in horizontal
 * courses — divided into five storeys (bhumi) by ribbed bhumi-amalakas at the corners; on the
 * front, the sukanasa's great arch leaning out over the mandapa; then the shoulder (skandha), the
 * neck (griva), the great ribbed amalaka, its cap (chandrika), a small amalaka, the brass kalasha,
 * and the flagstaff with the bhagwa dhwaj.
 *
 * The curve rises almost vertically and turns in toward the shoulder, the way the rekha of a
 * latina temple does; from the square, at dusk, that profile is the village's skyline.
 */
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, type Material, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { type Batch, boxUV, fill } from './geom';
import { type MatBatch, rathaCap, rathaLoft, type Ring, ribbed, Sheet, type Spans, turned } from './temple.geom';
import { TONE } from './palette';
import { PANEL, stripV } from './temple.textures';
import type { ArtContext } from './runtime';

/** The plan of the spire (depths × the current half-width): bhadra, recess, pratiratha, recess, karna. */
export const SPIRE_SPANS: Spans = [[0, 0.24, 0.1], [0.24, 0.28, -0.012], [0.28, 0.56, 0.045], [0.56, 0.61, -0.018], [0.61, 1, 0]];

export interface SpireSpec {
  cx: number;
  cz: number;
  /** Top of the sanctum's cornice, where the spire begins. */
  base: number;
  /** Half-width of the karna plane at the base and at the shoulder. */
  b0: number;
  bs: number;
  /** Height of the curved body, base to shoulder. */
  body: number;
  /** Sandstone tone (vertex colour). */
  stone: Color;
}

const BHUMIS = 5;
/** Metres of tower per repeat of the jala strip (along u). */
const JALA_REPEAT = 4.6;
/** How far each course steps back at its top ledge. */
const LEDGE = 0.045;

/** Half-width of the karna plane at height `y` (the rekha curve). */
function widthAt(s: SpireSpec, y: number): number {
  const t = Math.min(Math.max((y - s.base) / s.body, 0), 1);
  return s.b0 - (s.b0 - s.bs) * t ** 2.1;
}

/** Soft vertical rain streaks and a paler, sun-bleached crown. */
function spireTone(s: SpireSpec) {
  return (x: number, y: number, z: number) => {
    const t = (y - s.base) / (s.body + 3);
    const streak = vnoise((x - s.cx) * 2.1 + (z - s.cz) * 1.7);
    return (1 - 0.13 * streak) * (0.94 + 0.1 * t);
  };
}

/**
 * Builds the spire into `b` (shared stone and brass) and `mb` (carved lata, sukanasa arch).
 * Returns the top of the flagstaff.
 */
export function spire(b: Batch, mb: MatBatch, carved: Material, s: SpireSpec, lvl: 0 | 1): Vector3 {
  const stone = new Sheet();
  const lata = new Sheet();
  const courses = lvl === 0 ? BHUMIS * 4 : BHUMIS * 2;
  const hc = s.body / courses;
  const [jv0, jv1] = stripV('jala');

  // ---- The curved body: one loft over the courses -------------------------------------------
  const rings: Ring[] = [{ y: s.base, hx: s.b0, hz: s.b0, ds: s.b0 }];
  for (let k = 0; k < courses; k++) {
    const y = s.base + (k + 1) * hc;
    const w = widthAt(s, y);
    rings.push({ y, hx: w, hz: w, ds: w });
    // Each course steps back a little at its top — except the lata, which runs unbroken.
    if (lvl === 0 && k + 1 < courses) rings.push({ y, hx: w - LEDGE, hz: w - LEDGE, ds: w, bOff: LEDGE });
  }
  const uv = (y: number, sf: number) => [(y - s.base) / JALA_REPEAT, jv0 + ((sf + 0.24) / 0.48) * (jv1 - jv0)] as const;
  rathaLoft(rings, () => SPIRE_SPANS, (q) => {
    const ledge = Math.abs(q.a.y - q.d.y) < 1e-4;
    if (q.kind === 'bhadra') {
      if (ledge) return;
      if (lvl === 0) lata.quad(q.a, q.b, q.c, q.d, [uv(q.a.y, q.s0), uv(q.b.y, q.s1), uv(q.c.y, q.s1), uv(q.d.y, q.s0)]);
      else stone.quad(q.a, q.b, q.c, q.d, undefined, 1.02);
      return;
    }
    stone.quad(q.a, q.b, q.c, q.d, undefined, ledge ? 1.12 : q.kind === 'return' ? 0.8 : 1);
  }, s.cx, s.cz);
  const top = s.base + s.body;
  const ws = widthAt(s, top);
  rathaCap(stone, { y: top, hx: ws, hz: ws, ds: ws }, () => SPIRE_SPANS, s.cx, s.cz);

  // The shoulder slab (skandha vedi): the plan once more, a little proud of the body.
  const vedi: Ring[] = [
    { y: top - 0.02, hx: ws + 0.02, hz: ws + 0.02, ds: ws },
    { y: top + 0.06, hx: ws + 0.1, hz: ws + 0.1, ds: ws },
    { y: top + 0.2, hx: ws + 0.1, hz: ws + 0.1, ds: ws },
  ];
  rathaLoft(vedi, () => SPIRE_SPANS, (q) => stone.quad(q.a, q.b, q.c, q.d, undefined, q.kind === 'return' ? 0.85 : 1), s.cx, s.cz);
  rathaCap(stone, vedi[2], () => SPIRE_SPANS, s.cx, s.cz);

  const tone = spireTone(s);
  b.add('stone', boxUV(stone.build(s.stone, { tone, seed: 3 }), 2.6));
  if (!lata.empty) mb.add(carved, lata.build(s.stone.clone().multiplyScalar(1.04), { tone, seed: 4 }));

  // ---- Bhumi-amalakas: ribbed cushions stacked up each corner ---------------------------------
  const bhumiEvery = courses / BHUMIS;
  for (let k = 1; k <= BHUMIS; k++) {
    const y = s.base + k * bhumiEvery * hc;
    const w = widthAt(s, y);
    const R = 0.24 * w;
    const H = 0.3;
    const disc = ribbed(turned([[0.5 * R, 0, 1], [0.84 * R, 0.08 * H], [R, 0.36 * H], [R, 0.6 * H], [0.84 * R, 0.9 * H], [0.5 * R, H, 1], [0.001, H]], lvl === 0 ? 40 : 12, 1.4), lvl === 0 ? 14 : 6, 0.14);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const g = disc.clone().translate(s.cx + sx * 0.805 * w, y - 0.22, s.cz + sz * 0.805 * w);
      b.add('stone', fill(g, s.stone.clone().multiplyScalar(0.97)));
    }
    disc.dispose();
  }

  // ---- Sukanasa: the great arch leaning out over the mandapa roof ----------------------------
  sukanasa(b, mb, carved, s, lvl);

  // ---- Crown: griva, amalaka, chandrika, amalasaraka, kalasha --------------------------------
  let y = top + 0.2;
  const seg = lvl === 0 ? 1 : 0.5;
  const crown = s.stone.clone().multiplyScalar(1.02);
  const add = (g: BufferGeometry, h: number, c = crown) => {
    b.add('stone', fill(g.translate(s.cx, y, s.cz), c));
    y += h;
  };
  const R = ws * 1.02;
  add(turned([[R * 0.66, 0, 1], [R * 0.6, 0.06], [R * 0.58, 0.26], [R * 0.64, 0.3, 1], [0.001, 0.3]], Math.round(32 * seg), 2), 0.3);
  const amalaka = turned([[R * 0.6, 0, 1], [R * 0.75, 0.04], [R * 0.9, 0.14], [R * 0.99, 0.3], [R, 0.4], [R * 0.98, 0.5], [R * 0.88, 0.64], [R * 0.72, 0.74], [R * 0.6, 0.78, 1], [0.001, 0.78]], lvl === 0 ? 128 : 48, 2);
  add(ribbed(amalaka, lvl === 0 ? 40 : 24, 0.13), 0.78);
  add(turned([[0.001, 0], [R * 0.7, 0, 1], [R * 0.72, 0.07, 1], [R * 0.6, 0.14], [R * 0.36, 0.2], [0.001, 0.21]], Math.round(32 * seg), 2), 0.2);
  const small = turned([[0.2, 0, 1], [0.34, 0.05], [0.4, 0.14], [0.36, 0.24], [0.2, 0.3, 1], [0.001, 0.3]], lvl === 0 ? 48 : 16, 1);
  add(ribbed(small, lvl === 0 ? 18 : 8, 0.15), 0.28);
  // The kalasha — brass, as a village adorns its temple when it can.
  const kalasha = turned([
    [0.001, 0], [0.26, 0], [0.3, 0.04], [0.42, 0.2], [0.45, 0.3], [0.4, 0.45], [0.22, 0.58], [0.16, 0.64], [0.27, 0.7, 1], [0.27, 0.75, 1], [0.12, 0.79],
    [0.1, 0.88], [0.16, 0.96], [0.12, 1.04], [0.045, 1.28], [0.001, 1.36],
  ], lvl === 0 ? 24 : 12);
  b.add('brass', kalasha.translate(s.cx, y, s.cz));
  // The flagstaff rises through the kalasha's tip.
  const staff = turned([[0.045, 0], [0.04, 0.4], [0.032, 3.4], [0.06, 3.42, 1], [0.06, 3.5, 1], [0.001, 3.6]], lvl === 0 ? 8 : 5, 1);
  b.add('teak', fill(staff.translate(s.cx, y + 1.0, s.cz), '#4a3322'));
  return new Vector3(s.cx, y + 4.4, s.cz);
}

function sukanasa(b: Batch, mb: MatBatch, carved: Material, s: SpireSpec, lvl: 0 | 1): void {
  const y0 = s.base - 0.05;
  const y1 = s.base + 3.3;
  const zf = s.cz + s.b0 + 0.78;
  const zb = s.cz + s.b0 - 0.6;
  const w0 = 1.42;
  const w1 = 1.02;
  const P = (x: number, y: number, z: number) => new Vector3(s.cx + x, y, z);
  const sheet = new Sheet();
  // Sides, leaning in as they rise, and the flat top.
  sheet.quad(P(w0, y0, zf), P(w0, y0, zb), P(w1, y1, zb), P(w1, y1, zf), undefined, 0.9);
  sheet.quad(P(-w0, y0, zb), P(-w0, y0, zf), P(-w1, y1, zf), P(-w1, y1, zb), undefined, 0.9);
  sheet.quad(P(-w1 - 0.06, y1, zf + 0.06), P(w1 + 0.06, y1, zf + 0.06), P(w1 + 0.06, y1, zb), P(-w1 - 0.06, y1, zb), undefined, 1.05);
  // The cornice lip over the arch.
  sheet.quad(P(-w1 - 0.06, y1 - 0.12, zf + 0.06), P(w1 + 0.06, y1 - 0.12, zf + 0.06), P(w1 + 0.06, y1, zf + 0.06), P(-w1 - 0.06, y1, zf + 0.06), undefined, 0.95);
  sheet.quad(P(-w1 - 0.06, y1 - 0.12, zf), P(w1 + 0.06, y1 - 0.12, zf), P(w1 + 0.06, y1 - 0.12, zf + 0.06), P(-w1 - 0.06, y1 - 0.12, zf + 0.06), undefined, 0.7);
  const face = [P(-w0, y0, zf), P(w0, y0, zf), P(w1, y1 - 0.12, zf), P(-w1, y1 - 0.12, zf)] as const;
  if (lvl === 0) {
    const [u0, u1] = PANEL.arch;
    const [v0, v1] = stripV('panel');
    const arch = new Sheet().quad(face[0], face[1], face[2], face[3], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    mb.add(carved, arch.build(s.stone, { grain: 0.03 }));
  } else {
    sheet.quad(face[0], face[1], face[2], face[3]);
  }
  b.add('stone', boxUV(sheet.build(s.stone.clone().multiplyScalar(0.98), { seed: 9 }), 2.6));
  // A small ribbed crest on top.
  const crest = ribbed(turned([[0.14, 0, 1], [0.3, 0.05], [0.36, 0.14], [0.3, 0.24], [0.14, 0.28, 1], [0.001, 0.28]], lvl === 0 ? 32 : 12, 1), lvl === 0 ? 14 : 6, 0.15);
  b.add('stone', fill(crest.translate(s.cx, y1, (zf + zb) / 2 + 0.2), s.stone));
}

// ---- The flag ------------------------------------------------------------------------------------

export interface Flag {
  mesh: Mesh;
  update(time: number): void;
}

/**
 * The bhagwa dhwaj: a swallow-tailed saffron flag on a staff above the kalasha, streaming east on
 * the monsoon's westerly. Its own small mesh so it can ripple (outside the LODs, it never pops).
 */
export function flag(a: ArtContext, staffTop: Vector3): Flag {
  const L = 2.1;
  const H = 1.2;
  const cols = 14;
  const rows = 6;
  const base: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const end = L - 0.34 * L * (1 - Math.abs(2 * v - 1));
    for (let i = 0; i <= cols; i++) base.push((i / cols) * end, (v - 0.5) * H, 0);
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p = j * (cols + 1) + i;
      idx.push(p, p + 1, p + cols + 2, p, p + cols + 2, p + cols + 1);
    }
  }
  const g = new BufferGeometry();
  const pos = new Float32BufferAttribute(base.slice(), 3);
  g.setAttribute('position', pos);
  const uvs: number[] = [];
  for (let k = 0; k < base.length; k += 3) uvs.push(base[k] / 0.9, base[k + 1] / 0.9);
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  const colours: number[] = [];
  const saffron = new Color(TONE.saffronCloth);
  for (let k = 0; k < base.length; k += 3) {
    // A darker hem band along the edges, and sun-faded near the staff.
    const edge = Math.abs(base[k + 1]) > H / 2 - 0.07 ? 0.78 : 1;
    const c = saffron.clone().multiplyScalar(edge * (0.92 + 0.1 * (base[k] / L)));
    colours.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new Float32BufferAttribute(colours, 3));
  g.computeVertexNormals();
  const mat = a.kit.custom('temple:flag', () => {
    const f = a.bank.set('Fabric061');
    return new MeshStandardMaterial({ map: f.map, normalMap: f.normalMap, roughness: 0.9, vertexColors: true, side: DoubleSide });
  });
  const mesh = new Mesh(g, mat);
  mesh.name = 'temple:flag';
  mesh.castShadow = true;
  mesh.position.set(staffTop.x + 0.04, staffTop.y - H / 2 - 0.1, staffTop.z);
  // Streaming east-north-east, broadside to the village.
  mesh.rotation.y = 0.18;
  return {
    mesh,
    update(time: number) {
      for (let k = 0, n = 0; k < base.length; k += 3, n++) {
        const x = base[k];
        const t = x / L;
        const wave = Math.sin(x * 3.1 - time * 4.6) * 0.16 + Math.sin(x * 5.3 - time * 7.1 + base[k + 1] * 2) * 0.05;
        pos.setXYZ(n, x - t * t * 0.08, base[k + 1] - t * t * 0.12 + wave * 0.25 * t, wave * t);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
    },
  };
}

// ---- Noise ---------------------------------------------------------------------------------------

function hash1(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 1D value noise, 0..1. */
function vnoise(t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const e = f * f * (3 - 2 * f);
  return hash1(i) * (1 - e) + hash1(i + 1) * e;
}
