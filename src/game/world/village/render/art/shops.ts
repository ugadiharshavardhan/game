/**
 * The two shops on the main road: Ganesh Kirana (the general store) and Laxmi Mithai (sweets).
 *
 * Anatomy of a village shopfront on the Deccan, bottom to top:
 *   Shahabad-stone plinth · lime-washed walls with a geru dado · an open front the full width of
 *   the shop, a shallow lit interior behind the counter (the collider is the whole box — nobody
 *   walks in) · rolled-up steel shutter in its housing · counter (wooden for the kirana, a glass
 *   showcase for the mithai shop) · awning on two posts: rusting corrugated tin with a blue tarp,
 *   or striped canvas with a scalloped valance · painted signboard, Marathi above English ·
 *   flat roof with a cornice band and parapet · a festival toran across the opening.
 *
 * Two levels of detail: the full shop (shelves, goods, garlands) and a shell for distance. The
 * goods themselves live in shops.goods.ts.
 */
import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three';
import { shopDims, type ShopDims } from '../../dims';
import type { ShopDef } from '../../types';
import { rng, signboard } from './canvasTextures';
import { Batch, beam, box, catenary, fill, slab, weather } from './geom';
import { DADO_PAINT, TONE, WALL_PAINT } from './palette';
import { featureRoot, framer, garland, hashId, lodOf, Merge, rod, sheet, valance } from './props.parts';
import type { ArtContext } from './runtime';
import { kiranaFront, mithaiFront, type Lights } from './shops.goods';

/** LOD switch distances, metres. */
const LOD1 = 40;
const HIDE = 150;

/** Every measurement of a shop, in its local frame (door side = +z). Shared with shops.goods.ts. */
export interface ShopFrame {
  s: ShopDef;
  d: ShopDims;
  /** Outer wall half-extents — exactly the collider's. */
  hw: number;
  hd: number;
  /** Top of the plinth (the shop floor), top of the walls, top of the parapet. */
  floor: number;
  roofY: number;
  top: number;
  /** Half-width and head of the open shopfront. */
  ox: number;
  openTop: number;
  /** Face of the interior's back wall. */
  backZ: number;
  /** Counter: half-width, back and front faces, height. */
  cx: number;
  cz0: number;
  cz1: number;
  ch: number;
  /** Awning: high edge at the wall, posts, low front edge. */
  awY0: number;
  poleZ: number;
  poleXs: number[];
  poleH: number;
  edgeZ: number;
  edgeY: number;
  /** Height of the awning's top surface at local z. */
  awningAt: (z: number) => number;
}

export function frameOf(s: ShopDef): ShopFrame {
  const d = shopDims(s);
  const hd = s.depth / 2 + 0.15;
  const poleZ = s.depth / 2 + d.awningDepth - 0.1;
  const beamTop = d.awningLow + 0.07;
  const slope = (d.awningHigh - beamTop) / (poleZ - hd);
  const edgeZ = poleZ + 0.24;
  const awningAt = (z: number) => d.awningHigh - (z - hd) * slope;
  return {
    s,
    d,
    hw: s.width / 2 + 0.15,
    hd,
    floor: d.plinthH,
    roofY: d.plinthH + d.wallH,
    top: d.wallH + 0.6,
    ox: s.width / 2 - 0.2,
    openTop: 2.7,
    backZ: hd - 1.75,
    cx: (s.width - 0.4) / 2,
    cz0: d.counterFront - d.counterDepth,
    cz1: d.counterFront,
    ch: d.counterH,
    awY0: d.awningHigh,
    poleZ,
    poleXs: [-s.width / 2 + 0.25, s.width / 2 - 0.25],
    poleH: d.awningLow,
    edgeZ,
    edgeY: awningAt(edgeZ),
    awningAt,
  };
}

export function build(a: ArtContext): boolean {
  for (const s of a.layout.shops) buildShop(a, s);
  return true;
}

function buildShop(a: ArtContext, s: ShopDef): void {
  const f = frameOf(s);
  const seed = hashId(s.id);
  const root = featureRoot(`shop:${s.id}`, s.x, s.z, s.rot);
  const w = framer(s.x, s.z, s.rot);

  const lights: Lights = { flames: [], lamps: [] };
  const full = level(a, f, 0, seed, lights);
  const shell = level(a, f, 1, seed, { flames: [], lamps: [] });
  root.add(lodOf([[full, 0], [shell, LOD1]], HIDE));

  // The signboard: its own mesh (painted texture), visible from well down the road.
  const sign = signMesh(a, f);
  root.add(sign);
  a.culler.add(sign, w(0, 0, 0), 110);

  for (const [p, size] of lights.flames) a.flames.add(w(p.x, p.y, p.z), size);
  for (const [p, intensity, colour, dist] of lights.lamps) a.lamps.anchor(w(p.x, p.y, p.z), intensity, colour, dist);
  a.root.add(root);
}

/** One level of detail. 0 = the full shop; 1 = a shell for distance. */
function level(a: ArtContext, f: ShopFrame, lvl: 0 | 1, seed: number, lights: Lights): Group {
  const b = new Batch();
  const glass = new Merge();
  const { s, hw, hd, floor, roofY, top, ox, openTop, backZ } = f;
  const paint = new Color(WALL_PAINT[s.paint]);
  const dado = new Color(DADO_PAINT[s.paint]);
  const H = roofY - floor;
  const T = 0.23;
  const kirana = s.kind === 'kirana';
  const r = rng(seed + lvl);

  // ---- plinth ---------------------------------------------------------------------------------
  b.add('stone', weather(slab('stone', 2 * hw + 0.08, floor, 2 * hd + 0.08, 0, floor / 2, 0, 2), '#a8a294', { ground: 0, splash: 0.3, strength: 0.32 }));

  if (lvl === 1) {
    b.add('plaster', weather(slab('plaster', 2 * hw, top - floor, 2 * hd, 0, floor + (top - floor) / 2, 0, 4), paint, { ground: floor, splash: 1, strength: 0.26, top, topStrength: 0.16, seed }));
    b.add('interior', new PlaneGeometry(2 * ox, openTop - floor).translate(0, floor + (openTop - floor) / 2, hd + 0.01));
    b.add('paint', box('paint', 2 * f.cx, f.ch, f.cz1 - f.cz0, 0, f.ch / 2, (f.cz0 + f.cz1) / 2), kirana ? '#6a4a30' : '#5a3a26');
    const awning = sheet(new Vector3(-s.width / 2 - 0.1, f.awY0, hd), new Vector3(s.width / 2 + 0.1, f.awY0, hd), new Vector3(s.width / 2 + 0.1, f.edgeY, f.edgeZ), new Vector3(-s.width / 2 - 0.1, f.edgeY, f.edgeZ), 0, 1, 1);
    b.add('fabric', awning, kirana ? '#7d7f7c' : '#8a3a2c');
    for (const px of f.poleXs) b.add('paint', new CylinderGeometry(0.055, 0.055, f.poleH, 6).translate(px, f.poleH / 2, f.poleZ), '#3a3230');
    return b.build(a.kit, { name: `shop:${s.id}:lod1`, cast: true });
  }

  // ---- walls ----------------------------------------------------------------------------------
  const wx = { ground: floor, splash: 1.0, strength: 0.26, top: roofY, topStrength: 0.18, seed };
  const wall = (sx: number, sy: number, sz: number, cx: number, cy: number, cz: number) =>
    b.add('plaster', weather(slab('plaster', sx, sy, sz, cx, cy, cz, Math.max(3, Math.round(sy * 1.6))), paint, wx));
  wall(2 * hw, H, T, 0, floor + H / 2, -hd + T / 2);
  for (const sx of [-1, 1]) {
    wall(T, H, 2 * hd - 2 * T, sx * (hw - T / 2), floor + H / 2, 0);
    wall(hw - ox, H, T, sx * (ox + (hw - ox) / 2), floor + H / 2, hd - T / 2);
  }
  wall(2 * ox, roofY - openTop, T, 0, (openTop + roofY) / 2, hd - T / 2);

  // Geru dado and a white trim line, as on the houses.
  const dH = 0.75;
  const dadoPiece = (sx: number, sz: number, cx: number, cz: number) =>
    b.add('plaster', weather(slab('plaster', sx, dH, sz, cx, floor + dH / 2, cz, 2), dado, { ground: floor, splash: 0.5, strength: 0.24, seed }));
  dadoPiece(2 * hw + 0.01, 0.02, 0, -hd - 0.005);
  for (const sx of [-1, 1]) {
    dadoPiece(0.02, 2 * hd + 0.03, sx * (hw + 0.005), 0);
    dadoPiece(hw - ox - 0.01, 0.02, sx * (ox + (hw - ox) / 2 - 0.005), hd + 0.005);
    b.add('plaster', fill(box('plaster', 0.03, 0.05, 2 * hd + 0.05, sx * (hw + 0.012), floor + dH + 0.02, 0), '#ece4d2'));
  }
  b.add('plaster', fill(box('plaster', 2 * hw + 0.03, 0.05, 0.03, 0, floor + dH + 0.02, -hd - 0.012), '#ece4d2'));

  // ---- roof: cornice band, parapet, coping ---------------------------------------------------------
  b.add('plaster', weather(box('plaster', 2 * hw + 0.14, 0.13, 2 * hd + 0.14, 0, roofY + 0.065, 0), TONE.cement, { ground: 0, strength: 0.1 }));
  const pY = roofY + 0.13;
  const pH = top - 0.05 - pY;
  for (const [sx, sz, cx, cz] of [
    [2 * hw, 0.15, 0, hd - 0.075],
    [2 * hw, 0.15, 0, -hd + 0.075],
    [0.15, 2 * hd - 0.3, hw - 0.075, 0],
    [0.15, 2 * hd - 0.3, -hw + 0.075, 0],
  ] as const) {
    b.add('plaster', weather(box('plaster', sx, pH, sz, cx, pY + pH / 2, cz), paint, { ground: pY, splash: 0.3, strength: 0.25, top: top, topStrength: 0.3 }));
    b.add('stone', fill(box('stone', sx + 0.06, 0.06, sz + 0.06, cx, top - 0.02, cz), TONE.cement));
  }

  // ---- the open front: a shallow interior --------------------------------------------------------
  const inner = kirana ? '#c9cfb6' : '#e2d5bf';
  const iw = { ground: floor, splash: 0.6, strength: 0.18, top: openTop, topStrength: 0.35, seed };
  b.add('plaster', weather(slab('plaster', 2 * ox + 0.2, openTop - floor, 0.1, 0, (floor + openTop) / 2, backZ - 0.05, 3), inner, iw));
  for (const sx of [-1, 1]) b.add('plaster', weather(slab('plaster', 0.1, openTop - floor, hd - T - backZ, sx * (ox + 0.05), (floor + openTop) / 2, (backZ + hd - T) / 2, 3), inner, iw));
  b.add('plaster', weather(box('plaster', 2 * ox + 0.2, 0.08, hd - T - backZ, 0, openTop + 0.04, (backZ + hd - T) / 2), '#b9b2a2', { ground: 0, strength: 0 }));
  // Timber floor boards over the plinth inside, worn pale where the shopkeeper stands.
  b.add('wood', weather(box('wood', 2 * ox, 0.03, hd - backZ - 0.02, 0, floor + 0.015, (backZ + hd) / 2 - 0.01), '#7c6248', { ground: 0, strength: 0 }));

  // Rolled-up steel shutter: its housing over the opening, the bottom rail, the guide channels.
  const shutter = kirana ? '#5f716c' : '#6c6f72';
  b.add('paint', weather(box('paint', 2 * ox + 0.14, 0.24, 0.26, 0, 2.74, hd + 0.13), shutter, { ground: 2.62, splash: 0.24, strength: 0.25 }));
  b.add('paint', fill(box('paint', 2 * ox, 0.05, 0.05, 0, 2.6, hd + 0.2), new Color(shutter).multiplyScalar(0.7)));
  for (const hx of [-0.6, 0.6]) b.add('iron', box('paint', 0.1, 0.05, 0.03, hx, 2.56, hd + 0.21));
  for (const sx of [-1, 1]) b.add('paint', weather(box('paint', 0.07, openTop - floor - 0.08, 0.07, sx * (ox - 0.035), floor + (openTop - floor - 0.08) / 2, hd + 0.02), shutter, { ground: floor, splash: 0.6, strength: 0.4 }));

  // ---- awning -------------------------------------------------------------------------------------
  const x0 = -s.width / 2 - 0.1;
  const x1 = s.width / 2 + 0.1;
  if (kirana) tinAwning(b, f, x0, x1, seed);
  else canvasAwning(b, f, x0, x1);
  const postKey = kirana ? 'iron' : 'teak';
  const postCol = kirana ? '#3a3632' : '#5d3f28';
  for (const px of f.poleXs) {
    b.add(postKey, fill(new CylinderGeometry(0.055, 0.06, f.poleH, 8).translate(px, f.poleH / 2, f.poleZ), postCol));
    b.add('stone', weather(box('stone', 0.2, 0.1, 0.2, px, 0.05, f.poleZ), TONE.cement, { ground: 0, splash: 0.1, strength: 0.3 }));
  }
  // Front beam on the posts and rafters back to the wall.
  const beamY = f.poleH + 0.035;
  b.add(postKey, fill(beam(new Vector3(x0 + 0.05, beamY, f.poleZ), new Vector3(x1 - 0.05, beamY, f.poleZ), 0.07, 0.07), postCol));
  for (const rx of [f.poleXs[0], -s.width / 6, s.width / 6, f.poleXs[1]]) {
    b.add(postKey, fill(beam(new Vector3(rx, f.awY0 - 0.045, hd), new Vector3(rx, beamY + 0.005, f.poleZ + 0.05), 0.05, 0.06), postCol));
  }

  // ---- festival toran across the opening, garland on the sign --------------------------------------
  const tz = hd + 0.28;
  const ta = new Vector3(-ox - 0.1, 2.62, tz);
  const te = new Vector3(ox + 0.1, 2.62, tz);
  const pts = catenary(ta, te, 0.12, 40);
  garland(b, pts, { bead: 0.032, every: 2 });
  for (const p of [pts[0], pts[pts.length - 1]]) garland(b, [p, p.clone().setY(p.y - 0.55)], { bead: 0.03 });

  // ---- the shop itself: counter, interior, goods ---------------------------------------------------
  if (kirana) kiranaFront(b, glass, f, r, lights);
  else mithaiFront(b, glass, f, r, lights);

  // Only the building's mass and the awning cast: the goods sit in the shop's own shadow anyway.
  const g = b.build(a.kit, { name: `shop:${s.id}:lod0`, cast: true, noShadow: ['paint', 'brass', 'lamplit', 'wood', 'teak', 'iron', 'interior', 'brick'] });
  const gm = glass.build(glassMaterial(a), `shop:${s.id}:glass`);
  if (gm) g.add(gm);
  return g;
}

// ---- parts ------------------------------------------------------------------------------------

/**
 * Corrugated galvanised tin from the wall down to the front edge — rust streaks down each flute,
 * worse toward the drip edge — with an old blue tarp tied over one end.
 */
function tinAwning(b: Batch, f: ShopFrame, x0: number, x1: number, seed: number): void {
  const pitch = 0.076;
  const amp = 0.013;
  const n = Math.round((x1 - x0) / (pitch / 2));
  const rows = 2;
  const zA = f.hd - 0.02;
  const yA = f.awY0;
  const dz = f.edgeZ - zA;
  const dy = f.edgeY - yA;
  const L = Math.hypot(dz, dy);
  const ny = dz / L;
  const nz = -dy / L;
  const top: number[] = [];
  const under: number[] = [];
  const cTop: number[] = [];
  const cUnder: number[] = [];
  const zinc = new Color('#9a9d9c');
  const rust = new Color('#7a4a2e');
  const tmp = new Color();
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const h = i % 2 ? amp : -amp;
      const y = yA + dy * t + h * ny;
      const z = zA + dz * t + h * nz;
      top.push(x, y, z);
      under.push(x, y - 0.004, z - 0.001);
      const streak = Math.pow(hashRow(i, seed), 3) * (0.25 + 0.75 * t) + (j === rows ? 0.25 : 0);
      tmp.copy(zinc).lerp(rust, Math.min(streak, 0.85)).multiplyScalar(0.82 + hashRow(i * 7 + j, seed) * 0.12);
      cTop.push(tmp.r, tmp.g, tmp.b);
      tmp.multiplyScalar(0.7);
      cUnder.push(tmp.r, tmp.g, tmp.b);
    }
  }
  const idxTop: number[] = [];
  const idxUnder: number[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < n; i++) {
      const p = j * (n + 1) + i;
      const q = p + 1;
      const c = p + n + 1;
      const d = c + 1;
      idxTop.push(p, c, q, q, c, d);
      idxUnder.push(p, q, c, q, d, c);
    }
  const mk = (pos: number[], col: number[], idx: number[]) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  b.add('paint', mk(top, cTop, idxTop));
  b.add('paint', mk(under, cUnder, idxUnder));

  // The tarp: over the left end of the tin, its front hanging down, tied off to the post.
  const tx0 = x0 - 0.05;
  const tx1 = x0 + (x1 - x0) * 0.3;
  const lift = 0.035;
  const tarp = sheet(
    new Vector3(tx0, yA + lift, zA + 0.1),
    new Vector3(tx1, yA + lift, zA + 0.1),
    new Vector3(tx1, f.edgeY + lift, f.edgeZ + 0.04),
    new Vector3(tx0, f.edgeY + lift, f.edgeZ + 0.04),
    -0.03,
    8,
    4,
  );
  b.add('fabric', weather(tarp, '#6a93b8', { ground: f.edgeY, splash: 0.4, strength: 0.2, seed }));
  const flap = sheet(
    new Vector3(tx0, f.edgeY + lift, f.edgeZ + 0.04),
    new Vector3(tx1, f.edgeY + lift, f.edgeZ + 0.04),
    new Vector3(tx1 - 0.06, f.edgeY - 0.18, f.edgeZ + 0.07),
    new Vector3(tx0 + 0.04, f.edgeY - 0.24, f.edgeZ + 0.06),
    0.02,
    6,
    2,
  );
  b.add('fabric', fill(flap, '#6189ad'));
  // A rope from the flap's corner down to the post.
  b.add('paint', rod(new Vector3(tx1 - 0.06, f.edgeY - 0.18, f.edgeZ + 0.07), new Vector3(f.poleXs[0] + 0.05, 1.9, f.poleZ), 0.008, 4), '#b8a37a');
  // Stones on the tin to hold it down in the monsoon wind.
  for (const [sx, st] of [[0.25, 0.35], [0.62, 0.55], [0.85, 0.3]] as const) {
    const x = x0 + (x1 - x0) * sx;
    const z = zA + dz * st;
    const y = yA + dy * st + amp + 0.05;
    const g = new IcosahedronGeometry(0.1, 0).scale(1.2, 0.6, 1);
    b.add('paint', g.translate(x, y, z), '#6f6a62');
  }
}

/** Striped canvas on a teak frame, with a scalloped valance along the front. */
function canvasAwning(b: Batch, f: ShopFrame, x0: number, x1: number): void {
  const stripe = 0.36;
  const n = Math.round((x1 - x0) / stripe);
  const cols = ['#a4443a', '#ead2a4'];
  const zA = f.hd - 0.02;
  for (let i = 0; i < n; i++) {
    const a = x0 + ((x1 - x0) * i) / n;
    const e = x0 + ((x1 - x0) * (i + 1)) / n;
    const g = sheet(new Vector3(a, f.awY0, zA), new Vector3(e, f.awY0, zA), new Vector3(e, f.edgeY, f.edgeZ), new Vector3(a, f.edgeY, f.edgeZ), 0, 1, 4);
    b.add('fabric', weather(g, cols[i % 2], { ground: f.edgeY, splash: 0.5, strength: 0.18, top: f.awY0 + 0.3, topStrength: 0.1 }));
  }
  const scallops = n;
  for (let i = 0; i < scallops; i++) {
    const a = new Vector3(x0 + ((x1 - x0) * i) / scallops, f.edgeY, f.edgeZ);
    const e = new Vector3(x0 + ((x1 - x0) * (i + 1)) / scallops, f.edgeY, f.edgeZ);
    b.add('fabric', fill(valance(a, e, 0.22, 1), cols[i % 2]));
  }
  // A marigold garland swagged along the valance.
  const swags = 4;
  for (let i = 0; i < swags; i++) {
    const a = new Vector3(x0 + 0.1 + ((x1 - x0 - 0.2) * i) / swags, f.edgeY - 0.1, f.edgeZ + 0.03);
    const e = new Vector3(x0 + 0.1 + ((x1 - x0 - 0.2) * (i + 1)) / swags, f.edgeY - 0.1, f.edgeZ + 0.03);
    garland(b, catenary(a, e, 0.2, 24), { bead: 0.03 });
  }
}

function hashRow(i: number, seed: number): number {
  const s = Math.sin(i * 12.9898 + seed * 0.000123) * 43758.5453;
  return s - Math.floor(s);
}

function glassMaterial(a: ArtContext): MeshStandardMaterial {
  return a.kit.custom('shops:glass', () => new MeshStandardMaterial({ color: '#e4f0ee', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 1.6, vertexColors: true }));
}

/** The painted signboard in its teak frame, mounted over the awning. */
function signMesh(a: ArtContext, f: ShopFrame): Group {
  const { s } = f;
  const kirana = s.kind === 'kirana';
  const tex = kirana ? signboard(a.bank, s.id, s.signLocal, s.sign, '#d9aa3e', '#6e1c12') : signboard(a.bank, s.id, s.signLocal, s.sign, '#7a1f1a', '#f1d488');
  const mat = a.kit.custom(`shops:sign-${s.id}`, () => new MeshStandardMaterial({ map: tex, roughness: 0.72, emissive: new Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.16 }));
  const sw = kirana ? 3.9 : 4.3;
  const sh = sw / 4.4;
  const sy = f.awY0 + 0.07 + sh / 2 + 0.04;
  const sz = f.hd + 0.1;
  const g = new Group();
  g.name = `shop:${s.id}:sign`;
  const m = new Merge().add(new PlaneGeometry(sw, sh).translate(0, sy, sz + 0.026)).build(mat, `shop:${s.id}:signboard`);
  if (m) g.add(m);
  // Frame, backing and brackets.
  const b = new Batch();
  const frame = kirana ? '#4a3020' : '#3a2416';
  b.add('teak', fill(box('teak', sw + 0.12, sh + 0.12, 0.05, 0, sy, sz), frame));
  for (const sx of [-1, 1]) b.add('iron', box('paint', 0.04, 0.04, 0.12, sx * (sw / 2 - 0.3), sy + sh / 2 - 0.1, sz - 0.06));
  // A marigold garland across the board's top edge.
  const ga = new Vector3(-sw / 2 - 0.02, sy + sh / 2 + 0.05, sz + 0.05);
  const ge = new Vector3(sw / 2 + 0.02, sy + sh / 2 + 0.05, sz + 0.05);
  const gp = catenary(ga, ge, 0.18, 44);
  garland(b, gp, { bead: 0.03 });
  for (const p of [gp[0], gp[gp.length - 1]]) garland(b, [p, p.clone().setY(p.y - 0.45)], { bead: 0.03 });
  g.add(b.build(a.kit, { name: `shop:${s.id}:signframe`, cast: false }));
  return g;
}
