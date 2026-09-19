/**
 * The market stalls: flowers by the festival ground, the potter, fruit on a handcart, and the
 * puja stall at the temple gate.
 *
 * Each stall's collider is its table or stack (local −z of the spot); the customer's side, local
 * +z, stays open — that is where the festival module sets the offering down. Canopies and hanging
 * garlands are overhead or soft, so they may overhang the open side.
 */
import { BoxGeometry, Color, CylinderGeometry, IcosahedronGeometry, LatheGeometry, PlaneGeometry, TorusGeometry, Vector2, Vector3 } from 'three';
import type { LandmarkDef } from '../../types';
import { rng } from './canvasTextures';
import { Batch, box, fill, weather } from './geom';
import { TONE } from './palette';
import {
  at,
  bamboo,
  bananaHand,
  basket,
  CLAY,
  coconut,
  DIYA,
  diya,
  featureRoot,
  framer,
  fruit,
  HANDI,
  hangingGarland,
  hashId,
  latheM,
  leafBed,
  lodOf,
  LOTA,
  MATKA,
  marigoldHeap,
  mosaic,
  mound,
  pot,
  RANJAN,
  rod,
  sheet,
  valance,
  type Framer,
} from './props.parts';
import type { ArtContext } from './runtime';

const BAMBOO = '#b59b62';

/** Four bamboo posts and a cloth canopy over a stall: posts at the given corners, canopy sloping to the front. */
function canopy(b: Batch, x0: number, x1: number, zb: number, zf: number, hb: number, hf: number, cloth: string, over: number, seed: number): void {
  for (const x of [x0, x1]) {
    bamboo(b, new Vector3(x, 0, zb), new Vector3(x, hb + 0.08, zb), 0.035, BAMBOO, seed);
    bamboo(b, new Vector3(x, 0, zf), new Vector3(x, hf + 0.08, zf), 0.035, BAMBOO, seed + 1);
  }
  bamboo(b, new Vector3(x0 - 0.1, hb, zb), new Vector3(x1 + 0.1, hb, zb), 0.03, BAMBOO, seed + 2);
  bamboo(b, new Vector3(x0 - 0.1, hf, zf), new Vector3(x1 + 0.1, hf, zf), 0.03, BAMBOO, seed + 3);
  const slope = (hb - hf) / (zf - zb);
  const zo = zf + over;
  const yo = hf - over * slope;
  const cl = new Color(cloth);
  b.add('fabric', weather(sheet(new Vector3(x0 - 0.15, hb + 0.04, zb - 0.12), new Vector3(x1 + 0.15, hb + 0.04, zb - 0.12), new Vector3(x1 + 0.15, yo + 0.04, zo), new Vector3(x0 - 0.15, yo + 0.04, zo), 0.06, 8, 5), cl, { ground: yo, splash: 0.4, strength: 0.18, seed }));
  const n = Math.max(3, Math.round((x1 - x0 + 0.3) / 0.35));
  for (let i = 0; i < n; i++) {
    const a = new Vector3(x0 - 0.15 + ((x1 - x0 + 0.3) * i) / n, yo + 0.04, zo);
    const e = new Vector3(x0 - 0.15 + ((x1 - x0 + 0.3) * (i + 1)) / n, yo + 0.04, zo);
    b.add('fabric', fill(valance(a, e, 0.16, 1), i % 2 ? cl.clone().multiplyScalar(0.8) : '#e2c27a'));
  }
}

/** A hurricane lantern hung from a rail, with its flame (world position via `w`). */
function lantern(a: ArtContext, b: Batch, w: Framer, x: number, y: number, z: number): void {
  b.add('iron', new CylinderGeometry(0.07, 0.08, 0.035, 10).translate(x, y, z));
  b.add('iron', new CylinderGeometry(0.03, 0.065, 0.06, 10).translate(x, y + 0.2, z));
  b.add('paint', new LatheGeometry([[0.001, 0], [0.045, 0.005], [0.06, 0.07], [0.04, 0.16], [0.001, 0.165]].map(([p, q]) => new Vector2(p, q)), 10).translate(x, y + 0.02, z), '#f0dcb0');
  for (const sx of [-1, 1]) b.add('iron', new BoxGeometry(0.006, 0.2, 0.006).translate(x + sx * 0.068, y + 0.1, z));
  b.add('iron', new TorusGeometry(0.035, 0.004, 4, 10, Math.PI).translate(x, y + 0.23, z));
  a.flames.add(w(x, y + 0.05, z), 0.9);
}

// ---- Flower stall --------------------------------------------------------------------------------

/**
 * Flowers for the puja: heaps of orange and yellow marigolds, red roses, white shevanti on banana
 * leaves; coiled garlands ready to sell; long garlands hanging from the front rail.
 */
export function flowerStall(a: ArtContext, l: LandmarkDef): void {
  const root = featureRoot(`landmark:flower-stall:${l.id}`, l.x, l.z, l.rot);
  const w = framer(l.x, l.z, l.rot);
  const seed = hashId(l.id);
  const r = rng(seed);
  const b = new Batch();
  const far = new Batch();
  // Table on the collider: x ±1.2, z −0.9…0.2, top at 0.8.
  const z0 = -0.9;
  const z1 = 0.2;
  const zc = (z0 + z1) / 2;
  const top = 0.8;
  for (const bb of [b, far]) bb.add('wood', weather(box('wood', 2.4, 0.05, 1.1, 0, top - 0.025, zc), '#7a5e42', { ground: 0, strength: 0 }));
  for (const sx of [-1, 1]) for (const z of [z0 + 0.06, z1 - 0.06]) b.add('wood', fill(box('wood', 0.07, top - 0.05, 0.07, sx * 1.12, (top - 0.05) / 2, z), '#5e4632'));
  // A red cloth skirt with a yellow border.
  const skirt = sheet(new Vector3(-1.2, top - 0.01, z1 + 0.015), new Vector3(1.2, top - 0.01, z1 + 0.015), new Vector3(1.2, 0.12, z1 + 0.03), new Vector3(-1.2, 0.12, z1 + 0.03), -0.015, 10, 3);
  for (const bb of [b, far]) bb.add('fabric', weather(skirt.clone(), '#a8342a', { ground: 0.1, splash: 0.3, strength: 0.3 }));
  b.add('fabric', fill(sheet(new Vector3(-1.2, 0.2, z1 + 0.034), new Vector3(1.2, 0.2, z1 + 0.034), new Vector3(1.2, 0.12, z1 + 0.036), new Vector3(-1.2, 0.12, z1 + 0.036), 0, 6, 1), '#d9a93a'));
  skirt.dispose();

  // Banana leaves and the heaps.
  leafBed(b, at(-0.55, top + 0.004, zc, 0.1), 1.1, 0.5);
  leafBed(b, at(0.55, top + 0.004, zc, -0.08), 1.1, 0.5);
  marigoldHeap(b, at(-0.75, top + 0.01, zc - 0.05), 0.3, 0.2, seed);
  marigoldHeap(b, at(-0.2, top + 0.01, zc + 0.05), 0.24, 0.16, seed + 1, [TONE.marigoldYellow, '#f2d24a', '#e8b42a']);
  marigoldHeap(b, at(0.3, top + 0.01, zc - 0.12), 0.2, 0.14, seed + 2, ['#b01e2a', '#c8323a', '#8a1420', '#d04a4a']);
  marigoldHeap(b, at(0.78, top + 0.01, zc + 0.02), 0.22, 0.14, seed + 3, ['#f2efe6', '#e8e4d0', '#f7f2e0', '#e0d8b0']);
  // Coiled garlands, ready to sell, at the front edge.
  for (let k = 0; k < 4; k++) {
    const g = mosaic(new TorusGeometry(0.1, 0.03, 5, 16).rotateX(Math.PI / 2).translate(0.35 + k * 0.05, top + 0.03 + k * 0.045, z1 - 0.14), k % 2 ? [TONE.marigold, TONE.marigoldYellow] : ['#f2efe6', TONE.marigold], k, 0.08);
    b.add('paint', g);
  }
  // A basket of lotuses.
  const bh = basket(b, at(-0.2, top, z0 + 0.2), 0.17, 0.1, seed);
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2;
    b.add('paint', new LatheGeometry([[0.001, 0], [0.04, 0.03], [0.035, 0.07], [0.001, 0.1]].map(([p, q]) => new Vector2(p, q)), 7).rotateX(0.3).translate(-0.2 + Math.cos(ang) * 0.07, top + bh - 0.03, z0 + 0.2 + Math.sin(ang) * 0.07), '#e07a98');
  }

  // Posts, rails and a saffron canopy; garlands hanging from the front rail.
  canopy(b, -1.15, 1.15, z0 + 0.03, z1 - 0.03, 2.2, 2.05, '#d98a38', 0.45, seed);
  for (const x of [-1.15, 1.15]) far.add('paint', new CylinderGeometry(0.035, 0.035, 2.1, 5).translate(x, 1.05, z1 - 0.03), BAMBOO);
  far.add('fabric', fill(new BoxGeometry(2.6, 0.03, 1.6).translate(0, 2.15, zc + 0.25), '#d98a38'));
  const cols: (readonly string[])[] = [[TONE.marigold, TONE.marigoldYellow], [TONE.marigoldYellow, TONE.marigold], ['#f2efe6', '#c8323a'], [TONE.marigold, '#f2efe6']];
  for (let k = 0; k < 9; k++) {
    const x = -1.0 + k * 0.25;
    hangingGarland(b, new Vector3(x, 1.98, z1 + 0.0), 0.72 + r() * 0.3, cols[k % cols.length], seed + k);
  }
  bamboo(b, new Vector3(-1.2, 1.98, z1), new Vector3(1.2, 1.98, z1), 0.022, BAMBOO, seed + 7);
  lantern(a, b, w, 0.95, 1.7, z0 + 0.05);

  const f0 = b.build(a.kit, { name: `flower-stall:${l.id}`, cast: true, noShadow: ['paint', 'iron'] });
  const f1 = far.build(a.kit, { name: `flower-stall:${l.id}:far`, cast: false });
  root.add(lodOf([[f0, 0], [f1, 38]], 100));
  a.root.add(root);
}

// ---- Potter --------------------------------------------------------------------------------------

/**
 * The kumbhar's pitch: water pots stacked two high behind (the collider), and in front a palm mat
 * set out with rows of new diyas, painted festival diyas, kulhads and piggy banks; the wheel and a
 * lump of wet clay to one side; an old faded umbrella for shade.
 */
export function potter(a: ArtContext, l: LandmarkDef): void {
  const root = featureRoot(`landmark:potter:${l.id}`, l.x, l.z, l.rot);
  const seed = hashId(l.id);
  const r = rng(seed);
  const b = new Batch();
  const far = new Batch();

  // Stacks on the collider: x ±1.3, z −1.3…−0.5, up to 0.8.
  for (const bb of [b, far]) {
    for (let k = 0; k < 5; k++) {
      const x = -1.04 + k * 0.52;
      pot(bb, MATKA, at(x, 0, -1.1, r() * 6, 1.08), CLAY[k % CLAY.length], seed + k);
      if (bb === b) pot(bb, k % 2 ? HANDI : MATKA, at(x + 0.02, 0, -0.72, r() * 6, k % 2 ? 1.1 : 0.95), CLAY[(k + 2) % CLAY.length], seed + 10 + k);
    }
  }
  // Second tier: pots upside down in the gaps, on a bed of straw.
  for (let k = 0; k < 4; k++) {
    const x = -0.78 + k * 0.52;
    b.add('paint', mosaic(mound(0.2, 0.06, seed + k, 1, 0.3).translate(x, 0.4, -1.05), ['#c8a860', '#b89850', '#d8bc78'], k, 0.1));
    pot(b, MATKA, at(x, 0.83, -1.02, r() * 6, [1, -1, 1]), CLAY[(k + 1) % CLAY.length], seed + 20 + k);
  }
  // Two tall storage jars at the ends.
  for (const sx of [-1, 1]) pot(b, RANJAN, at(sx * 1.2, 0, -0.62, r() * 6, 0.9), '#8e4a2c', seed + 30 + sx);

  // The mat, woven: a grid of faces in two straw tones.
  const mat = new PlaneGeometry(2.4, 2.0, 16, 12).rotateX(-Math.PI / 2).translate(0, 0.012, 0.55);
  b.add('fabric', mosaic(mat, ['#c9ae72', '#b89a5e', '#d4bc84'], seed, 0.05));
  // Rows of plain diyas, painted diyas, kulhads, piggy banks — the front centre left clear.
  const diyaGeo = (col: string, m: import('three').Matrix4) => b.add('paint', new LatheGeometry(DIYA.map(([p, q]) => new Vector2(p, q)), 8), m, col);
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 12; k++) {
      const x = -1.0 + k * 0.18 + (row % 2) * 0.09;
      diyaGeo(CLAY[(k + row) % CLAY.length], at(x, 0.014, -0.3 + row * 0.17, r() * 6));
    }
  }
  const painted = ['#c8321e', '#e0a52a', '#2f7a4a', '#2f5f9a', '#e05a8a'];
  for (let k = 0; k < 12; k++) {
    const x = -1.05 + (k % 4) * 0.16;
    const z = 0.3 + Math.floor(k / 4) * 0.17;
    diyaGeo(painted[k % painted.length], at(x, 0.014, z, r() * 6));
    b.add('paint', new CylinderGeometry(0.012, 0.012, 0.004, 6).translate(x + 0.03, 0.05, z), '#f5e6a0');
  }
  // Stacks of kulhads (tea cups) and round piggy banks.
  for (let s = 0; s < 3; s++) {
    for (let k = 0; k < 5; k++) b.add('paint', new CylinderGeometry(0.035, 0.028, 0.06, 8, 1, true).translate(0.6 + s * 0.12, 0.044 + k * 0.035, 0.45), CLAY[(s + k) % CLAY.length]);
  }
  for (let k = 0; k < 3; k++) {
    const g = new IcosahedronGeometry(0.065, 1).scale(1, 0.85, 1).translate(0.62 + k * 0.15, 0.07, 0.72);
    b.add('paint', g, CLAY[k % CLAY.length]);
    b.add('paint', new BoxGeometry(0.03, 0.005, 0.008).translate(0.62 + k * 0.15, 0.125, 0.72), '#2a1a10');
  }
  // A few lit diyas at the corners of the mat — the potter tries out his wares.
  const w = framer(l.x, l.z, l.rot);
  for (const [x, z] of [[-1.1, 1.45], [1.1, 1.45]] as const) {
    diya(b, at(x, 0.014, z));
    a.flames.add(w(x, 0.055, z));
  }

  // The wheel (chaak), low on the ground to one side, a half-thrown pot on it; a lump of clay.
  const wx = -1.9;
  const wz = -0.8;
  b.add('wood', fill(new TorusGeometry(0.4, 0.045, 5, 20).rotateX(Math.PI / 2).translate(wx, 0.1, wz), '#5a4432'));
  for (let k = 0; k < 6; k++) b.add('wood', fill(new BoxGeometry(0.76, 0.03, 0.045).rotateY((k / 6) * Math.PI).translate(wx, 0.1, wz), '#6a5038'));
  b.add('paint', new CylinderGeometry(0.12, 0.14, 0.08, 10).translate(wx, 0.13, wz), '#7a4a32');
  b.add('paint', new LatheGeometry([[0.001, 0], [0.07, 0.01], [0.09, 0.07], [0.06, 0.13], [0.065, 0.15], [0.001, 0.1]].map(([p, q]) => new Vector2(p, q)), 10).translate(wx, 0.17, wz), '#8a5a44');
  b.add('wood', fill(new CylinderGeometry(0.018, 0.018, 0.9, 5).rotateZ(1.2).translate(wx + 0.35, 0.3, wz + 0.45), '#6a5038'));
  b.add('paint', mosaic(mound(0.2, 0.16, seed + 5, 1, 0.25).translate(-1.95, 0, -0.05), ['#6a4030', '#5a3628', '#7a4a36'], seed, 0.08));
  b.add('paint', new LatheGeometry(HANDI.map(([p, q]) => new Vector2(p, q)), 10).scale(0.8, 0.8, 0.8).translate(-1.65, 0, -0.3), '#9c4a2a');

  // An old umbrella, its pole wedged between the pots.
  const ux = 1.18;
  const uz = -1.22;
  b.add('wood', fill(new CylinderGeometry(0.025, 0.025, 2.3, 6).translate(ux, 1.15, uz), '#4a3a2a'));
  const umb = latheM([[0.001, 2.35], [0.35, 2.3], [0.8, 2.12], [1.15, 1.9], [1.15, 1.9]], 8, 0.9);
  const cols = [new Color('#b8443a'), new Color('#e8dcc0')];
  const pos = umb.getAttribute('position');
  const cc = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const ang = Math.atan2(pos.getZ(i), pos.getX(i));
    const c = cols[Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 2];
    cc.set([c.r * 0.9, c.g * 0.9, c.b * 0.9], i * 3);
  }
  umb.setAttribute('color', new (Object.getPrototypeOf(pos).constructor)(cc, 3));
  b.add('fabric', umb.translate(ux, 0, uz));
  far.add('fabric', latheM([[0.001, 2.35], [1.15, 1.9]], 8, 0.9).translate(ux, 0, uz), '#c8806a');

  const f0 = b.build(a.kit, { name: `potter:${l.id}`, cast: true, noShadow: ['paint', 'wood'] });
  const f1 = far.build(a.kit, { name: `potter:${l.id}:far`, cast: false });
  root.add(lodOf([[f0, 0], [f1, 36]], 100));
  a.root.add(root);
}

// ---- Fruit stall ---------------------------------------------------------------------------------

/**
 * A fruit-seller's handcart: a wooden bed on four spoked wheels heaped with bananas, green tender
 * coconuts, mangoes, custard apples and pomegranates; banana bunches hanging from a bamboo frame
 * under a tarp, and a hand scale.
 */
export function fruitStall(a: ArtContext, l: LandmarkDef): void {
  const root = featureRoot(`landmark:fruit-stall:${l.id}`, l.x, l.z, l.rot);
  const w = framer(l.x, l.z, l.rot);
  const seed = hashId(l.id);
  const r = rng(seed);
  const b = new Batch();
  const far = new Batch();
  // Collider: x ±1.3, z −0.95…0.25, top 0.9.
  const zc = -0.35;
  const bedY = 0.8;
  for (const bb of [b, far]) {
    bb.add('wood', weather(box('wood', 2.5, 0.06, 1.15, 0, bedY, zc), '#7a5e44', { ground: 0, strength: 0 }));
    for (const [sx, sz, cx, cz] of [[2.5, 0.04, 0, zc + 0.555], [2.5, 0.04, 0, zc - 0.555], [0.04, 1.15, 1.23, zc], [0.04, 1.15, -1.23, zc]] as const) {
      bb.add('wood', fill(box('wood', sx, 0.1, sz, cx, bedY + 0.08, cz), '#6a5038'));
    }
  }
  // Chassis, axles and four bicycle-type wheels.
  for (const sz of [-1, 1]) b.add('iron', new BoxGeometry(2.3, 0.05, 0.04).translate(0, bedY - 0.06, zc + sz * 0.45));
  for (const x of [-0.8, 0.8]) {
    b.add('iron', new CylinderGeometry(0.015, 0.015, 1.1, 6).rotateX(Math.PI / 2).translate(x, 0.3, zc));
    for (const sz of [-1, 1]) {
      const wz = zc + sz * 0.52;
      b.add('iron', new TorusGeometry(0.28, 0.018, 5, 20).translate(x, 0.3, wz));
      b.add('paint', new TorusGeometry(0.3, 0.02, 5, 20).translate(x, 0.3, wz), '#1c1c1c');
      for (let k = 0; k < 8; k++) b.add('iron', new BoxGeometry(0.006, 0.54, 0.006).rotateZ((k / 8) * Math.PI).translate(x, 0.3, wz));
      b.add('iron', new CylinderGeometry(0.035, 0.035, 0.07, 8).rotateX(Math.PI / 2).translate(x, 0.3, wz));
      b.add('iron', rod(new Vector3(x, 0.3, wz), new Vector3(x + 0.05, bedY - 0.06, zc + sz * 0.45), 0.012, 4));
    }
  }
  // Handles at the back end.
  for (const sz of [-1, 1]) b.add('wood', fill(new CylinderGeometry(0.025, 0.025, 0.4, 6).rotateZ(Math.PI / 2 - 0.15).translate(-1.12, bedY + 0.02, zc + sz * 0.42), '#6a5038'));

  // The fruit, in heaps on the bed.
  const y = bedY + 0.03;
  for (let k = 0; k < 9; k++) bananaHand(b, at(-0.95 + (k % 3) * 0.2, y + Math.floor(k / 3) * 0.05, zc - 0.3 + Math.floor(k / 3) * 0.25, (r() - 0.5) * 0.8 + Math.PI / 2, 1.2), 0.75 + r() * 0.25, seed + k);
  for (let k = 0; k < 9; k++) {
    const ang = (k / 9) * Math.PI * 2;
    const rr = k < 6 ? 0.2 : 0.07;
    coconut(b, at(-0.2 + Math.cos(ang) * rr, y + 0.1 + (k < 6 ? 0 : 0.14), zc + Math.sin(ang) * rr, r() * 6), true, seed + k);
  }
  for (let k = 0; k < 16; k++) {
    const ang = r() * Math.PI * 2;
    const rr = Math.sqrt(r()) * 0.22;
    const h = 0.045 + (0.22 - rr) * 0.45;
    fruit(b, at(0.42 + Math.cos(ang) * rr, y + h, zc - 0.15 + Math.sin(ang) * rr, r() * 6, 1, (r() - 0.5) * 1.2), 0.045, r() < 0.6 ? '#e0a83a' : r() < 0.5 ? '#d88a2a' : '#8aa03a', seed + k);
  }
  for (let k = 0; k < 7; k++) {
    const g = mosaic(new IcosahedronGeometry(0.05, 1).translate(0.95 + (k % 3) * 0.1 - 0.1, y + 0.05 + (k > 4 ? 0.07 : 0), zc - 0.25 + Math.floor(k / 3) * 0.1), ['#7d9a4a', '#6a8a3a', '#8aa85a'], k, 0.12);
    b.add('paint', g);
  }
  for (let k = 0; k < 7; k++) fruit(b, at(0.4 + (k % 4) * 0.11 - 0.1, y + 0.05, zc + 0.3 - Math.floor(k / 4) * 0.1, r() * 6), 0.048, '#a8242a', seed + 40 + k, 1);
  for (let k = 0; k < 5; k++) fruit(b, at(0.95 + (k % 3) * 0.1 - 0.1, y + 0.045, zc + 0.3 - Math.floor(k / 3) * 0.1, r() * 6), 0.045, '#b8c870', seed + 50 + k, 1.05);

  // Tarp on four bamboo posts; banana bunches hanging at the back; a hand scale.
  canopy(b, -1.22, 1.22, zc - 0.52, zc + 0.52, 2.15, 2.0, '#4f7f86', 0.35, seed);
  far.add('fabric', fill(new BoxGeometry(2.8, 0.03, 1.6).translate(0, 2.1, zc + 0.15), '#4f7f86'));
  for (const bx of [-0.55, 0.45]) {
    const top = 2.1;
    b.add('paint', rod(new Vector3(bx, top, zc - 0.5), new Vector3(bx, top - 0.3, zc - 0.5), 0.012, 4), '#b8a37a');
    b.add('paint', new CylinderGeometry(0.025, 0.02, 0.7, 6).translate(bx, top - 0.62, zc - 0.5), '#6a6a3a');
    for (let k = 0; k < 6; k++) {
      const ang = k * 2.2;
      bananaHand(b, at(bx + Math.cos(ang) * 0.03, top - 0.42 - k * 0.075, zc - 0.5 + Math.sin(ang) * 0.03, ang, 1.3, -0.9), 0.35 + r() * 0.4, seed + 60 + k);
    }
  }
  b.add('iron', rod(new Vector3(0.9, 2.08, zc + 0.5), new Vector3(0.9, 1.72, zc + 0.5), 0.006, 3));
  b.add('iron', new CylinderGeometry(0.03, 0.03, 0.14, 8).translate(0.9, 1.65, zc + 0.5));
  b.add('paint', new LatheGeometry([[0.001, 0], [0.12, 0.004], [0.14, 0.035], [0.001, 0.01]].map(([p, q]) => new Vector2(p, q)), 12).translate(0.9, 1.3, zc + 0.5), '#c9cccc');
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI * 2;
    b.add('iron', rod(new Vector3(0.9, 1.58, zc + 0.5), new Vector3(0.9 + Math.cos(ang) * 0.12, 1.33, zc + 0.5 + Math.sin(ang) * 0.12), 0.002, 3));
  }
  void w;

  const f0 = b.build(a.kit, { name: `fruit-stall:${l.id}`, cast: true, noShadow: ['paint', 'iron'] });
  const f1 = far.build(a.kit, { name: `fruit-stall:${l.id}:far`, cast: false });
  root.add(lodOf([[f0, 0], [f1, 36]], 100));
  a.root.add(root);
}

// ---- Puja stall ----------------------------------------------------------------------------------

/**
 * Everything for the puja, by the temple gate: plates heaped with kumkum, haldi, gulal, bukka and
 * chandan; incense in packets and fanned in a holder; camphor; coconuts in a basket; brass diyas, a
 * bell and a samai on the stepped riser; folded red chunris; garlands on the rail above.
 */
export function pujaStall(a: ArtContext, l: LandmarkDef): void {
  const root = featureRoot(`landmark:puja-stall:${l.id}`, l.x, l.z, l.rot);
  const w = framer(l.x, l.z, l.rot);
  const seed = hashId(l.id);
  const r = rng(seed);
  const b = new Batch();
  const far = new Batch();
  // Collider: x ±0.8, z −0.85…0.05, top 0.85.
  const z0 = -0.85;
  const z1 = 0.05;
  const zc = (z0 + z1) / 2;
  const top = 0.85;
  for (const bb of [b, far]) bb.add('wood', weather(box('wood', 1.6, 0.05, 0.9, 0, top - 0.025, zc), '#5e4230', { ground: 0, strength: 0 }));
  for (const sx of [-1, 1]) for (const z of [z0 + 0.05, z1 - 0.05]) b.add('wood', fill(box('wood', 0.06, top - 0.05, 0.06, sx * 0.74, (top - 0.05) / 2, z), '#4e3626'));
  // Red cloth over the table, hanging in front, gold border.
  b.add('fabric', fill(box('fabric', 1.62, 0.006, 0.92, 0, top + 0.003, zc), '#a8281e'));
  for (const bb of [b, far]) bb.add('fabric', weather(sheet(new Vector3(-0.81, top, z1 + 0.012), new Vector3(0.81, top, z1 + 0.012), new Vector3(0.81, 0.1, z1 + 0.025), new Vector3(-0.81, 0.1, z1 + 0.025), -0.012, 8, 3), '#a8281e', { ground: 0.1, splash: 0.3, strength: 0.3 }));
  b.add('fabric', fill(sheet(new Vector3(-0.81, 0.18, z1 + 0.03), new Vector3(0.81, 0.18, z1 + 0.03), new Vector3(0.81, 0.1, z1 + 0.032), new Vector3(-0.81, 0.1, z1 + 0.032), 0, 6, 1), '#d9a93a'));
  // The stepped riser at the back.
  b.add('wood', fill(box('wood', 1.5, 0.1, 0.3, 0, top + 0.05, z0 + 0.17), '#6a4a34'));
  b.add('wood', fill(box('wood', 1.5, 0.2, 0.14, 0, top + 0.1, z0 + 0.09), '#6a4a34'));
  const y1 = top + 0.1;
  const y2 = top + 0.2;

  // Powders: kumkum, haldi, gulal, ashtagandh, bukka, chandan — cones in steel plates.
  const powders = ['#b3141c', '#e2a41c', '#e0457a', '#d8742a', '#1c1a1a', '#e8d8b0'];
  powders.forEach((c, k) => {
    const x = -0.6 + k * 0.24;
    const z = z1 - 0.2 - (k % 2) * 0.12;
    b.add('paint', new LatheGeometry([[0.001, 0], [0.085, 0.002], [0.095, 0.014], [0.001, 0.006]].map(([p, q]) => new Vector2(p, q)), 12).translate(x, top + 0.006, z), '#c3c6c6');
    const cone = new LatheGeometry([[0.075, 0], [0.06, 0.03], [0.03, 0.065], [0.008, 0.078], [0.001, 0.08]].map(([p, q]) => new Vector2(p, q)), 10).translate(x, top + 0.008, z);
    b.add('paint', mosaic(cone, [c, new Color(c).multiplyScalar(0.9).getStyle(), new Color(c).multiplyScalar(1.08).getStyle()], k, 0.04));
  });
  // On the riser: incense packets standing, a fan of sticks, camphor, brass things.
  const packs = ['#2f5f9a', '#7a2d8a', '#c8321e', '#2e8a4a', '#e8862a', '#1f6f8a', '#b01e2a'];
  for (let k = 0; k < 7; k++) {
    b.add('paint', box('paint', 0.07, 0.22, 0.025, -0.68 + k * 0.08, y2 + 0.11, z0 + 0.09), packs[k]);
    b.add('paint', box('paint', 0.05, 0.05, 0.027, -0.68 + k * 0.08, y2 + 0.15, z0 + 0.09), '#f2e6c0');
  }
  b.add('brass', new CylinderGeometry(0.03, 0.035, 0.05, 8).translate(0.05, y1 + 0.025, z0 + 0.25));
  for (let k = 0; k < 9; k++) {
    const ang = -0.6 + (k / 8) * 1.2;
    const tip = new Vector3(0.05 + Math.sin(ang) * 0.12, y1 + 0.3, z0 + 0.25 + (k % 2) * 0.02);
    b.add('paint', rod(new Vector3(0.05, y1 + 0.04, z0 + 0.25), tip, 0.0025, 3), '#5a2e22');
    if (k % 4 === 0) a.flames.add(w(tip.x, tip.y, tip.z), 0.15);
  }
  b.add('paint', new LatheGeometry([[0.001, 0], [0.07, 0.005], [0.08, 0.03], [0.001, 0.02]].map(([p, q]) => new Vector2(p, q)), 10).translate(0.3, y1, z0 + 0.25), '#c3c6c6');
  for (let k = 0; k < 8; k++) b.add('paint', box('paint', 0.022, 0.018, 0.022, 0.3 + (r() - 0.5) * 0.08, y1 + 0.03, z0 + 0.25 + (r() - 0.5) * 0.08), '#f4f4ee');
  b.add('brass', new LatheGeometry([[0.001, 0], [0.06, 0], [0.05, 0.012], [0.012, 0.03], [0.01, 0.2], [0.04, 0.21], [0.055, 0.23], [0.001, 0.225]].map(([p, q]) => new Vector2(p, q)), 10).translate(0.5, y2, z0 + 0.09));
  b.add('brass', new LatheGeometry([[0.001, 0.1], [0.04, 0.09], [0.05, 0.02], [0.055, 0], [0.045, 0.004], [0.001, 0.08]].map(([p, q]) => new Vector2(p, q)), 10).translate(0.66, y2, z0 + 0.09));
  b.add('brass', new CylinderGeometry(0.006, 0.006, 0.05, 5).translate(0.66, y2 + 0.12, z0 + 0.09));
  for (let k = 0; k < 3; k++) b.add('brass', new LatheGeometry(DIYA.map(([p, q]) => new Vector2(p, q)), 10).scale(0.7, 0.7, 0.7).translate(0.46 + k * 0.1, y1, z0 + 0.25));
  b.add('brass', new LatheGeometry(LOTA.map(([p, q]) => new Vector2(p, q)), 10).translate(-0.62, y1, z0 + 0.25));
  // Coconuts in a basket, folded chunris.
  const bh = basket(b, at(-0.35, top, z1 - 0.2), 0.14, 0.08, seed);
  for (let k = 0; k < 4; k++) coconut(b, at(-0.35 + (k % 2) * 0.1 - 0.05, top + bh + (k > 1 ? 0.07 : 0.02), z1 - 0.2 + (k === 1 ? 0.05 : -0.03), r() * 6), false, seed + k);
  for (let k = 0; k < 4; k++) {
    b.add('fabric', fill(box('fabric', 0.24, 0.025, 0.16, -0.25, y1 + 0.013 + k * 0.026, z0 + 0.25), k % 2 ? '#b8201c' : '#d0402a'));
    b.add('fabric', fill(box('fabric', 0.245, 0.006, 0.04, -0.25, y1 + 0.02 + k * 0.026, z0 + 0.315), '#d9a93a'));
  }

  // Canopy with garlands hanging from its front rail; a lantern.
  canopy(b, -0.78, 0.78, z0 + 0.02, z1 - 0.02, 2.05, 1.95, '#e0892a', 0.35, seed);
  far.add('fabric', fill(new BoxGeometry(1.9, 0.03, 1.3).translate(0, 2.0, zc + 0.15), '#e0892a'));
  bamboo(b, new Vector3(-0.8, 1.88, z1), new Vector3(0.8, 1.88, z1), 0.02, BAMBOO, seed + 5);
  for (let k = 0; k < 6; k++) hangingGarland(b, new Vector3(-0.62 + k * 0.25, 1.88, z1), 0.6 + r() * 0.2, k % 2 ? [TONE.marigold, TONE.marigoldYellow] : ['#f2efe6', '#c8323a'], seed + k);
  lantern(a, b, w, -0.6, 1.62, z0 + 0.05);

  const f0 = b.build(a.kit, { name: `puja-stall:${l.id}`, cast: true, noShadow: ['paint', 'brass', 'iron'] });
  const f1 = far.build(a.kit, { name: `puja-stall:${l.id}:far`, cast: false });
  root.add(lodOf([[f0, 0], [f1, 36]], 100));
  a.root.add(root);
}
