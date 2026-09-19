/**
 * Water: the village wells, the stepped tank, the handpump.
 *
 * Well (vihir): a basalt parapet ring with a projecting coping, dark shaft, two stone pillars and a
 * teak beam carrying an iron pulley; the rope runs down into the dark and across to a bucket on
 * the parapet; a brass kalshi, two diyas, and a toran of mango leaves under the beam.
 *
 * Tank (talav): dressed-stone rim walls with a moulded base and jointed coping slabs, a ghat of
 * three steps down on every side to still green water, lotus pads and a few pink lotuses, a sari
 * drying over the far rim and diyas along the coping.
 *
 * Handpump: an iron India Mark II on a cement pedestal, its round apron with a raised lip and a
 * drain channel, wet where the water falls.
 */
import { BoxGeometry, CircleGeometry, Color, CylinderGeometry, IcosahedronGeometry, LatheGeometry, PlaneGeometry, TorusGeometry, Vector2, Vector3 } from 'three';
import type { LandmarkDef } from '../../types';
import { rng } from './canvasTextures';
import { Batch, beam, box, catenary, fill, slab, weather } from './geom';
import { TONE } from './palette';
import { at, diya, featureRoot, framer, garland, hashId, latheM, lodOf, LOTA, marigoldHeap, pot, rod, shade, sheet, MATKA } from './props.parts';
import type { ArtContext } from './runtime';

// ---- Well --------------------------------------------------------------------------------------

const WELL_H = 0.85;
const WELL_IN = 0.77;

/** The parapet ring's cross-section, revolved: base band, wall, projecting coping, inner shaft. */
const RING: [number, number][] = [
  [1.08, 0], [1.08, 0.13], [1.08, 0.13], [1.04, 0.14], [1.04, 0.14], [1.04, 0.74], [1.04, 0.74], [1.09, 0.75], [1.09, 0.75], [1.09, 0.85], [1.09, 0.85],
  [WELL_IN, 0.85], [WELL_IN, 0.85], [WELL_IN, 0.01],
];

export function well(a: ArtContext, l: LandmarkDef): void {
  const root = featureRoot(`landmark:well:${l.id}`, l.x, l.z, l.rot);
  const w = framer(l.x, l.z, l.rot);
  const seed = hashId(l.id);
  const garden = l.id.startsWith('garden');
  const full = new Batch();
  const far = new Batch();

  for (const [b, segs] of [[full, 28], [far, 14]] as const) {
    const ring = latheM(RING, segs, 1.4);
    weather(ring, garden ? '#a39888' : '#8f887c', { ground: 0, splash: 0.5, strength: 0.35, top: WELL_H, topStrength: -0.15, seed });
    // The shaft darkens to black as it goes down.
    shade(ring, (x, y, z) => (Math.hypot(x, z) < WELL_IN + 0.01 ? 0.12 + 0.88 * Math.min(y / WELL_H, 1) ** 1.6 : 1));
    b.add('stone', ring);
    b.add('paint', new CircleGeometry(WELL_IN + 0.01, segs).rotateX(-Math.PI / 2).translate(0, 0.012, 0), '#0b0907');
  }
  // A worn stone apron round the foot of the ring.
  // (Profiles run outside-in so the top faces up.) Darker where the bucket is set down and water slops.
  const apron = weather(latheM([[1.62, 0.0], [1.5, 0.03], [1.06, 0.035]], 28, 1.4), '#8d877b', { ground: 0, strength: 0 });
  full.add('stone', shade(apron, (x, _y, z) => 0.62 + 0.38 * Math.min(Math.hypot(x + 0.75, z - 0.75) / 0.9, 1)));

  // Pulley frame: stone pillars (or whitewashed ones in the garden) and a teak beam.
  const px = 0.925;
  const ph = 2.25;
  for (const [b, lvl] of [[full, 0], [far, 1]] as const) {
    for (const sx of [-1, 1]) {
      b.add('stone', weather(slab('stone', 0.22, ph - WELL_H, 0.22, sx * px, WELL_H + (ph - WELL_H) / 2, 0, 3), garden ? '#d9d0bd' : '#a1998b', { ground: WELL_H, splash: 0.3, strength: 0.2, seed }));
      if (lvl === 0) b.add('stone', fill(box('stone', 0.3, 0.08, 0.3, sx * px, ph + 0.04, 0), '#8f887c'));
    }
    b.add('teak', fill(beam(new Vector3(-px - 0.2, ph + 0.15, 0), new Vector3(px + 0.2, ph + 0.15, 0), 0.14, 0.14), '#5e4330'));
  }
  // The iron pulley on its bracket, the rope, the bucket.
  const wy = ph + 0.15 - 0.3;
  full.add('iron', new BoxGeometry(0.04, 0.2, 0.08).translate(0, ph + 0.15 - 0.15, 0));
  full.add('iron', new TorusGeometry(0.12, 0.022, 6, 18).translate(0, wy, 0));
  full.add('iron', new CylinderGeometry(0.03, 0.03, 0.08, 8).rotateX(Math.PI / 2).translate(0, wy, 0));
  for (let k = 0; k < 6; k++) full.add('iron', new BoxGeometry(0.012, 0.22, 0.012).rotateZ((k / 6) * Math.PI).translate(0, wy, 0));
  const rope = '#b39b72';
  full.add('paint', rod(new Vector3(0.12, wy, 0), new Vector3(0.12, 0.25, 0.02), 0.011, 5), rope);
  const bucketAt = new Vector3(-0.62, WELL_H, 0.62);
  full.add('paint', rod(new Vector3(-0.12, wy, 0), bucketAt.clone().setY(WELL_H + 0.36), 0.011, 5), rope);
  const bucket = latheM([[0.001, 0.005], [0.1, 0.005], [0.105, 0.012], [0.13, 0.24], [0.135, 0.25], [0.12, 0.245], [0.001, 0.2]], 14, 1);
  full.add('paint', weather(bucket, '#9a9d9a', { ground: 0, strength: 0.25 }), at(bucketAt.x, bucketAt.y, bucketAt.z));
  full.add('iron', new TorusGeometry(0.13, 0.006, 4, 12, Math.PI).rotateY(0.8).translate(bucketAt.x, WELL_H + 0.25, bucketAt.z));
  // Rope coiled on the coping, a brass kalshi, two diyas lit for the festival.
  full.add('paint', new TorusGeometry(0.1, 0.022, 5, 14).rotateX(Math.PI / 2).translate(-0.3, WELL_H + 0.022, 0.87), rope);
  full.add('paint', new TorusGeometry(0.075, 0.02, 5, 12).rotateX(Math.PI / 2).translate(-0.3, WELL_H + 0.055, 0.87), rope);
  full.add('brass', new LatheGeometry(LOTA.map(([x, y]) => new Vector2(x, y)), 12).scale(1.7, 1.7, 1.7).translate(0.66, WELL_H, 0.6));
  for (const ang of [0.35, 2.3]) {
    const x = Math.cos(ang) * 0.93;
    const z = Math.sin(ang) * 0.93;
    diya(full, at(x, WELL_H, z));
    a.flames.add(w(x, WELL_H + 0.04, z));
  }
  // A toran of mango leaves and marigolds under the beam, and a garland on each pillar.
  garland(full, catenary(new Vector3(-px + 0.12, ph + 0.07, 0.08), new Vector3(px - 0.12, ph + 0.07, 0.08), 0.12, 20), { bead: 0.03, every: 1 });
  for (const sx of [-1, 1]) {
    const ring: Vector3[] = [];
    for (let k = 0; k <= 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      ring.push(new Vector3(sx * px + Math.cos(ang) * 0.15, ph - 0.12 - Math.sin(ang * 0.5) * 0.12, Math.sin(ang) * 0.15));
    }
    garland(full, ring, { bead: 0.028 });
  }

  const f0 = full.build(a.kit, { name: `well:${l.id}`, cast: true, noShadow: ['paint', 'brass', 'iron'] });
  const f1 = far.build(a.kit, { name: `well:${l.id}:far`, cast: true, noShadow: ['paint'] });
  root.add(lodOf([[f0, 0], [f1, 38]], 120));
  a.root.add(root);
}

// ---- Tank ----------------------------------------------------------------------------------------

/** Rim outer half-extents and height (the colliders), step run and rise down to the water. */
const TANK_X = 4.5;
const TANK_Z = 3.45;
const RIM_T = 0.5;
const RIM_H = 0.6;
const STEP_RUN = 0.3;
const WATER_Y = 0.1;

export function tank(a: ArtContext, l: LandmarkDef): void {
  const root = featureRoot(`landmark:pond:${l.id}`, l.x, l.z, l.rot);
  const w = framer(l.x, l.z, l.rot);
  const seed = hashId(l.id);
  const r = rng(seed);
  const full = new Batch();
  const far = new Batch();
  const basalt = '#8b8478';
  const ix = TANK_X - RIM_T;
  const iz = TANK_Z - RIM_T;

  for (const [b, lvl] of [[full, 0], [far, 1]] as const) {
    // Rim walls, on their colliders: north and south full length, east and west between them.
    const walls: [number, number, number, number][] = [
      [2 * TANK_X, RIM_T, 0, TANK_Z - RIM_T / 2],
      [2 * TANK_X, RIM_T, 0, -TANK_Z + RIM_T / 2],
      [RIM_T, 2 * iz, TANK_X - RIM_T / 2, 0],
      [RIM_T, 2 * iz, -TANK_X + RIM_T / 2, 0],
    ];
    for (const [sx, sz, cx, cz] of walls) {
      b.add('stone', weather(slab('stone', sx, RIM_H - 0.08, sz, cx, (RIM_H - 0.08) / 2, cz, 3), basalt, { ground: 0, splash: 0.4, strength: 0.4, seed }));
    }
    // The steps: three rectangular rings, each a rise lower and a run further in.
    for (let k = 0; k < 3; k++) {
      const top = RIM_H - 0.15 * (k + 1);
      const ox = ix - STEP_RUN * k;
      const oz = iz - STEP_RUN * k;
      const ring: [number, number, number, number][] = [
        [2 * ox, STEP_RUN, 0, oz - STEP_RUN / 2],
        [2 * ox, STEP_RUN, 0, -oz + STEP_RUN / 2],
        [STEP_RUN, 2 * (oz - STEP_RUN), ox - STEP_RUN / 2, 0],
        [STEP_RUN, 2 * (oz - STEP_RUN), -ox + STEP_RUN / 2, 0],
      ];
      for (const [sx, sz, cx, cz] of ring) {
        const g = weather(slab('stone', sx, top, sz, cx, top / 2, cz, 2), '#948c7e', { ground: WATER_Y, splash: 0.25, strength: 0.55, seed: seed + k });
        // Green-black algae at the waterline.
        b.add('stone', shade(g, (_x, y) => (y < WATER_Y + 0.08 ? 0.55 : 1)));
      }
    }
    b.add('water', new PlaneGeometry(2 * ix, 2 * iz).rotateX(-Math.PI / 2).translate(0, WATER_Y, 0));
    if (lvl === 1) continue;
    // Moulded base band outside, and the coping: jointed slabs, slightly proud.
    for (const [sx, sz, cx, cz] of walls) {
      const ns = sx > sz;
      b.add('stone', weather(box('stone', ns ? sx + 0.06 : sx + 0.06, 0.13, ns ? sz + 0.06 : sz - 0.06, cx, 0.065, cz), '#7d776c', { ground: 0, splash: 0.13, strength: 0.3 }));
    }
    const slabLen = 0.9;
    for (const [sx, sz, cx, cz] of walls) {
      const alongX = sx > sz;
      const L = alongX ? sx : sz;
      const n = Math.max(1, Math.round(L / slabLen));
      for (let k = 0; k < n; k++) {
        const t = -L / 2 + (L / n) * (k + 0.5);
        const len = L / n - 0.012;
        const tone = new Color('#a59d8f').multiplyScalar(0.92 + r() * 0.12);
        const g = alongX ? box('stone', len, 0.08, RIM_T + 0.06, cx + t, RIM_H - 0.04, cz) : box('stone', RIM_T + 0.06, 0.08, len - (k === 0 || k === n - 1 ? 0.03 : 0), cx, RIM_H - 0.04 + 0.001, cz + t);
        b.add('stone', weather(g, tone, { ground: 0, strength: 0 }));
      }
    }
  }

  // Lotus pads, flowers and buds, drifting toward the north-east corner.
  const pads = new Batch();
  for (let k = 0; k < 26; k++) {
    const cx = (r() * 0.9 + 0.1) * (ix - 0.95) * (r() < 0.7 ? 1 : -1);
    const cz = (r() - 0.35) * 2 * (iz - 0.95);
    const rr = 0.12 + r() * 0.2;
    const notch = 0.35;
    const pad = new CircleGeometry(rr, 11, r() * 6 + notch / 2, Math.PI * 2 - notch).rotateX(-Math.PI / 2).translate(cx, WATER_Y + 0.004 + k * 0.0002, Math.max(-(iz - 0.95), Math.min(iz - 0.95, cz)));
    fill(pad, new Color('#46693a').offsetHSL((r() - 0.5) * 0.04, (r() - 0.5) * 0.15, (r() - 0.5) * 0.08));
    pads.add('paint', pad);
    if (k % 6 === 0) lotus(pads, cx + rr * 0.3, WATER_Y + 0.01, Math.max(-(iz - 0.95), Math.min(iz - 0.95, cz)) - rr * 0.2, r);
    if (k % 7 === 3) {
      const bx = cx - rr * 0.5;
      const bz = Math.max(-(iz - 0.95), Math.min(iz - 0.95, cz)) + rr * 0.4;
      pads.add('paint', rod(new Vector3(bx, WATER_Y, bz), new Vector3(bx + 0.02, WATER_Y + 0.22, bz), 0.006, 4), '#4f6a2e');
      pads.add('paint', new LatheGeometry([[0.001, 0], [0.028, 0.03], [0.022, 0.07], [0.001, 0.1]].map(([x, y]) => new Vector2(x, y)), 7).translate(bx + 0.02, WATER_Y + 0.2, bz), '#d77a9a');
    }
  }

  // A sari drying over the south rim; a brass handa and folded washing on the coping; diyas.
  const sx0 = -1.6;
  const sariW = 1.3;
  const sari = '#3d7a6c';
  const top = RIM_H + 0.005;
  const zOut = TANK_Z + 0.035;
  const zIn = TANK_Z - RIM_T - 0.035;
  full.add('fabric', weather(sheet(new Vector3(sx0, top, zIn + 0.02), new Vector3(sx0 + sariW, top, zIn + 0.02), new Vector3(sx0 + sariW, top, zOut - 0.02), new Vector3(sx0, top, zOut - 0.02), 0, 4, 1), sari, { ground: 0, strength: 0 }));
  full.add('fabric', fill(sheet(new Vector3(sx0, top, zOut), new Vector3(sx0 + sariW, top, zOut), new Vector3(sx0 + sariW - 0.05, 0.12, zOut + 0.02), new Vector3(sx0 + 0.04, 0.1, zOut + 0.02), -0.02, 4, 3), sari));
  full.add('fabric', fill(sheet(new Vector3(sx0 + sariW, top, zIn), new Vector3(sx0, top, zIn), new Vector3(sx0 + 0.05, RIM_H - 0.13, zIn - 0.02), new Vector3(sx0 + sariW - 0.03, RIM_H - 0.12, zIn - 0.02), -0.02, 4, 2), sari));
  full.add('fabric', fill(box('paint', sariW, 0.004, 0.08, sx0 + sariW / 2, 0.14, zOut + 0.024), '#c9a13a'));
  full.add('brass', new LatheGeometry(MATKA.map(([x, y]) => new Vector2(x, y)), 12).scale(0.75, 0.75, 0.75).translate(TANK_X - 0.25, RIM_H, 1.2));
  full.add('fabric', weather(box('fabric', 0.45, 0.1, 0.32, TANK_X - 0.25, RIM_H + 0.05, 0.55), '#c9b690', { ground: RIM_H, strength: 0.2 }));
  full.add('fabric', fill(box('fabric', 0.42, 0.06, 0.3, TANK_X - 0.25, RIM_H + 0.13, 0.56), '#8a3a4a'));
  for (const [dx, dz] of [[-3.2, -TANK_Z + 0.25], [3.2, -TANK_Z + 0.25], [-TANK_X + 0.25, 1.8], [TANK_X - 0.25, -1.9], [1.2, TANK_Z - 0.25]] as const) {
    diya(full, at(dx, RIM_H, dz));
    a.flames.add(w(dx, RIM_H + 0.04, dz));
  }
  // Flowers someone left on the steps: a little heap of marigolds and a clay pot.
  marigoldHeap(full, at(-ix + 0.2, RIM_H - 0.15, -1.2), 0.12, 0.07, seed);
  pot(full, MATKA, at(-ix + 0.18, RIM_H - 0.15, 1.0, 0.4), '#9c4a2a', seed);

  const f0 = full.build(a.kit, { name: `tank:${l.id}`, cast: true, noShadow: ['paint', 'brass', 'fabric', 'water'] });
  f0.add(pads.build(a.kit, { name: `tank:${l.id}:lotus`, cast: false }));
  const f1 = far.build(a.kit, { name: `tank:${l.id}:far`, cast: true, noShadow: ['water'] });
  root.add(lodOf([[f0, 0], [f1, 45]], 140));
  a.root.add(root);
}

/** A pink lotus: two rings of cupped petals round a yellow seed head. */
function lotus(b: Batch, x: number, y: number, z: number, r: () => number): void {
  const pink = new Color('#e58aa8');
  for (const [n, len, tilt, k] of [[8, 0.07, 0.95, 0.85], [6, 0.06, 0.45, 1]] as const) {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + k;
      const p = new IcosahedronGeometry(1, 0).scale(0.022, len / 2, 0.012).translate(0, len / 2, 0).rotateX(tilt).rotateY(-ang + Math.PI / 2);
      b.add('paint', p.translate(x, y, z), pink.clone().multiplyScalar(0.9 + r() * 0.15));
    }
  }
  b.add('paint', new CylinderGeometry(0.018, 0.012, 0.02, 8).translate(x, y + 0.03, z), '#e8c040');
}

// ---- Handpump ------------------------------------------------------------------------------------

export function handpump(a: ArtContext, l: LandmarkDef): void {
  const root = featureRoot(`landmark:handpump:${l.id}`, l.x, l.z, l.rot);
  const full = new Batch();
  const far = new Batch();
  const iron = '#3f6480';
  const seed = hashId(l.id);

  for (const [b, lvl] of [[full, 0], [far, 1]] as const) {
    // Round cement apron with a raised lip, stained dark where the water falls.
    const apron = latheM([[0.99, 0.0], [0.94, 0.09], [0.86, 0.09], [0.82, 0.05], [0.8, 0.045], [0.001, 0.05]], lvl ? 12 : 24, 2.2);
    weather(apron, TONE.cement, { ground: 0, strength: 0 });
    shade(apron, (x, _y, z) => 0.62 + 0.38 * Math.min(Math.hypot(x, z - 0.35) / 0.8, 1));
    b.add('plaster', apron);
    b.add('plaster', weather(box('plaster', 0.36, 0.3, 0.36, 0, 0.2, 0), '#b3ad9f', { ground: 0.05, splash: 0.3, strength: 0.4 }));
    // Standpipe, pump head and cap, painted and rusting.
    b.add('paint', weather(new CylinderGeometry(0.065, 0.075, 0.62, 12).translate(0, 0.66, 0), iron, { ground: 0.35, splash: 0.3, strength: 0.35, seed }));
    b.add('paint', weather(box('paint', 0.2, 0.26, 0.2, 0, 1.08, 0), iron, { ground: 0.95, splash: 0.2, strength: 0.2, seed }));
    b.add('paint', fill(box('paint', 0.25, 0.04, 0.25, 0, 1.23, 0), new Color(iron).multiplyScalar(0.8)));
  }
  // Spout, handle, bolts; a brass kalshi waiting under the spout; the drain channel.
  full.add('paint', rod(new Vector3(0, 0.8, 0.05), new Vector3(0, 0.74, 0.36), 0.032, 8, false), iron);
  full.add('paint', rod(new Vector3(0, 0.74, 0.36), new Vector3(0, 0.7, 0.38), 0.036, 8, false), '#2a2a2a');
  full.add('paint', rod(new Vector3(0, 1.2, -0.08), new Vector3(0, 1.94, -0.7), 0.022, 6, false), iron);
  full.add('paint', rod(new Vector3(0, 1.88, -0.65), new Vector3(0, 2.02, -0.77), 0.03, 6, false), '#262626');
  full.add('paint', new BoxGeometry(0.06, 0.12, 0.06).translate(0, 1.26, -0.08), iron);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) full.add('iron', new CylinderGeometry(0.014, 0.014, 0.02, 6).translate(sx * 0.07, 1.26, sz * 0.07));
  full.add('brass', new LatheGeometry(MATKA.map(([x, y]) => new Vector2(x, y)), 12).scale(0.55, 0.55, 0.55).translate(0.16, 0.05, 0.4));
  full.add('plaster', weather(box('plaster', 0.3, 0.06, 1.3, 0.55, 0.03, 1.2, -0.5), TONE.cement, { ground: 0, strength: 0 }));
  full.add('paint', box('paint', 0.14, 0.004, 1.25, 0.55, 0.061, 1.2, -0.5), '#4a4a44');

  const f0 = full.build(a.kit, { name: `handpump:${l.id}`, cast: true, noShadow: ['paint', 'brass', 'iron'] });
  const f1 = far.build(a.kit, { name: `handpump:${l.id}:far`, cast: false });
  root.add(lodOf([[f0, 0], [f1, 32]], 90));
  a.root.add(root);
}
