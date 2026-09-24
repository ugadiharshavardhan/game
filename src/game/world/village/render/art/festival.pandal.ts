/**
 * The Ganeshotsav pandal on the festival ground, on the evening Bappa comes home.
 *
 * Anatomy, outside in: six bamboo poles lashed to tie beams, rafters and a ridge · a tented
 * shamiana roof in saffron and maroon stripes, sagging between the rafters, edged with a scalloped
 * valance and gilt tassels · the mandal's name board over the entrance, a toran of mango leaves and
 * marigold swags beneath it, banana plants tied to the entrance posts, saffron flags above ·
 * striped kanaat walls along the sides · inside, a durrie on the ground, a cloth-skirted stage, the
 * painted backdrop between saffron drapes with a real marigold garland round its halo, and on the
 * stage Bappa himself — arrived and seated on the draped chowki, his face still veiled in silk until
 * the installation — with the kalash, two brass samai and a row of diyas.
 *
 * Collision parity: the stage (7 × 0.7 × 2.5 m), the six poles and the two side walls are the
 * solids in solids.ts → landmarkSolids('pandal'); everything else is overhead or soft cloth.
 */
import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import type { LandmarkDef } from '../../types';
import { rng } from './canvasTextures';
import { clothGrid, pleated, tassel, valance } from './festival.cloth';
import { atlasPlane, bamboo, FestBatch, lashing, type Ornaments, rope } from './festival.kit';
import { basket, diya, flowerHeap, heap, hibiscus, kalash, MARIGOLDS, samai, thali, vati } from './festival.things';
import { box, catenary, lathe, place, tri } from './geom';
import { TONE } from './palette';
import type { ArtContext } from './runtime';

/** Pole lines (local): x ±HW, z ±HD, and a middle pair at z = 0. */
const HW = 4.5;
const HD = 3.5;
/** Pole tops, where the roof cloth leaves the eave plates. */
const EAVE = 4.2;
const RIDGE = 5.9;
/** Roof overhang past the side poles, and past the front and back pole lines. */
const OVER = 0.35;
const ZE = HD + 0.3;
const SLOPE = (RIDGE - EAVE) / HW;
/** The cloth rides this far above the rafters' centre lines. */
const LIFT = 0.07;
const EDGE_Y = RIDGE + LIFT - (HW + OVER) * SLOPE - 0.05;
const STAGE_H = 0.7;
const STAGE_FRONT = -1.0;
const STAGE_BACK = -3.5;
/** The painted backdrop: bottom edge and size. Its halo centre sits where the idol's head will. */
const BD = { y0: 0.85, w: 4.2, h: 3.15, z: STAGE_BACK + 0.04 };
const HALO_Y = BD.y0 + BD.h * (1 - 0.58);

const C = {
  saffron: '#e8842a',
  maroon: '#7a1f28',
  deepMaroon: '#5a1520',
  cream: '#e9dec4',
  gold: '#d7a443',
  silk: '#b01e28',
  rice: '#ece3c8',
};

export function buildPandal(a: ArtContext, l: LandmarkDef, orn: Ornaments): void {
  const root = new Group();
  root.name = 'festival:pandal';
  root.position.set(l.x, 0, l.z);
  root.rotation.y = l.rot;
  const M = new Matrix4().compose(root.position, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), l.rot), new Vector3(1, 1, 1));
  const W = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(M);
  const Wp = (pts: Vector3[]) => pts.map((p) => p.clone().applyMatrix4(M));

  const b = new FestBatch();
  frame(b);
  roof(b);
  walls(b);
  front(b, orn, W, Wp);
  backdrop(b, orn, Wp);
  stageStructure(b);
  carpet(b);
  lights(orn, Wp);
  root.add(b.build(a, { name: 'festival:pandal', cast: true, noShadow: ['brass'] }));

  // The stage's puja things: small, unshadowed, culled with distance.
  const d = new FestBatch();
  stageThings(a, d, orn, M);
  const detail = d.build(a, { name: 'festival:pandal:stage', cast: false });
  root.add(detail);
  a.culler.add(detail, W(0, 0, -2), 48);

  // The samai's glow on the stage, and the bulbs' warmth at the entrance.
  a.lamps.anchor(W(0, 1.5, -1.7), 2.6, '#ffa650', 7);
  a.lamps.anchor(W(0, 3.3, HD + 0.6), 1.5, '#ffc27a', 9);
  a.root.add(root);
}

// ---- Frame ------------------------------------------------------------------------------------

function frame(b: FestBatch): void {
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
  let seed = 1;
  const pole = (p: Vector3, q: Vector3, r: number) => b.add('paint', bamboo(p, q, r, seed++));
  for (const px of [-HW, HW]) {
    for (const pz of [-HD, 0, HD]) {
      // The entrance poles rise past the roof to carry the name board and the flags.
      pole(V(px, 0, pz), V(px, pz === HD ? 5.6 : EAVE + 0.04, pz), 0.08);
      b.add('paint', lashing(V(px, EAVE - 0.18, pz), 0.08), '#5a4630');
      // Knee braces from pole to tie beam.
      pole(V(px, 3.35, pz), V(px * 0.8, 4.0, pz), 0.035);
    }
  }
  for (const pz of [-HD, 0, HD]) {
    // Tie beam, rafters, king post.
    pole(V(-HW - 0.22, 4.02, pz), V(HW + 0.22, 4.02, pz), 0.06);
    for (const s of [-1, 1]) pole(V(s * (HW + OVER), RIDGE - (HW + OVER) * SLOPE, pz), V(0, RIDGE, pz), 0.05);
    pole(V(0, 4.02, pz), V(0, RIDGE - 0.02, pz), 0.045);
    b.add('paint', lashing(V(0, RIDGE - 0.08, pz), 0.05), '#5a4630');
  }
  // Ridge, eave plates, and the rails the kanaat walls hang from.
  pole(V(0, RIDGE - 0.02, -ZE), V(0, RIDGE - 0.02, ZE), 0.06);
  for (const s of [-1, 1]) {
    pole(V(s * HW, 4.12, -ZE + 0.05), V(s * HW, 4.12, ZE - 0.05), 0.06);
    pole(V(s * HW, 2.82, -HD), V(s * HW, 2.82, 1.78), 0.035);
    // Mid-slope purlins.
    pole(V(s * HW * 0.5, RIDGE - HW * 0.5 * SLOPE - 0.01, -ZE + 0.1), V(s * HW * 0.5, RIDGE - HW * 0.5 * SLOPE - 0.01, ZE - 0.1), 0.04);
  }
  // A short staff on the ridge for the flag, and a brass finial.
  pole(V(0, RIDGE, ZE - 0.12), V(0, RIDGE + 1.25, ZE - 0.12), 0.03);
  b.add('brass', lathe([[0.001, 0], [0.05, 0.02], [0.07, 0.07], [0.04, 0.12], [0.02, 0.14], [0.03, 0.17], [0.001, 0.24]], 12).translate(0, RIDGE + 0.06, ZE + 0.02));
}

// ---- Roof -------------------------------------------------------------------------------------

/**
 * How far the roof cloth sags below its rafters at (z, s): s runs 0 (ridge) → 1 (eave edge).
 * Tied along the ridge, the eave plates and each truss; it bellies in the panels between and
 * droops a little where it overhangs.
 */
function sag(z: number, s: number): number {
  const sE = HW / (HW + OVER);
  const az = Math.abs(z);
  const tz = az <= HD ? Math.abs(Math.sin((Math.PI * (z + HD)) / HD)) : 0;
  const ts = s <= sE ? Math.sin((Math.PI * s) / sE) : 0;
  const droop = s > sE ? (s - sE) / (1 - sE) : 0;
  const over = az > HD ? (az - HD) / (ZE - HD) : 0;
  return 0.16 * tz * ts + 0.05 * droop + 0.035 * over * (ts + droop);
}

function roof(b: FestBatch): void {
  const saffron = new Color(C.saffron);
  const maroon = new Color(C.maroon);
  const stripe = 2 * ZE / 20;
  for (const sd of [-1, 1]) {
    const P = (u: number, v: number) => {
      const z = sd > 0 ? -ZE + 2 * ZE * u : ZE - 2 * ZE * u;
      const run = v * (HW + OVER);
      return new Vector3(sd * run, RIDGE + LIFT - run * SLOPE - sag(z, v), z);
    };
    b.add('cloth', clothGrid(20, 8, P, (i) => {
      const z = P((i + 0.5) / 20, 0).z;
      return Math.floor((z + ZE) / stripe) % 2 ? maroon : saffron;
    }, [2 * ZE, (HW + OVER) / Math.cos(Math.atan(SLOPE))]));
  }
  // Gable ends: maroon with a saffron field.
  const apex = RIDGE + LIFT;
  const half = HW + OVER;
  for (const s of [-1, 1]) {
    const z = s * (ZE - 0.02);
    const g = s > 0 ? tri(new Vector3(-half, EDGE_Y, z), new Vector3(half, EDGE_Y, z), new Vector3(0, apex, z), 0.9) : tri(new Vector3(half, EDGE_Y, z), new Vector3(-half, EDGE_Y, z), new Vector3(0, apex, z), 0.9);
    b.add('cloth', g, C.maroon);
    const inset = 0.2;
    const zi = z + s * 0.006;
    const hi = half - inset * 2.4;
    const gi = s > 0 ? tri(new Vector3(-hi, EDGE_Y + inset, zi), new Vector3(hi, EDGE_Y + inset, zi), new Vector3(0, apex - inset * 1.6, zi), 0.9) : tri(new Vector3(hi, EDGE_Y + inset, zi), new Vector3(-hi, EDGE_Y + inset, zi), new Vector3(0, apex - inset * 1.6, zi), 0.9);
    b.add('cloth', gi, C.saffron);
  }
  // The scalloped valance on all four sides, with tassels at every cusp.
  const colors = { band: C.maroon, line: C.gold, scallop: C.saffron };
  const edge = (len: number, m: Matrix4) => {
    const v = valance(len, 0.13, 0.19, colors);
    for (const g of v.geo) b.add('cloth', g, m);
    for (const c of v.cusps) b.add('cloth', tassel(c), m, C.gold);
  };
  for (const s of [-1, 1]) edge(2 * ZE, place(s * (HW + OVER + 0.01), EDGE_Y + 0.01, 0, s * Math.PI / 2));
  edge(2 * (HW + OVER), place(0, EDGE_Y + 0.02, ZE + 0.09, 0));
  edge(2 * (HW + OVER), place(0, EDGE_Y + 0.01, -ZE - 0.01, Math.PI));
}

// ---- Walls ------------------------------------------------------------------------------------

function walls(b: FestBatch): void {
  const maroon = new Color(C.maroon);
  const cream = new Color(C.cream);
  const saffron = new Color(C.saffron);
  const deep = new Color(C.deepMaroon);
  // Kanaat: striped side walls between the back and middle poles and a little beyond — just
  // inside their colliders (x ±4.5, 0.1 thick).
  const len = 1.78 + HD;
  for (const s of [-1, 1]) {
    const m = new Matrix4().makeRotationY(-Math.PI / 2).setPosition(s * HW, 0, -HD);
    b.add('cloth', pleated(len, 0.03, 0.26, 0.16, 0.06, () => maroon, 1), m);
    b.add('cloth', pleated(len, 0.26, 2.55, 0.16, 0.07, (x) => (Math.floor(x / 0.32) % 2 ? maroon : cream), 3), m);
    b.add('cloth', pleated(len, 2.55, 2.84, 0.16, 0.06, () => saffron, 1), m);
  }
  // The back: plain deep maroon behind the stage, a saffron band along the top.
  const m = new Matrix4().makeTranslation(-HW, 0, STAGE_BACK - 0.05);
  b.add('cloth', pleated(2 * HW, 0.03, 3.78, 0.2, 0.05, () => deep, 4), m);
  b.add('cloth', pleated(2 * HW, 3.78, 4.04, 0.2, 0.05, () => saffron, 1), m);
}

// ---- The entrance ------------------------------------------------------------------------------

type ToWorld = (x: number, y: number, z: number) => Vector3;
type ToWorldPts = (pts: Vector3[]) => Vector3[];

function front(b: FestBatch, orn: Ornaments, W: ToWorld, Wp: ToWorldPts): void {
  // The mandal's name board, across the entrance posts above the valance.
  const bz = ZE + 0.08;
  const by0 = 4.08;
  const bh = 1.14;
  b.add('atlas', atlasPlane('board', 9.1, bh).translate(0, by0 + bh / 2, bz));
  b.add('teak', box('teak', 9.16, bh + 0.06, 0.03, 0, by0 + bh / 2, bz - 0.025), '#3e2a1c');
  for (const [w, h, x, y] of [[9.24, 0.05, 0, by0], [9.24, 0.05, 0, by0 + bh], [0.05, bh + 0.05, -4.6, by0 + bh / 2], [0.05, bh + 0.05, 4.6, by0 + bh / 2]] as const) {
    b.add('teak', box('teak', w, h, 0.05, x, y, bz + 0.01), '#6a472d');
  }
  for (const s of [-1, 1]) {
    for (const y of [4.35, 5.0]) b.add('paint', bamboo(new Vector3(s * HW, y, HD), new Vector3(s * HW, y, bz - 0.04), 0.03, 50 + y));
  }

  // Toran: mango leaves and marigolds on a cord from post to post, under the valance.
  const toran = catenary(new Vector3(-HW, 3.62, HD + 0.12), new Vector3(HW, 3.62, HD + 0.12), 0.16, 40);
  rope(b, toran, 0.006, '#4a3a26');
  orn.toran(Wp(toran));

  // Marigold swags beneath, and strands hanging where they meet.
  for (let k = 0; k < 3; k++) {
    const x0 = -HW + 3 * k;
    orn.garland(Wp(catenary(new Vector3(x0, 3.5, HD + 0.17), new Vector3(x0 + 3, 3.5, HD + 0.17), 0.45, 30)));
  }
  for (let k = 0; k <= 3; k++) {
    const x = -HW + 3 * k;
    const len = k === 0 || k === 3 ? 1.35 : 0.8;
    orn.garland(Wp([new Vector3(x, 3.5, HD + 0.17), new Vector3(x, 3.5 - len, HD + 0.17)]));
    if (k === 0 || k === 3) orn.garland(Wp([new Vector3(x * 0.93, 3.46, HD + 0.2), new Vector3(x * 0.93, 3.46 - 1.0, HD + 0.2)]));
  }

  // Banana plants tied to the entrance posts.
  for (const s of [-1, 1]) bananaPlant(b, new Vector3(s * (HW + 0.15), 0, HD + 0.14), s);

  // Saffron flags over the entrance posts and on the ridge. Wind from the west-south-west.
  const wind = Math.atan2(0.75, 0.66);
  for (const s of [-1, 1]) orn.dhwaj(W(s * HW, 5.58, HD), wind + s * 0.08);
  orn.dhwaj(W(0, RIDGE + 1.22, ZE - 0.12), wind, 1.1);
}

/** A banana plant, cut whole and tied to a post: stem, a crown of big torn leaves. */
function bananaPlant(b: FestBatch, base: Vector3, side: number): void {
  const r = rng(side > 0 ? 91 : 92);
  const H = 2.45;
  b.add('paint', lathe([[0.1, 0], [0.098, 0.6], [0.09, 1.4], [0.08, 2.1], [0.06, H], [0.001, H + 0.05]], 9).translate(base.x, base.y, base.z), '#6e8a3c');
  // Tied with coir rope, three turns round post and stem together.
  for (const y of [0.6, 1.4, 2.15]) b.add('paint', lathe([[0.2, -0.02], [0.21, 0], [0.2, 0.02]], 10).scale(1, 1, 0.7).translate(base.x - side * 0.08, y, base.z - 0.07), '#5a4630');
  const top = new Vector3(base.x, H - 0.05, base.z);
  // Leaves: mostly outward and forward, one reaching over the entrance.
  const dirs = [0, 0.75, 1.45, -0.55, 2.45].map((p) => (side > 0 ? p : Math.PI - p));
  for (const [k, phi] of dirs.entries()) {
    const L = 1.25 + r() * 0.35;
    const lift = k === 4 ? 0.35 : 0.55 + r() * 0.3;
    const w = 0.44;
    const dir = new Vector3(Math.cos(phi), 0, Math.sin(phi));
    const across = new Vector3(-dir.z, 0, dir.x);
    const seg = 5;
    const pts: Vector3[] = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      pts.push(top.clone().addScaledVector(dir, L * t * 0.85).add(new Vector3(0, L * (lift * t - 0.75 * t * t), 0)));
    }
    const pos: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i < seg; i++) {
      const [p0, p1] = [pts[i], pts[i + 1]];
      const tilt = 0.18;
      const a0 = p0.clone().addScaledVector(across, -w / 2).setY(p0.y - tilt * w / 2);
      const b0 = p0.clone().addScaledVector(across, w / 2).setY(p0.y + tilt * w / 2);
      const a1 = p1.clone().addScaledVector(across, -w / 2).setY(p1.y - tilt * w / 2);
      const b1 = p1.clone().addScaledVector(across, w / 2).setY(p1.y + tilt * w / 2);
      const [v0, v1] = [i / seg, (i + 1) / seg];
      pos.push(...a0.toArray(), ...b0.toArray(), ...b1.toArray(), ...a0.toArray(), ...b1.toArray(), ...a1.toArray());
      uv.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    b.add('banana', g, new Color('#dfe8c8').offsetHSL(0, 0, (r() - 0.5) * 0.1));
  }
}

// ---- Backdrop ---------------------------------------------------------------------------------

function backdrop(b: FestBatch, orn: Ornaments, Wp: ToWorldPts): void {
  b.add('atlas', atlasPlane('backdrop', BD.w, BD.h).translate(0, BD.y0 + BD.h / 2, BD.z));
  // A gilt frame.
  for (const [w, h, x, y] of [[BD.w + 0.1, 0.05, 0, BD.y0], [BD.w + 0.1, 0.05, 0, BD.y0 + BD.h], [0.05, BD.h, -BD.w / 2, BD.y0 + BD.h / 2], [0.05, BD.h, BD.w / 2, BD.y0 + BD.h / 2]] as const) {
    b.add('paint', new BoxGeometry(w, h, 0.03).translate(x, y, BD.z + 0.01), '#c9a04a');
  }
  // Saffron drapes, gathered and tied back either side of the painting.
  const saffron = new Color('#e07a22');
  const maroon = new Color(C.maroon);
  for (const s of [-1, 1]) {
    const outer = 3.3;
    const tieY = 1.75;
    const width = (y: number) => (y > tieY ? 0.32 + 0.66 * ((y - tieY) / (4.0 - tieY)) ** 0.8 : 0.32 + 0.3 * ((tieY - y) / (tieY - 0.72)) ** 1.5);
    const P = (u: number, v: number) => {
      const y = 0.72 + v * (4.0 - 0.72);
      const w = width(y);
      const x = s * (outer - u * w);
      return new Vector3(x, y, BD.z + 0.05 + 0.035 * Math.sin(u * Math.PI * 6) * (w / 0.9) + 0.03 * (1 - Math.abs(y - tieY) / 2.3));
    };
    b.add('cloth', clothGrid(12, 10, P, (i) => (i === 11 ? maroon : saffron), [1, 3.3], (u) => 0.8 + 0.2 * Math.cos(u * Math.PI * 12)));
    b.add('paint', lathe([[0.06, -0.03], [0.075, 0], [0.06, 0.03]], 8).scale(1.4, 1, 0.8).translate(s * (outer - 0.16), tieY, BD.z + 0.08), C.gold);
  }
  // A swag across the top.
  const gold = new Color(C.gold);
  const P = (u: number, v: number) => {
    const bell = Math.abs(Math.sin(u * Math.PI * 2));
    return new Vector3(-3.35 + 6.7 * u, 4.03 - v * (0.16 + 0.26 * bell), BD.z + 0.06 + 0.08 * v * bell);
  };
  b.add('cloth', clothGrid(28, 5, P, (_i, j) => (j === 4 ? gold : maroon), [6.7, 0.4], (_u, v) => 0.85 + 0.15 * v));
  // A real marigold garland round the painted halo, its ends hanging.
  const arc: Vector3[] = [];
  const R = 1.2;
  for (let i = 0; i <= 40; i++) {
    const t = -0.2 + (i / 40) * (Math.PI + 0.4);
    arc.push(new Vector3(Math.cos(t) * R, HALO_Y + Math.sin(t) * R, BD.z + 0.07));
  }
  orn.garland(Wp(arc));
  for (const s of [-1, 1]) {
    const e = new Vector3(s * Math.cos(-0.2) * R, HALO_Y + Math.sin(-0.2) * R, BD.z + 0.07);
    orn.garland(Wp([e, e.clone().setY(e.y - 0.55)]));
  }
}

// ---- Stage ------------------------------------------------------------------------------------

function stageStructure(b: FestBatch): void {
  const cz = (STAGE_FRONT + STAGE_BACK) / 2;
  const depth = STAGE_FRONT - STAGE_BACK;
  b.add('wood', box('wood', 7.02, 0.04, depth + 0.02, 0, STAGE_H - 0.02, cz), '#9a7a58');
  b.add('cloth', box('fabric', 6.96, 0.012, depth - 0.04, 0, STAGE_H + 0.006, cz), '#8e2426');
  // A cream skirt, pleated, just outside the collider; a scalloped frill along its top.
  const cream = new Color('#efe6d2');
  const frill = { band: C.maroon, line: C.gold, scallop: C.saffron };
  b.add('cloth', pleated(7.0, 0.02, STAGE_H - 0.02, 0.14, 0.04, () => cream, 2), new Matrix4().makeTranslation(-3.5, 0, STAGE_FRONT + 0.03));
  const fr = valance(7.0, 0.05, 0.06, frill);
  for (const g of fr.geo) b.add('cloth', g, place(0, STAGE_H, STAGE_FRONT + 0.055));
  for (const s of [-1, 1]) {
    const m = new Matrix4().makeRotationY(-Math.PI / 2).setPosition(s * 3.53, 0, STAGE_BACK);
    b.add('cloth', pleated(depth, 0.02, STAGE_H - 0.02, 0.14, 0.04, () => cream, 2), m);
    const sf = valance(depth, 0.05, 0.06, frill);
    for (const g of sf.geo) b.add('cloth', g, place(s * 3.555, STAGE_H, cz, s * Math.PI / 2));
  }
}

/** A cotton durrie over the pandal floor: madder red with bands of indigo, cream and saffron. */
function carpet(b: FestBatch): void {
  const z0 = STAGE_FRONT + 0.04;
  const z1 = HD - 0.1;
  const bands: [number, string][] = [[0.14, '#2f3e62'], [0.06, C.cream], [0.1, '#d77a26'], [0.06, C.cream]];
  const strip = (za: number, zb: number, c: string) => b.add('cloth', box('fabric', 2 * HW - 0.14, 0.014, zb - za, 0, 0.007, (za + zb) / 2), c);
  let a = z0;
  for (const [w, c] of bands) strip(a, (a += w), c);
  let e = z1;
  for (const [w, c] of bands) strip((e -= w), e + w, c);
  strip(a, e, '#8a2a26');
  // A thin indigo line down the middle, where the aisle is.
  b.add('cloth', box('fabric', 0.08, 0.015, e - a, 0, 0.0075, (a + e) / 2), '#2f3e62');
}

function stageThings(a: ArtContext, d: FestBatch, orn: Ornaments, M: Matrix4): void {
  const top = STAGE_H + 0.012;
  const Wp = (pts: Vector3[]) => pts.map((p) => p.clone().applyMatrix4(M));
  const flame = (m: Matrix4, p: Vector3, size = 1) => a.flames.add(p.clone().applyMatrix4(m).applyMatrix4(M), size);

  // The chowki: a low teak seat, draped in red silk with a zari hem, a bed of rice on it — waiting.
  const cz = -2.45;
  for (const sx of [-0.43, 0.43]) for (const sz of [-0.29, 0.29]) d.add('teak', box('teak', 0.06, 0.34, 0.06, sx, top + 0.17, cz + sz), '#5d3f28');
  d.add('teak', box('teak', 0.98, 0.05, 0.68, 0, top + 0.365, cz), '#6a472d');
  const seat = top + 0.395;
  d.add('cloth', box('fabric', 1.05, 0.012, 0.75, 0, seat, cz), C.silk);
  const silk = new Color(C.silk);
  const zari = new Color(C.gold);
  const skirt = (len: number, drop: number, m: Matrix4) => d.add('cloth', clothGrid(14, 4, (u, v) => new Vector3(-len / 2 + u * len, -v * drop, 0.012 * Math.sin(u * Math.PI * 9) * v + 0.02 * v * v), (_i, j) => (j === 3 ? zari : silk), [len, drop], (u) => 0.88 + 0.12 * Math.cos(u * Math.PI * 18)), m);
  skirt(1.05, 0.3, place(0, seat + 0.005, cz + 0.376));
  for (const s of [-1, 1]) skirt(0.75, 0.24, place(s * 0.526, seat + 0.005, cz, s * Math.PI / 2));
  heap(d, place(0, seat + 0.006, cz - 0.02), 0.3, 0.04, C.rice);
  // Bappa has come home: seated in majestic 3D form on the chowki.
  ganeshMurti3D(d, orn, Wp, 0, seat + 0.03, cz - 0.04);
  for (const [x, z] of [[-0.44, 0.3], [0.44, 0.3]] as const) hibiscus(d, place(x, seat + 0.006, cz + z, 0.6));
  orn.garland(Wp(catenary(new Vector3(-0.5, seat - 0.02, cz + 0.4), new Vector3(0.5, seat - 0.02, cz + 0.4), 0.16, 14)));

  // The kalash on a thali of rice, to the chowki's right.
  const km = place(-0.95, top, -2.5);
  thali(d, km, 0.19);
  heap(d, new Matrix4().multiplyMatrices(km, place(0, 0.009, 0)), 0.14, 0.035, C.rice);
  kalash(d, new Matrix4().multiplyMatrices(km, place(0, 0.03, 0)), 1.05);

  // Two brass samai, lit.
  for (const s of [-1, 1]) {
    const m = place(s * 1.6, top, -2.35, s * 0.3);
    for (const w of samai(d, m, 1.0)) flame(m, w, 0.9);
  }

  // The puja thali: a lit diya, kumkum, haldi, akshata, a flower — and a small bell beside it.
  const tm = place(0.95, top, -2.15, -0.4);
  thali(d, tm, 0.18);
  const on = (x: number, z: number, r = 0) => new Matrix4().multiplyMatrices(tm, place(x, 0.009, z, r));
  const dm = on(0.06, 0.06, 2.2);
  flame(dm, diya(d, dm, undefined, true));
  vati(d, on(-0.07, 0.06), TONE.vermilion);
  vati(d, on(-0.08, -0.05), TONE.turmeric);
  heap(d, on(0.07, -0.07), 0.04, 0.015, C.rice);
  hibiscus(d, on(0.0, 0.0, 1), 0.7);
  d.add('brass', lathe([[0.001, 0], [0.045, 0], [0.042, 0.02], [0.03, 0.06], [0.018, 0.08], [0.008, 0.085], [0.008, 0.14], [0.018, 0.15], [0.001, 0.17]], 12).translate(1.2, top, -1.95));

  // Flowers waiting to be offered: a basket of marigolds, a plate of hibiscus and roses.
  const bm = place(0.55, top, -1.5);
  basket(d, bm, 0.19, 0.11, 3);
  flowerHeap(d, new Matrix4().multiplyMatrices(bm, place(0, 0.09, 0)), 0.17, 0.07, 42, MARIGOLDS, 4);
  const pm = place(-0.5, top, -1.55);
  thali(d, pm, 0.17);
  for (let i = 0; i < 7; i++) {
    const t = (i / 7) * Math.PI * 2;
    hibiscus(d, new Matrix4().multiplyMatrices(pm, place(Math.cos(t) * 0.09, 0.012, Math.sin(t) * 0.09, t)), 0.75);
  }
  flowerHeap(d, new Matrix4().multiplyMatrices(pm, place(0, 0.012, 0)), 0.05, 0.02, 5, ['#c0283a', '#d8506a'], 9, 0.028);

  // A row of clay diyas along the front edge of the stage.
  for (let i = 0; i < 13; i++) {
    const m = place(-3.0 + i * 0.5, top, STAGE_FRONT - 0.14, i * 1.3);
    flame(m, diya(d, m));
  }
}

// ---- The murti --------------------------------------------------------------------------------------

/**
 * The majestic 3D Ganesha Murti in the village pandal (Ganesh GG representation).
 * Seated on a double lotus pedestal with crown (Kiritamukuta), graceful trunk sweeping left
 * with modak, four arms holding sacred attributes, golden ornaments and radiant aura (Prabhavali).
 */
function ganeshMurti3D(d: FestBatch, orn: Ornaments, Wp: ToWorldPts, x: number, y: number, z: number): void {
  const gold = '#d7a443';
  const brightGold = '#fcd34d';
  const saffron = '#e8842a';
  const vermilion = '#c23328';
  const claySkin = '#c47854';
  const ivory = '#fffbee';

  // 1. Double Lotus Base Pedestal (Padmasana seat on the altar)
  d.add('brass', lathe([[0.001, 0], [0.46, 0], [0.48, 0.04], [0.44, 0.08], [0.46, 0.12], [0.42, 0.14]], 24).translate(x, y, z), gold);
  // Red velvet cushion atop the lotus base
  d.add('cloth', new CylinderGeometry(0.40, 0.42, 0.05, 24).translate(x, y + 0.165, z), vermilion);

  // 2. Crossed Legs in Padmasana posture draped in festive saffron silk Dhoti with gold zari
  d.add('cloth', lathe([[0.001, 0], [0.38, 0.01], [0.36, 0.06], [0.32, 0.13], [0.001, 0.14]], 20).translate(x, y + 0.18, z), saffron);
  // Folded knees on either side
  d.add('cloth', new SphereGeometry(0.12, 12, 10).scale(1.4, 0.7, 1.0).translate(x - 0.28, y + 0.22, z + 0.04), saffron);
  d.add('cloth', new SphereGeometry(0.12, 12, 10).scale(1.4, 0.7, 1.0).translate(x + 0.28, y + 0.22, z + 0.04), saffron);
  // Golden border trim along the dhoti folds
  d.add('brass', new TorusGeometry(0.35, 0.015, 8, 24).rotateX(Math.PI / 2).translate(x, y + 0.22, z + 0.02), gold);
  // Sacred golden lotus feet & anklets (payal)
  d.add('brass', new TorusGeometry(0.04, 0.008, 8, 16).rotateX(Math.PI / 2).translate(x - 0.12, y + 0.20, z + 0.22), brightGold);
  d.add('paint', new SphereGeometry(0.045, 10, 8).scale(1, 0.6, 1.4).translate(x - 0.12, y + 0.20, z + 0.24), claySkin);
  d.add('brass', new TorusGeometry(0.04, 0.008, 8, 16).rotateX(Math.PI / 2).translate(x + 0.12, y + 0.20, z + 0.22), brightGold);
  d.add('paint', new SphereGeometry(0.045, 10, 8).scale(1, 0.6, 1.4).translate(x + 0.12, y + 0.20, z + 0.24), claySkin);

  // 3. Sacred Pot-Belly (Lambodara)
  d.add('paint', new SphereGeometry(0.24, 18, 14).scale(1.05, 0.95, 1.15).translate(x, y + 0.35, z + 0.03), claySkin);
  // Golden serpent belt (Nagabandha) around Bappa's waist
  d.add('brass', new TorusGeometry(0.24, 0.014, 8, 24).rotateX(Math.PI / 2.3).translate(x, y + 0.31, z + 0.05), brightGold);

  // 4. Divine Torso & Chest
  d.add('paint', lathe([[0.001, 0], [0.22, 0.02], [0.26, 0.14], [0.28, 0.22], [0.24, 0.28], [0.001, 0.29]], 18).translate(x, y + 0.38, z - 0.01), claySkin);
  // Sacred Golden Thread (Yajnopavita) crossing from left shoulder to right waist
  d.add('brass', new TorusGeometry(0.27, 0.009, 8, 24).rotateX(Math.PI / 3).rotateZ(0.6).translate(x, y + 0.49, z + 0.03), brightGold);
  // Royal layered pearl/gold necklace (Kanthi Har) with gemstone pendant
  d.add('brass', new TorusGeometry(0.18, 0.012, 8, 20).rotateX(Math.PI / 2.6).translate(x, y + 0.58, z + 0.06), gold);
  d.add('paint', new SphereGeometry(0.025, 8, 8).translate(x, y + 0.52, z + 0.17), vermilion);

  // 5. Sacred Elephant Head (Gajanana)
  // Cranial lobes (Kumbha) & head
  d.add('paint', new SphereGeometry(0.17, 16, 14).scale(1.15, 1.05, 1.1).translate(x, y + 0.72, z + 0.02), claySkin);
  d.add('paint', new SphereGeometry(0.09, 10, 8).translate(x - 0.07, y + 0.81, z + 0.06), claySkin);
  d.add('paint', new SphereGeometry(0.09, 10, 8).translate(x + 0.07, y + 0.81, z + 0.06), claySkin);

  // Auspicious Red Sindoor Tilak / Trishul on forehead
  d.add('paint', new CylinderGeometry(0.014, 0.014, 0.07, 8).translate(x, y + 0.78, z + 0.15), vermilion);
  d.add('paint', new CylinderGeometry(0.008, 0.008, 0.05, 8).rotateZ(Math.PI / 2).translate(x, y + 0.76, z + 0.15), brightGold);

  // Wide Elephant Ears (Supa-karna) angled forward
  for (const s of [-1, 1]) {
    const ear = new CylinderGeometry(0.16, 0.13, 0.018, 16).scale(1.2, 0.8, 1);
    ear.rotateY(s * 0.45);
    ear.rotateZ(s * 0.15);
    ear.translate(x + s * 0.22, y + 0.72, z - 0.02);
    d.add('paint', ear, claySkin);
    // Golden ear cuffs / ornaments (kundala)
    d.add('brass', new TorusGeometry(0.035, 0.008, 8, 16).translate(x + s * 0.32, y + 0.64, z - 0.01), brightGold);
  }

  // Sacred Tusks: Broken right tusk (Ekadanta) and full left tusk
  // Right broken tusk
  d.add('paint', new CylinderGeometry(0.02, 0.018, 0.06, 8).rotateX(Math.PI / 3).translate(x + 0.08, y + 0.63, z + 0.14), ivory);
  // Left full curved tusk
  d.add('paint', new ConeGeometry(0.022, 0.12, 10).rotateX(Math.PI / 2.6).rotateY(-0.15).translate(x - 0.08, y + 0.62, z + 0.17), ivory);

  // 6. Graceful Curved Trunk (Vakratunda) sweeping down and curving to the left
  const trunkSegs: [number, number, number, number][] = [
    [0.0, 0.68, 0.15, 0.075],
    [-0.01, 0.61, 0.18, 0.065],
    [-0.03, 0.54, 0.20, 0.055],
    [-0.06, 0.47, 0.21, 0.046],
    [-0.10, 0.42, 0.21, 0.038],
    [-0.14, 0.42, 0.19, 0.032],
    [-0.15, 0.45, 0.18, 0.026],
  ];
  for (let i = 0; i < trunkSegs.length - 1; i++) {
    const [x0, y0, z0, r0] = trunkSegs[i];
    const [x1, y1, z1, r1] = trunkSegs[i + 1];
    const midX = (x0 + x1) / 2;
    const midY = (y0 + y1) / 2;
    const midZ = (z0 + z1) / 2;
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const seg = new CylinderGeometry(r1, r0, len, 12);
    // Align cylinder with segment
    const dir = new Vector3(x1 - x0, y1 - y0, z1 - z0).normalize();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
    seg.applyQuaternion(q);
    seg.translate(x + midX, y + midY, z + midZ);
    d.add('paint', seg, claySkin);
  }
  // Golden sweet Modak held at the tip of the trunk!
  d.add('brass', lathe([[0.001, 0], [0.035, 0], [0.04, 0.02], [0.03, 0.045], [0.001, 0.065]], 12).translate(x - 0.15, y + 0.43, z + 0.18), brightGold);

  // 7. Four Divine Arms (Chaturbhuja)
  // Upper Right Arm (holding golden Ankusha / Axe)
  d.add('paint', new CylinderGeometry(0.04, 0.048, 0.24, 10).rotateZ(-0.75).translate(x + 0.26, y + 0.62, z + 0.02), claySkin);
  d.add('paint', new CylinderGeometry(0.035, 0.04, 0.22, 10).rotateX(0.4).translate(x + 0.35, y + 0.78, z + 0.06), claySkin);
  d.add('brass', new TorusGeometry(0.04, 0.008, 8, 16).translate(x + 0.26, y + 0.64, z + 0.02), brightGold); // Armlet
  d.add('brass', new CylinderGeometry(0.008, 0.008, 0.28, 8).translate(x + 0.36, y + 0.88, z + 0.08), brightGold); // Ankusha staff
  d.add('brass', new BoxGeometry(0.08, 0.06, 0.015).translate(x + 0.39, y + 0.96, z + 0.08), gold); // Ankusha axe blade

  // Upper Left Arm (holding sacred Pasha / Lotus)
  d.add('paint', new CylinderGeometry(0.04, 0.048, 0.24, 10).rotateZ(0.75).translate(x - 0.26, y + 0.62, z + 0.02), claySkin);
  d.add('paint', new CylinderGeometry(0.035, 0.04, 0.22, 10).rotateX(0.4).translate(x - 0.35, y + 0.78, z + 0.06), claySkin);
  d.add('brass', new TorusGeometry(0.04, 0.008, 8, 16).translate(x - 0.26, y + 0.64, z + 0.02), brightGold); // Armlet
  d.add('brass', new TorusGeometry(0.04, 0.01, 8, 16).translate(x - 0.36, y + 0.90, z + 0.08), brightGold); // Sacred Pasha noose/lotus

  // Lower Right Hand: Abhaya Mudra (blessing gesture)
  d.add('paint', new CylinderGeometry(0.038, 0.045, 0.22, 10).rotateZ(-0.5).rotateX(0.7).translate(x + 0.25, y + 0.44, z + 0.15), claySkin);
  // Open blessing palm
  d.add('paint', new BoxGeometry(0.07, 0.08, 0.025).translate(x + 0.28, y + 0.46, z + 0.24), claySkin);
  d.add('paint', new SphereGeometry(0.016, 8, 8).translate(x + 0.28, y + 0.46, z + 0.255), vermilion); // Red auspicious blessing symbol
  d.add('brass', new TorusGeometry(0.038, 0.008, 8, 16).translate(x + 0.27, y + 0.42, z + 0.21), brightGold); // Bangle

  // Lower Left Hand: Holding golden bowl of modaks (Modak-patra)
  d.add('paint', new CylinderGeometry(0.038, 0.045, 0.22, 10).rotateZ(0.5).rotateX(0.7).translate(x - 0.25, y + 0.44, z + 0.15), claySkin);
  d.add('brass', lathe([[0.001, 0], [0.06, 0.01], [0.075, 0.03], [0.065, 0.05]], 14).translate(x - 0.24, y + 0.38, z + 0.26), gold); // Golden bowl
  d.add('brass', new SphereGeometry(0.02, 8, 8).translate(x - 0.24, y + 0.42, z + 0.26), brightGold); // Modak sweet in bowl
  d.add('brass', new SphereGeometry(0.018, 8, 8).translate(x - 0.22, y + 0.41, z + 0.28), brightGold);
  d.add('brass', new SphereGeometry(0.018, 8, 8).translate(x - 0.26, y + 0.41, z + 0.27), brightGold);

  // 8. Majestic Royal Crown (Kiritamukuta)
  d.add('brass', lathe([
    [0.001, 0],
    [0.17, 0],
    [0.18, 0.04],
    [0.16, 0.08],
    [0.17, 0.10],
    [0.14, 0.17],
    [0.15, 0.19],
    [0.11, 0.26],
    [0.08, 0.31],
    [0.04, 0.36],
    [0.015, 0.40],
    [0.001, 0.44],
  ], 20).translate(x, y + 0.84, z + 0.03), gold);
  // Red ruby jewel in crown centre
  d.add('paint', new SphereGeometry(0.024, 8, 8).translate(x, y + 0.90, z + 0.19), vermilion);
  // Sacred golden kalasa finial atop crown
  d.add('brass', new SphereGeometry(0.025, 10, 8).translate(x, y + 1.29, z + 0.03), brightGold);

  // 9. Glowing Golden Prabhavali (Radiant Divine Altar Arch behind Bappa)
  d.add('brass', new TorusGeometry(0.68, 0.035, 12, 32).translate(x, y + 0.85, z - 0.10), gold);
  d.add('brass', new CylinderGeometry(0.64, 0.64, 0.015, 24).rotateX(Math.PI / 2).translate(x, y + 0.85, z - 0.11), '#fef08a');
  // Radiant golden sunbeams / flames emanating from Prabhavali
  for (let i = 0; i < 20; i++) {
    const a = -0.3 + (i / 19) * (Math.PI + 0.6);
    const ray = new ConeGeometry(0.035, 0.16, 6);
    ray.rotateZ(-a + Math.PI / 2);
    ray.translate(x + Math.cos(a) * 0.72, y + 0.85 + Math.sin(a) * 0.72, z - 0.10);
    d.add('brass', ray, brightGold);
  }

  // 10. Auspicious Marigold Garlands framing Bappa's throne
  const garlandLoop: Vector3[] = [];
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const fwd = Math.max(0, Math.cos(a));
    garlandLoop.push(new Vector3(x + Math.sin(a) * 0.48, y + 0.58 - 0.28 * fwd ** 2, z + Math.cos(a) * 0.36 + 0.10 * fwd));
  }
  orn.garland(Wp(garlandLoop));
}

// ---- Lights ------------------------------------------------------------------------------------

function lights(orn: Ornaments, Wp: ToWorldPts): void {
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
  // Along the top of the name board and up the gable edges.
  orn.bulbs(Wp([V(-4.6, 5.27, ZE + 0.1), V(4.6, 5.27, ZE + 0.1)]), 0.16);
  for (const s of [-1, 1]) orn.bulbs(Wp([V(s * (HW + OVER), EDGE_Y + 0.08, ZE + 0.03), V(0, RIDGE + LIFT + 0.05, ZE + 0.03)]), 0.18);
  // Along both side eaves, above the valance.
  for (const s of [-1, 1]) orn.bulbs(Wp([V(s * (HW + OVER + 0.03), EDGE_Y + 0.02, -ZE), V(s * (HW + OVER + 0.03), EDGE_Y + 0.02, ZE)]), 0.2);
  // Spiralling down the entrance posts.
  for (const s of [-1, 1]) {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const ang = t * Math.PI * 2 * 7;
      pts.push(V(s * HW + Math.cos(ang) * 0.1, 3.9 - t * 3.5, HD + Math.sin(ang) * 0.1));
    }
    orn.bulbs(Wp(pts), 0.13);
  }
  // A canopy of strings under the roof, from the ridge's middle to the corners.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) orn.bulbs(Wp(catenary(V(0, RIDGE - 0.12, 0), V(sx * (HW - 0.2), 4.0, sz * (HD - 0.1)), 0.3, 24)), 0.22);
}
