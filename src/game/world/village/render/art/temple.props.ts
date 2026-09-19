/**
 * The temple's ritual objects and small monuments: the svayambhu Ganesha, samai lamps, bells,
 * marigold garlands and torans, diyas, the deepastambha (lamp tower) and the stone mūshak.
 *
 * All are built at a given position in the temple's frame. `lit(p, size)` registers a flame there
 * (the caller converts to world space and hands it to the shared FlameField).
 */
import { BoxGeometry, BufferAttribute, type BufferGeometry, Color, CylinderGeometry, IcosahedronGeometry, type Material, Matrix4, PlaneGeometry, Quaternion, TorusGeometry, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Batch, box, catenary, fill, lathe, weather } from './geom';
import { TONE } from './palette';
import { type MatBatch, turned } from './temple.geom';

export type Lit = (p: Vector3, size?: number) => void;

/** Deccan basalt and the oil-darkened stone of a sanctum. */
export const BASALT = '#7b7169';
export const BASALT_DARK = '#58504a';

// ---- Small things ---------------------------------------------------------------------------------

const DIYA = [[0.001, 0], [0.045, 0.005], [0.065, 0.025], [0.07, 0.04], [0.055, 0.035], [0.001, 0.02]] as [number, number][];

/** A clay diya with its flame. */
export function diya(b: Batch, lit: Lit, x: number, y: number, z: number, burning = true): void {
  b.add('paint', lathe(DIYA, 10).translate(x, y, z), '#9c4a2a');
  if (burning) lit(new Vector3(x, y + 0.04, z));
}

/** Marigolds strung along points: orange and yellow, a mango leaf every few flowers if `leaves`. */
export function marigolds(b: Batch, pts: readonly Vector3[], r = 0.04, leaves = false): void {
  pts.forEach((p, i) => {
    b.add('paint', new IcosahedronGeometry(r, 0).translate(p.x, p.y, p.z), i % 3 === 2 ? TONE.marigoldYellow : TONE.marigold);
    if (leaves && i % 3 === 0) b.add('paint', new BoxGeometry(r * 1.2, r * 3.8, 0.006).translate(p.x, p.y - r * 2.6, p.z + 0.01), i % 2 ? TONE.mangoLeaf : '#4f7d2e');
  });
}

/** A swag of marigolds between two points, with a strand hanging at each end. */
export function festoon(b: Batch, a: Vector3, e: Vector3, sag: number, r = 0.04, leaves = false, tails = 6): void {
  const n = Math.max(6, Math.round(a.distanceTo(e) / (r * 1.7)));
  marigolds(b, catenary(a, e, sag, n), r, leaves);
  for (const p of [a, e]) marigolds(b, Array.from({ length: tails }, (_, k) => new Vector3(p.x, p.y - (k + 1) * r * 1.6, p.z)), r * 0.95);
}

/** A brass bell hanging from a chain whose top is at (x, top, z). */
export function bell(b: Batch, x: number, top: number, z: number, size: number, chain: number): void {
  const s = size;
  const g = lathe([
    [0.001, 0.2 * s], [0.08 * s, 0.17 * s], [0.12 * s, 0.03 * s], [0.14 * s, 0], [0.15 * s, 0.012 * s], [0.13 * s, 0.07 * s], [0.1 * s, 0.19 * s],
    [0.075 * s, 0.26 * s], [0.035 * s, 0.3 * s], [0.02 * s, 0.34 * s], [0.001, 0.35 * s],
  ], 14);
  const y = top - chain - 0.35 * s;
  b.add('brass', g.translate(x, y, z));
  b.add('brass', new IcosahedronGeometry(0.03 * s, 1).translate(x, y - 0.02 * s, z));
  for (let k = 0; k < Math.floor(chain / 0.05); k++) {
    b.add('iron', new TorusGeometry(0.018, 0.005, 4, 8).rotateY((k % 2) * Math.PI * 0.5).translate(x, top - 0.025 - k * 0.05, z));
  }
}

/** A brass samai: a tall standing lamp, its bowl with five wicks. */
export function samai(b: Batch, lit: Lit, x: number, y: number, z: number, h = 1): void {
  const g = turned([
    [0.001, 0], [0.16, 0], [0.17, 0.02, 1], [0.15, 0.05], [0.1, 0.09], [0.06, 0.13], [0.035, 0.18], [0.03, 0.3], [0.048, 0.32], [0.03, 0.34],
    [0.028, 0.55], [0.05, 0.57], [0.03, 0.6], [0.06, 0.62], [0.15, 0.66], [0.2, 0.7, 1], [0.185, 0.705, 1], [0.12, 0.685], [0.03, 0.68],
    [0.024, 0.7], [0.024, 0.9], [0.05, 0.92], [0.028, 0.95], [0.06, 0.99], [0.03, 1.05], [0.001, 1.12],
  ], 16);
  b.add('brass', g.scale(h, h, h).translate(x, y, z));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 10;
    const px = x + Math.sin(a) * 0.205 * h;
    const pz = z + Math.cos(a) * 0.205 * h;
    b.add('brass', new BoxGeometry(0.04, 0.02, 0.06).rotateY(a).translate(px, y + 0.7 * h, pz));
    lit(new Vector3(px, y + 0.71 * h, pz), 1.05);
  }
}

// ---- The svayambhu Ganesha ------------------------------------------------------------------------

export interface DeityMats {
  sindoor: Material;
  basalt: Material;
}

/**
 * The mūrti as village shrines keep him: a rounded, self-manifest stone thick with sindoor, on a
 * stepped pitha, a brass prabhavali behind, a red cloth, a marigold garland and offerings before
 * him. No sculpted face or figure — the stone itself is the presence. Faces +z; (x, y, z) is the
 * floor at the front of the pitha.
 */
export function deity(b: Batch, mb: MatBatch, m: DeityMats, x: number, y: number, z: number): { heart: Vector3 } {
  // Pitha: two stepped slabs of oiled basalt.
  mb.add(m.basalt, box('stone', 1.2, 0.2, 0.9, x, y + 0.1, z - 0.45), undefined, BASALT_DARK);
  mb.add(m.basalt, box('stone', 1.0, 0.16, 0.72, x, y + 0.28, z - 0.5), undefined, BASALT_DARK);
  const top = y + 0.36;
  const cz = z - 0.52;

  // The stone: a lumpy, broad-based ovoid, deformed from a sphere.
  const g = smoothSphere(3);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const sindoor = new Color(TONE.sindoor);
  const d = new Vector3();
  const lobe = new Vector3(-0.3, -0.25, 1).normalize();
  let minY = Infinity;
  for (let i = 0; i < pos.count; i++) {
    d.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const lump = 0.06 * Math.sin(d.x * 5.1 + d.y * 2.3) * Math.sin(d.z * 4.3 - d.y * 3.1) + 0.04 * Math.sin(d.x * 9.7 + d.z * 7.9 + d.y * 5.3);
    const swell = 0.07 * Math.exp(-d.distanceToSquared(lobe) / 0.12);
    const broad = 1 + 0.2 * Math.max(0, -d.y);
    const r = 1 + lump + swell;
    const py = Math.max(d.y * r * 0.4, -0.3);
    pos.setXYZ(i, d.x * r * 0.33 * broad, py, d.z * r * 0.26 * broad);
    minY = Math.min(minY, py);
    // Sindoor lies thick on the bulges, thinner and oil-dark in the hollows and at the base.
    const k = (0.82 + lump * 2.2 + swell) * (d.y < -0.5 ? 0.8 : 1);
    col.set([sindoor.r * k, sindoor.g * k * 0.95, sindoor.b * k], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.computeVertexNormals();
  mb.add(m.sindoor, g.translate(x, top - minY - 0.02, cz));
  const heart = new Vector3(x, top + 0.4, cz);

  // The red cloth wrapped at his base, with a zari border.
  b.add('fabric', fill(lathe([[0.36, 0], [0.4, 0.03], [0.39, 0.16], [0.34, 0.24], [0.3, 0.26]], 20).scale(1, 1, 0.82).translate(x, top, cz), '#8a1c16'));
  b.add('brass', new TorusGeometry(0.315, 0.012, 4, 24).rotateX(Math.PI / 2).scale(1, 1, 0.82).translate(x, top + 0.25, cz));

  // Brass prabhavali: an arch of flames behind him.
  const arch = new TorusGeometry(0.6, 0.03, 6, 28, Math.PI * 1.15).rotateZ(-Math.PI * 0.075);
  b.add('brass', arch.translate(x, top + 0.5, cz - 0.36));
  for (const sx of [-1, 1]) b.add('brass', new CylinderGeometry(0.03, 0.035, 0.55, 8).translate(x + sx * 0.6, top + 0.24, cz - 0.36));
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI * 0.075 + (i / 12) * Math.PI * 1.15;
    const cone = new CylinderGeometry(0, 0.035, 0.12, 5).translate(0, 0.66, 0).rotateZ(a - Math.PI / 2);
    b.add('brass', cone.translate(x, top + 0.5, cz - 0.36));
  }

  // Marigold garland over his shoulders: two strands, orange and yellow.
  for (const [k, c, drop] of [[0, TONE.marigold, 0.34], [1, TONE.marigoldYellow, 0.44]] as const) {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 22; i++) {
      const t = i / 22;
      pts.push(new Vector3(x - 0.3 + 0.6 * t, top + 0.66 - drop * Math.sin(Math.PI * t), cz + 0.12 + 0.17 * Math.sin(Math.PI * t) + k * 0.02));
    }
    for (const p of pts) b.add('paint', new IcosahedronGeometry(0.036, 0).translate(p.x, p.y, p.z), c);
  }

  // Offerings on the pitha's lower step: a banana leaf with modak, hibiscus, durva and a coconut.
  const fy = y + 0.2;
  b.add('paint', new PlaneGeometry(0.46, 0.22).rotateX(-Math.PI / 2).rotateY(0.15).translate(x - 0.22, fy + 0.005, z - 0.1), '#4f7d2e');
  const modak = lathe([[0.001, 0], [0.04, 0.005], [0.045, 0.03], [0.03, 0.06], [0.001, 0.085]], 8);
  for (const [mx, mz] of [[-0.34, -0.1], [-0.25, -0.13], [-0.16, -0.08], [-0.26, -0.04], [-0.25, -0.09]]) {
    b.add('paint', modak.clone().translate(x + mx, fy + (mx === -0.25 && mz === -0.09 ? 0.05 : 0.008), z + mz), '#efe3c4');
  }
  modak.dispose();
  for (const [hx, hz] of [[0.12, -0.08], [0.2, -0.14], [0.28, -0.06]]) {
    b.add('paint', new IcosahedronGeometry(0.045, 0).scale(1, 0.45, 1).translate(x + hx, fy + 0.02, z + hz), '#c11a2a');
    b.add('paint', new IcosahedronGeometry(0.012, 0).translate(x + hx, fy + 0.045, z + hz), TONE.marigoldYellow);
  }
  for (let i = 0; i < 9; i++) b.add('paint', new BoxGeometry(0.006, 0.09, 0.006).rotateZ((i - 4) * 0.12).translate(x + 0.38 + i * 0.006, fy + 0.045, z - 0.2), '#5f8f36');
  b.add('paint', new IcosahedronGeometry(0.09, 1).scale(1, 0.85, 1).translate(x + 0.36, fy + 0.08, z - 0.34), '#6b4a2c');
  return { heart };
}

// ---- Deepastambha ---------------------------------------------------------------------------------

/**
 * The lamp tower of Maharashtra's temples: an octagonal plinth, a tapering basalt shaft ringed
 * with rows of stone lamp-brackets, each holding a diya, and a lamp bowl on top. (x, z) is its axis.
 */
export function deepastambha(b: Batch, mb: MatBatch, basalt: Material, lit: Lit, x: number, z: number, lvl: 0 | 1): void {
  const stone = new Color(BASALT);
  const add = (g: BufferGeometry) => b.add('stone', weather(g, stone, { ground: 0, splash: 0.6, strength: 0.25 }));
  add(new CylinderGeometry(0.55, 0.57, 0.34, 8).translate(x, 0.17, z));
  add(new CylinderGeometry(0.49, 0.5, 0.22, 8).rotateY(Math.PI / 8).translate(x, 0.45, z));
  const rows = 7;
  const rowY = (k: number) => 1.2 + k * 0.46;
  const rAt = (y: number) => 0.42 - (0.12 * (y - 0.56)) / 3.7;
  const prof: [number, number, number?][] = [[0.47, 0.56, 1], [0.44, 0.62], [0.43, 0.7]];
  for (let k = 0; k < rows; k++) {
    const y = rowY(k);
    prof.push([rAt(y - 0.06), y - 0.06], [rAt(y) + 0.035, y - 0.03], [rAt(y) + 0.035, y + 0.03], [rAt(y + 0.06), y + 0.06]);
  }
  prof.push([rAt(4.26), 4.26], [0.36, 4.3, 1], [0.4, 4.34], [0.4, 4.46, 1], [0.001, 4.46]);
  const shaft = turned(prof, lvl === 0 ? 20 : 10, 1.3);
  if (lvl === 0) mb.add(basalt, shaft.translate(x, 0, z), undefined, BASALT);
  else add(shaft.translate(x, 0, z));
  // Crown: a turned kalash carrying the tower's biggest lamp.
  const crown = turned([[0.001, 4.46], [0.22, 4.46], [0.26, 4.52], [0.2, 4.64], [0.12, 4.72], [0.1, 4.8], [0.2, 4.86], [0.26, 4.95, 1], [0.2, 4.96], [0.001, 4.93]], lvl === 0 ? 16 : 8, 1);
  add(crown.translate(x, 0, z));
  if (lvl === 1) return;
  lit(new Vector3(x, 4.96, z), 1.8);
  // Rows of brackets, each ring turned half a step from the last.
  const arm = box('stone', 0.07, 0.07, 0.2, 0, 0, 0.1);
  const cup = lathe([[0.001, -0.03], [0.04, -0.02], [0.06, 0.02], [0.065, 0.035], [0.05, 0.03], [0.001, 0.015]], 8);
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  for (let k = 0; k < rows; k++) {
    const y = rowY(k);
    const r = rAt(y);
    for (let i = 0; i < 8; i++) {
      const a = ((i + (k % 2) * 0.5) / 8) * Math.PI * 2;
      const m = new Matrix4().compose(new Vector3(x + Math.sin(a) * (r - 0.02), y, z + Math.cos(a) * (r - 0.02)), q.setFromAxisAngle(up, a), new Vector3(1, 1, 1));
      b.add('stone', fill(arm.clone(), BASALT_DARK), m.clone().multiply(new Matrix4().makeRotationX(-0.25)));
      const tip = new Vector3(x + Math.sin(a) * (r + 0.19), y + 0.06, z + Math.cos(a) * (r + 0.19));
      b.add('paint', cup.clone().translate(tip.x, tip.y, tip.z), '#9c4a2a');
      // Most are lit; a few near the top are still waiting for the lamp-lighter.
      if (k < 5 || (i + k) % 3 !== 0) lit(new Vector3(tip.x, tip.y + 0.04, tip.z));
    }
  }
  arm.dispose();
  cup.dispose();
}

// ---- The mūshak ---------------------------------------------------------------------------------

/**
 * Ganesha's vahana: a small stone mouse on a moulded pedestal, sitting up with a modak in its
 * paws, facing the sanctum (−z). Oiled basalt, a sindoor mark and a marigold garland.
 * (x, z) is the pedestal's centre; its collider is 0.8 × 1.0 × 0.9 m.
 */
export function mushak(b: Batch, mb: MatBatch, basalt: Material, x: number, z: number, lvl: 0 | 1): Vector3 {
  const stone = new Color(BASALT);
  const add = (g: BufferGeometry) => b.add('stone', weather(g, stone, { ground: 0, splash: 0.5, strength: 0.25 }));
  add(box('stone', 0.86, 0.16, 0.96, x, 0.08, z));
  add(box('stone', 0.8, 0.06, 0.9, x, 0.19, z));
  add(box('stone', 0.74, 0.58, 0.84, x, 0.51, z));
  add(box('stone', 0.8, 0.06, 0.9, x, 0.83, z));
  add(box('stone', 0.84, 0.11, 0.94, x, 0.915, z));
  add(box('stone', 0.78, 0.03, 0.88, x, 0.985, z));
  if (lvl === 1) return new Vector3(x, 1, z);
  const y = 1.0;
  const fine = smoothSphere(2);
  const coarse = smoothSphere(1);
  const ell = (rx: number, ry: number, rz: number, px: number, py: number, pz: number, rotX = 0, g = fine) =>
    mb.add(basalt, g.clone().scale(rx, ry, rz).rotateX(rotX).translate(x + px, y + py, z + pz), undefined, BASALT_DARK);
  // Haunches, body leaning up, head and snout toward −z.
  ell(0.17, 0.13, 0.19, 0, 0.12, 0.06);
  ell(0.13, 0.17, 0.12, 0, 0.25, -0.06, 0.35);
  ell(0.085, 0.085, 0.12, 0, 0.4, -0.15, -0.25);
  mb.add(basalt, new CylinderGeometry(0.0, 0.05, 0.12, 8).rotateX(-Math.PI / 2 - 0.3).translate(x, y + 0.37, z - 0.3), undefined, BASALT_DARK);
  for (const sx of [-1, 1]) {
    // Ears, feet and the forepaws around the modak.
    mb.add(basalt, new CylinderGeometry(0.05, 0.05, 0.015, 12).rotateZ(Math.PI / 2).rotateY(sx * 0.4).translate(x + sx * 0.07, y + 0.49, z - 0.1), undefined, BASALT_DARK);
    ell(0.05, 0.035, 0.09, sx * 0.11, 0.03, -0.1);
    ell(0.03, 0.06, 0.03, sx * 0.05, 0.25, -0.15, 0.6);
  }
  b.add('paint', lathe([[0.001, 0], [0.04, 0.005], [0.045, 0.03], [0.03, 0.06], [0.001, 0.085]], 8).translate(x, y + 0.2, z - 0.2), '#efe3c4');
  // The tail curling round onto the pedestal.
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    ell(0.02 - t * 0.008, 0.02 - t * 0.008, 0.035, Math.sin(t * 2.2) * 0.2, 0.02, 0.22 - Math.cos(t * 2.2) * 0.04 + t * 0.05, 0, coarse);
  }
  fine.dispose();
  coarse.dispose();
  // Devotion: a sindoor mark on the brow, a garland round the neck, a few flowers at the feet.
  b.add('paint', new IcosahedronGeometry(0.03, 1).scale(1, 0.7, 0.4).translate(x, y + 0.47, z - 0.22), TONE.sindoor);
  const ring: Vector3[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ring.push(new Vector3(x + Math.sin(a) * 0.11, y + 0.3 - Math.cos(a) * 0.04, z - 0.08 + Math.cos(a) * 0.09));
  }
  marigolds(b, ring, 0.028);
  for (const [fx, fz] of [[-0.28, -0.32], [0.26, -0.3], [0.3, 0.3], [-0.3, 0.28]]) b.add('paint', new IcosahedronGeometry(0.035, 0).scale(1, 0.6, 1).translate(x + fx, y + 0.02, z + fz), fx < 0 ? TONE.marigold : '#c11a2a');
  return new Vector3(x, y, z);
}

/** A brass lamp hanging from the mandapa ceiling on a chain, five wicks lit. */
export function hangingLamp(b: Batch, lit: Lit, x: number, ceiling: number, z: number, drop: number): void {
  const y = ceiling - drop;
  for (let k = 0; k < Math.floor((drop - 0.1) / 0.06); k++) b.add('brass', new TorusGeometry(0.02, 0.006, 4, 8).rotateY((k % 2) * Math.PI * 0.5).translate(x, ceiling - 0.03 - k * 0.06, z));
  b.add('brass', turned([[0.001, -0.12], [0.03, -0.1], [0.06, -0.04], [0.19, 0.02], [0.21, 0.05, 1], [0.19, 0.055, 1], [0.05, 0.03], [0.02, 0.05], [0.02, 0.12], [0.04, 0.14], [0.001, 0.16]], 16).translate(x, y, z));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    lit(new Vector3(x + Math.sin(a) * 0.2, y + 0.06, z + Math.cos(a) * 0.2));
  }
}

/** A unit sphere with shared vertices, so it shades smooth when squashed into stone forms. */
export function smoothSphere(detail: number): BufferGeometry {
  const g = new IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g);
  g.dispose();
  m.computeVertexNormals();
  return m;
}
