/**
 * The village's trees, one builder per species, each grown from its seed so no two match:
 *
 *   banyan  — a fused cluster of stems (the collider's 1.1 m radius), long near-level limbs, a
 *             vast low dome, pillar roots dropping to the chabutra and curtains of hanging roots
 *   peepal  — tall fluted grey trunk, ascending limbs, an airy crown of heart-shaped leaves
 *   neem    — straight dark trunk forking at ~3 m, feathery bright foliage in loose clumps
 *   mango   — short dark trunk, spreading limbs, a dense dark dome with copper new flush
 *   coconut — curved ringed trunk, drooping fronds in a spiral, coconut bunches, a dead frond
 *   banana  — pseudostem, arching torn leaves, a dried leaf hanging, some with a hanging bunch
 *             and the purple flower bud, suckers at the foot
 *
 * Trunks match the colliders in solids.ts (TRUNK radius × scale, the lowest 4 m).
 */
import { Color, IcosahedronGeometry, Vector3 } from 'three';
import type { TreeDef, TreeKind } from '../../types';
import { rng } from './canvasTextures';
import { hashf, lathe } from './geom';
import { type CardSet, type Merger, quadCell, tint } from './trees.gpu';
import { VEG } from './trees.paint';
import { along, blade, bough, type Clump, crown, type CrownLook, dirFrom, range, type Rnd, taper, tube, UP } from './trees.shape';
import { LEAF_QUAD } from './canvasTextures';

/** Collider radii at scale 1 (solids.ts TRUNK). */
export const TRUNK_R: Record<TreeKind, number> = { banyan: 1.1, peepal: 0.7, neem: 0.3, mango: 0.34, coconut: 0.2, banana: 0.15 };

const TAU = Math.PI * 2;
const BARK_TILE = 1.4;

/** Where a species writes: merged bark / fronds / banana leaves / painted bits, and two card sets. */
export interface Grove {
  merge: Merger;
  /** Cards from the shared leaf atlas (neem, mango, banyan, shrub). */
  leaves: CardSet;
  /** Cards from the vegetation atlas (peepal, crops) — these cast shadows. */
  veg: CardSet;
  /** Vegetation-atlas cards too small to cast shadows (flowers, weeds, litter). */
  small: CardSet;
  /** May a leaf card of this size sit here (not inside a roof or wall)? */
  clear: (p: Vector3, size: number) => boolean;
}

export function buildTree(g: Grove, t: TreeDef): void {
  switch (t.kind) {
    case 'banyan':
      return banyan(g, t);
    case 'peepal':
      return broadleaf(g, t, PEEPAL);
    case 'neem':
      return broadleaf(g, t, NEEM);
    case 'mango':
      return broadleaf(g, t, MANGO);
    case 'coconut':
      return coconut(g, t);
    case 'banana':
      return banana(g, t);
  }
}

// ---- bark ------------------------------------------------------------------------------------------

/**
 * Bark tint — a linear multiplier on the bark texture (1 = as photographed): the species' colour,
 * damp and mossy at the foot, never a flat swatch.
 */
function barkTint(m: readonly [number, number, number], seed: number, footY = 0): (t: number, a: number, p: Vector3) => Color {
  const base = new Color(...m);
  const moss = new Color(0.62, 0.78, 0.4);
  const c = new Color();
  return (_t, _a, p) => {
    const n = hashf(p.x * 2.1 + seed, p.y * 3.3, p.z * 2.7);
    const foot = Math.max(0, 1 - (p.y - footY) / 0.9);
    c.copy(base).multiplyScalar(0.86 + 0.24 * n);
    c.lerp(moss, foot * 0.35 * (0.5 + n * 0.5));
    return c.multiplyScalar(1 - foot * 0.3);
  };
}

// ---- broadleaf trees ------------------------------------------------------------------------------

interface Spec {
  bark: readonly [number, number, number];
  /** Height of the first fork (m at scale 1). */
  trunk: readonly [number, number];
  sides: number;
  /** Radius at the fork, as a share of the base radius. */
  neck: number;
  limbs: readonly [number, number];
  /** Limb angle from vertical, radians. */
  spread: readonly [number, number];
  limbLen: readonly [number, number];
  rise: number;
  twigs: number;
  clumpR: readonly [number, number];
  /** Extra clump over the fork, as a height above it (m at scale 1). */
  topClump: number;
  look: CrownLook;
  atlas: 'leaves' | 'veg';
  flute?: number;
}

const NEEM: Spec = {
  bark: [0.8, 0.84, 0.9],
  trunk: [2.6, 3.2],
  sides: 8,
  neck: 0.78,
  limbs: [4, 5],
  spread: [0.3, 0.62],
  limbLen: [3.0, 4.0],
  rise: 0.1,
  twigs: 2,
  clumpR: [1.35, 1.75],
  topClump: 3.6,
  look: { cell: quadCell(LEAF_QUAD.neem), tint: new Color(1.02, 1.04, 0.9), card: [1.4, 1.85], density: 2.3, flat: 0.8, sway: 0.07 },
  atlas: 'leaves',
};

const MANGO: Spec = {
  bark: [0.55, 0.55, 0.6],
  trunk: [1.8, 2.2],
  sides: 8,
  neck: 0.8,
  limbs: [5, 6],
  spread: [0.7, 1.0],
  limbLen: [2.8, 3.5],
  rise: 0.3,
  twigs: 2,
  clumpR: [1.6, 2.0],
  topClump: 3.4,
  look: { cell: quadCell(LEAF_QUAD.mango), tint: new Color(0.95, 1.0, 0.95), card: [1.7, 2.25], density: 2.6, flat: 0.78, sway: 0.045, flush: { share: 0.03, tint: new Color(1.3, 0.95, 0.75) } },
  atlas: 'leaves',
};

const PEEPAL: Spec = {
  bark: [1.5, 1.72, 1.95],
  trunk: [4.6, 5.2],
  sides: 12,
  neck: 0.62,
  limbs: [5, 6],
  spread: [0.3, 0.62],
  limbLen: [5.0, 6.4],
  rise: 0.08,
  twigs: 3,
  clumpR: [2.0, 2.5],
  topClump: 6.5,
  look: { cell: VEG.peepal, tint: new Color(1.0, 1.03, 0.94), card: [1.9, 2.4], density: 2.5, flat: 0.8, sway: 0.09 },
  atlas: 'veg',
  flute: 0.07,
};

function broadleaf(g: Grove, t: TreeDef, s: Spec): void {
  const r = rng(t.seed * 7919 + 17);
  const k = t.scale;
  const r0 = TRUNK_R[t.kind] * k;
  const forkH = range(r, s.trunk) * k;
  const bark = barkTint(s.bark, t.seed);

  // Trunk: a gentle lean that stays inside the collider up to 4 m.
  const leanYaw = r() * TAU;
  const lean = new Vector3(Math.cos(leanYaw), 0, Math.sin(leanYaw)).multiplyScalar(0.1 * k);
  const trunk: Vector3[] = [];
  const rows = 8;
  for (let i = 0; i <= rows; i++) {
    const f = i / rows;
    trunk.push(new Vector3(t.x, -0.3 + (forkH + 0.5) * f, t.z).addScaledVector(lean, f * f));
  }
  const radii = trunk.map((p) => {
    const f = Math.max(0, p.y) / forkH;
    const flare = Math.max(0, 1 - p.y / 0.5) * 0.045;
    return r0 * (1 - (1 - s.neck) * f ** 0.9) + flare;
  });
  const flute = s.flute ? (tt: number, a: number) => 1 + (s.flute as number) * Math.sin(a * 5 + tt * 2) * (1 - tt * 0.5) : undefined;
  g.merge.add('bark', tube(trunk, radii, s.sides, { tile: BARK_TILE, colour: bark, flute }));

  // Limbs from the top of the trunk, then twigs off the limbs; leaf clumps at every tip.
  const clumps: Clump[] = [];
  const rNeck = r0 * s.neck;
  const n = Math.round(range(r, s.limbs));
  const tips: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * TAU + (r() - 0.5) * 0.8;
    const start = along(trunk, 0.8 + r() * 0.18).p;
    const len = range(r, s.limbLen) * k;
    const path = bough(start, dirFrom(yaw, range(r, s.spread)), len, 5, s.rise, 0.22, r);
    const rl = rNeck * (0.55 + r() * 0.15);
    g.merge.add('bark', tube(path, taper(path.length, rl, 0.05 * k), Math.max(5, s.sides - 3), { tile: BARK_TILE, colour: bark }));
    const tip = path[path.length - 1];
    tips.push(tip);
    clumps.push({ c: tip.clone().addScaledVector(UP, 0.2 * k), r: range(r, s.clumpR) * k });
    for (let j = 0; j < s.twigs; j++) {
      const at = along(path, 0.4 + r() * 0.4);
      const side = (j % 2 ? 1 : -1) * (0.6 + r() * 0.5);
      const d = at.d.clone().applyAxisAngle(UP, side).addScaledVector(UP, 0.35).normalize();
      const tw = bough(at.p, d, len * (0.35 + r() * 0.2), 3, s.rise, 0.25, r);
      g.merge.add('bark', tube(tw, taper(tw.length, rl * 0.5, 0.03 * k), 4, { tile: BARK_TILE, colour: bark }));
      clumps.push({ c: tw[tw.length - 1].clone(), r: range(r, s.clumpR) * k * 0.82 });
    }
  }
  // A clump over the fork fills the top of the dome.
  const top = trunk[trunk.length - 1].clone().addScaledVector(UP, s.topClump * k);
  clumps.push({ c: top, r: range(r, s.clumpR) * k * 1.2 });
  crown(s.atlas === 'veg' ? g.veg : g.leaves, clumps, s.look, r, g.clear);

  if (t.kind === 'peepal') threads(g, new Vector3(t.x, 0, t.z), r0 * (1 + (s.flute ?? 0)) + 0.02, 1.15, 5, r);
}

// ---- banyan -----------------------------------------------------------------------------------------

/** Top of the stone chabutra the banyan grows from. */
export const CHABUTRA_H = 0.5;

function banyan(g: Grove, t: TreeDef): void {
  const r = rng(t.seed * 7919 + 3);
  const k = t.scale;
  const C = new Vector3(t.x, 0, t.z);
  const R = TRUNK_R.banyan * k;
  const bark = barkTint([1.15, 1.25, 1.35], t.seed, CHABUTRA_H);
  const rootTint = barkTint([1.35, 1.2, 1.1], t.seed + 5, CHABUTRA_H);
  const clumps: Clump[] = [];
  const look: CrownLook = { cell: quadCell(LEAF_QUAD.banyan), tint: new Color(0.98, 1.02, 0.95), card: [2.0, 2.7], density: 2.4, flat: 0.62, sway: 0.05 };

  // A core, and stems fused round it — the old tree is many trunks grown together. Their outer
  // faces trace the collider's circle.
  const coreTop = 4.6 * k;
  const core = [new Vector3(C.x, -0.2, C.z), new Vector3(C.x, 1.5, C.z), new Vector3(C.x + 0.1, 3.2, C.z), new Vector3(C.x + 0.15, coreTop, C.z - 0.1)];
  g.merge.add('bark', tube(core, [R * 0.78, R * 0.72, R * 0.66, R * 0.5], 12, { tile: BARK_TILE, colour: bark }));
  const stems = 6;
  const limbs: Vector3[][] = [];
  for (let i = 0; i < stems; i++) {
    const a = (i / stems) * TAU + (r() - 0.5) * 0.4;
    const rs = (0.36 + r() * 0.12) * k;
    const rho = R - rs * 0.96;
    const twist = (r() - 0.5) * 0.5;
    const topY = (3.6 + r() * 0.8) * k;
    const pts: Vector3[] = [];
    for (let j = 0; j <= 6; j++) {
      const f = j / 6;
      const aa = a + twist * f;
      pts.push(new Vector3(C.x + Math.cos(aa) * rho, -0.2 + (topY + 0.2) * f, C.z + Math.sin(aa) * rho));
    }
    const radii = pts.map((p) => rs * (1 + Math.max(0, 1 - (p.y - CHABUTRA_H) / 0.6) * 0.18));
    g.merge.add('bark', tube(pts, radii, 7, { tile: BARK_TILE, colour: bark }));
    // Each stem becomes a great, nearly level limb.
    const yaw = a + twist + (r() - 0.5) * 0.3;
    const len = (5.4 + r() * 1.4) * k;
    const limb = bough(pts[pts.length - 1], dirFrom(yaw, 1.05 + r() * 0.3), len, 7, 0.05, 0.12, r);
    g.merge.add('bark', tube(limb, taper(limb.length, rs * 0.85, 0.09 * k, 0.9), 6, { tile: BARK_TILE, colour: bark }));
    limbs.push(limb);
    for (const f of [0.45, 0.75, 1]) {
      const at = along(limb, f).p;
      clumps.push({ c: at.addScaledVector(UP, (0.9 + r() * 0.6) * k), r: (2.1 + r() * 0.6) * k });
    }
    for (let j = 0; j < 2; j++) {
      const at = along(limb, 0.3 + r() * 0.5);
      const d = at.d.clone().applyAxisAngle(UP, (j ? 1 : -1) * (0.7 + r() * 0.4)).addScaledVector(UP, 0.45).normalize();
      const br = bough(at.p, d, (2.4 + r() * 1.2) * k, 3, 0.1, 0.2, r);
      g.merge.add('bark', tube(br, taper(br.length, rs * 0.4, 0.04 * k), 4, { tile: BARK_TILE, colour: bark }));
      clumps.push({ c: br[br.length - 1].clone().addScaledVector(UP, 0.5 * k), r: (1.9 + r() * 0.5) * k });
    }
  }
  // Upright limbs from the core raise the dome's crown.
  for (let i = 0; i < 3; i++) {
    const up = bough(core[core.length - 1], dirFrom((i / 3) * TAU + r(), 0.25 + r() * 0.3), (3.6 + r()) * k, 4, 0.05, 0.15, r);
    g.merge.add('bark', tube(up, taper(up.length, R * 0.32, 0.07 * k), 6, { tile: BARK_TILE, colour: bark }));
    clumps.push({ c: up[up.length - 1].clone().addScaledVector(UP, 0.6 * k), r: (2.6 + r() * 0.5) * k });
  }
  crown(g.leaves, clumps, look, r, g.clear);

  // Pillar roots: a few thick ones dropped to the chabutra from the inner limbs.
  const platformR = 3.2;
  for (let i = 0; i < stems; i += 1) {
    if (i % 2 && r() < 0.6) continue;
    const limb = limbs[i];
    // Where the limb passes 1.8–2.9 m from the centre.
    const want = 1.8 + r() * 1.1;
    let top = limb[0];
    for (const p of limb) if (Math.hypot(p.x - C.x, p.z - C.z) <= want) top = p;
    const d = Math.hypot(top.x - C.x, top.z - C.z);
    if (d < 1.5 || d > platformR - 0.3) continue;
    const pr = (0.1 + r() * 0.06) * k;
    const pts: Vector3[] = [];
    for (let j = 0; j <= 5; j++) {
      const f = j / 5;
      pts.push(new Vector3(top.x + (r() - 0.5) * 0.08, top.y - 0.1 - (top.y - 0.1 - CHABUTRA_H + 0.15) * f, top.z + (r() - 0.5) * 0.08));
    }
    const radii = pts.map((_, j) => pr * (0.8 + 0.2 * (j / 5)) * (j === 5 ? 1.45 : 1));
    g.merge.add('bark', tube(pts, radii, 6, { tile: BARK_TILE, colour: rootTint }));
  }

  // Hanging roots: curtains of thin strands, all ending well above head height.
  for (const limb of limbs) {
    for (let b = 0; b < 5; b++) {
      const at = along(limb, 0.28 + r() * 0.66).p;
      const strands = 3 + Math.floor(r() * 4);
      for (let s = 0; s < strands; s++) {
        const x = at.x + (r() - 0.5) * 0.5;
        const z = at.z + (r() - 0.5) * 0.5;
        const y0 = at.y - 0.15;
        const y1 = Math.max(2.05, y0 - (0.8 + r() * 2.6));
        if (y0 - y1 < 0.4) continue;
        const pts = [new Vector3(x, y0, z), new Vector3(x + (r() - 0.5) * 0.06, (y0 + y1) / 2, z + (r() - 0.5) * 0.06), new Vector3(x + (r() - 0.5) * 0.1, y1, z + (r() - 0.5) * 0.1)];
        g.merge.add('bark', tube(pts, [0.03, 0.022, 0.01], 3, { tile: BARK_TILE, colour: rootTint }));
      }
    }
  }

  // Vat Purnima: red and yellow threads wound round the trunk by the village's women.
  threads(g, C, R + 0.04, CHABUTRA_H + 1.1, 9, r);
}

/** Cotton threads (kalava) wound round a trunk, with a few loose ends. */
function threads(g: Grove, c: Vector3, radius: number, y: number, turns: number, r: Rnd): void {
  const colours = ['#b3201a', '#c42a1c', '#e0a52a', '#f2ede2', '#a51c1c'];
  for (let i = 0; i < turns; i++) {
    const tilt = (r() - 0.5) * 0.12;
    const phase = r() * TAU;
    const yy = y + i * 0.045 + (r() - 0.5) * 0.03;
    const pts: Vector3[] = [];
    for (let j = 0; j <= 40; j++) {
      const a = (j / 40) * TAU;
      pts.push(new Vector3(c.x + Math.cos(a) * radius, yy + Math.sin(a + phase) * tilt * radius, c.z + Math.sin(a) * radius));
    }
    g.merge.add('paint', tint(tube(pts, pts.map(() => 0.009), 3, { tile: 1, colour: () => new Color(1, 1, 1) }), colours[i % colours.length]));
  }
  for (let i = 0; i < 3; i++) {
    const a = r() * TAU;
    const p = new Vector3(c.x + Math.cos(a) * (radius + 0.01), y + 0.1, c.z + Math.sin(a) * (radius + 0.01));
    const end = [p, p.clone().add(new Vector3(Math.cos(a) * 0.04, -0.2, Math.sin(a) * 0.04)), p.clone().add(new Vector3(Math.cos(a) * 0.05, -0.32 - r() * 0.12, Math.sin(a) * 0.05))];
    g.merge.add('paint', tint(tube(end, [0.008, 0.007, 0.006], 3, { tile: 1, colour: () => new Color(1, 1, 1) }), colours[i % 2]));
  }
}

// ---- coconut palm ------------------------------------------------------------------------------------

function coconut(g: Grove, t: TreeDef): void {
  const r = rng(t.seed * 7919 + 29);
  const k = t.scale;
  const H = (8.8 + r() * 2.6) * k;
  const r0 = TRUNK_R.coconut * k;
  const leanYaw = r() * TAU;
  const lean = (0.5 + r() * 1.0) * k;
  const ld = new Vector3(Math.cos(leanYaw), 0, Math.sin(leanYaw));
  const side = new Vector3(-ld.z, 0, ld.x);
  const bow = (r() - 0.5) * 0.5 * k;

  // The trunk curves away from its lean only high up (the collider holds the lowest 4 m), and the
  // leaf scars ring it: alternate rows sit a little proud and a little paler.
  const rows = 22;
  const path: Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const f = i / rows;
    const y = -0.3 + (H + 0.3) * f;
    const hf = Math.max(0, y) / H;
    path.push(new Vector3(t.x, y, t.z).addScaledVector(ld, lean * hf ** 2.6).addScaledVector(side, bow * Math.sin(hf * Math.PI)));
    const bole = Math.max(0, 1 - y / 0.7) * 0.07 * k;
    radii.push(r0 * (1 - 0.25 * hf) * (i % 2 ? 1.04 : 0.97) + bole);
  }
  const ring = new Color();
  const grey = new Color(1.2, 1.32, 1.45);
  g.merge.add('bark', tube(path, radii, 7, {
    tile: BARK_TILE,
    colour: (f, _a, p) => {
      const i = Math.round(f * rows);
      const n = hashf(p.x * 3, p.y * 5, p.z * 3);
      ring.copy(grey).multiplyScalar((i % 2 ? 1.08 : 0.72) * (0.9 + 0.15 * n));
      if (p.y < 0.8) ring.multiplyScalar(0.75 + 0.3 * p.y);
      return ring;
    },
  }));
  const top = path[rows];
  const dirTop = new Vector3().subVectors(path[rows], path[rows - 2]).normalize();

  // Crown shaft: the green-brown sheath of frond bases.
  const shaftTop = top.clone().addScaledVector(dirTop, 0.55 * k);
  g.merge.add('bark', tube([top.clone().addScaledVector(dirTop, -0.3), top, shaftTop], [r0 * 0.8, r0 * 1.15, r0 * 0.8], 7, { tile: BARK_TILE, colour: () => new Color(1.1, 1.3, 0.8) }));

  // Fronds in a golden-angle spiral: young ones upright, mature ones arching, old ones hanging.
  const fronds = 18 + Math.floor(r() * 5);
  const green = new Color('#ffffff');
  for (let i = 0; i < fronds; i++) {
    const age = i / (fronds - 1);
    const yaw = i * 2.39996 + r() * 0.3;
    const pitch = 1.1 - age * 1.55 + (r() - 0.5) * 0.25;
    const len = (3.9 + r() * 1.1) * k * (age < 0.15 ? 0.75 : 1);
    const base = shaftTop.clone().addScaledVector(dirTop, -age * 0.45 * k);
    const c = green.clone().multiplyScalar(0.85 + 0.25 * r());
    const wide = (1.35 + 0.35 * r()) * k;
    g.merge.add('palm', blade(base, {
      len,
      width: (f) => wide * Math.min(1, f * 6),
      pitch,
      yaw,
      droop: 0.28 + age * 0.35,
      fold: 0.5,
      foldTip: -0.4 - age * 0.3,
      segs: 7,
      colour: () => c,
      sway: 0.18,
    }));
  }
  // One dead frond hanging along the trunk.
  if (r() < 0.8) {
    const yaw = r() * TAU;
    const dry = new Color(1.7, 0.95, 0.55);
    g.merge.add('palm', blade(shaftTop.clone().addScaledVector(dirTop, -0.5 * k), { len: 3.6 * k, width: () => 0.8 * k, pitch: -1.15, yaw, droop: 0.05, fold: 0.9, foldTip: 1.1, segs: 5, colour: () => dry, sway: 0.1 }));
  }

  // Coconut bunches tucked under the crown.
  const bunches = 2 + Math.floor(r() * 2);
  const nutColours = ['#5e7a2a', '#6f8a30', '#9a8a2e', '#8a5a2a'];
  for (let b = 0; b < bunches; b++) {
    const a = r() * TAU;
    const hub = shaftTop.clone().addScaledVector(dirTop, -0.45 * k).add(new Vector3(Math.cos(a) * 0.32 * k, -0.1, Math.sin(a) * 0.32 * k));
    const nuts = 3 + Math.floor(r() * 4);
    const col = nutColours[Math.floor(r() * nutColours.length)];
    for (let n = 0; n < nuts; n++) {
      const nut = new IcosahedronGeometry(0.13 * k, 0);
      nut.scale(1, 1.15, 1);
      const off = new Vector3((r() - 0.5) * 0.36, -r() * 0.4, (r() - 0.5) * 0.36).multiplyScalar(k);
      g.merge.add('paint', tint(nut.translate(hub.x + off.x, hub.y + off.y, hub.z + off.z), new Color(col).multiplyScalar(0.85 + 0.3 * r())));
    }
  }
}

// ---- banana --------------------------------------------------------------------------------------

function banana(g: Grove, t: TreeDef): void {
  const r = rng(t.seed * 7919 + 41);
  bananaPlant(g, new Vector3(t.x, 0, t.z), t.scale, TRUNK_R.banana * t.scale, r, true);
  // Suckers — the next generation — at the foot.
  const suckers = 1 + Math.floor(r() * 2);
  for (let i = 0; i < suckers; i++) {
    const a = r() * TAU;
    const d = 0.35 + r() * 0.2;
    bananaPlant(g, new Vector3(t.x + Math.cos(a) * d, 0, t.z + Math.sin(a) * d), t.scale * (0.3 + r() * 0.15), 0.05, r, false);
  }
}

function bananaPlant(g: Grove, base: Vector3, k: number, r0: number, r: Rnd, adult: boolean): void {
  const H = (adult ? 2.2 + r() * 0.5 : 2.4) * k;
  const lean = new Vector3(r() - 0.5, 0, r() - 0.5).multiplyScalar(0.12 * k);
  const path: Vector3[] = [];
  for (let i = 0; i <= 5; i++) {
    const f = i / 5;
    path.push(base.clone().setY(-0.15 + (H + 0.15) * f).addScaledVector(lean, f * f));
  }
  // Pseudostem: overlapping sheaths, green with brown streaks and dry patches.
  const green = new Color(1.05, 1.0, 0.85);
  const brown = new Color(1.7, 0.85, 0.55);
  const c = new Color();
  const stem = tube(path, taper(path.length, r0, r0 * 0.7), adult ? 8 : 5, {
    tile: 1,
    colour: (_f, a, p) => {
      const n = hashf(Math.floor(a * 3), p.y * 1.7, base.x);
      return c.copy(green).lerp(brown, n < 0.3 ? 0.7 : 0.1).multiplyScalar(0.85 + 0.25 * n);
    },
  });
  // The stem borrows an opaque patch of the leaf texture (veins read as sheath fibres).
  const uv = stem.getAttribute('uv');
  const sides = adult ? 8 : 5;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.12 + 0.28 * ((i % (sides + 1)) / sides), 0.3 + 0.35 * (Math.floor(i / (sides + 1)) / 5));
  g.merge.add('banana', stem);
  const top = path[path.length - 1];
  const leaves = adult ? 8 + Math.floor(r() * 3) : 3;
  const leafLen = (adult ? 1.9 : 1.3) * k;
  for (let i = 0; i < leaves; i++) {
    const age = i / Math.max(leaves - 1, 1);
    const old = adult && i === leaves - 1 && r() < 0.8;
    const yaw = i * 2.2 + r() * 0.5;
    const pitch = old ? -1.2 : 0.95 - age * 0.75 + (r() - 0.5) * 0.25;
    const tone = old ? new Color(1.7, 0.95, 0.5) : new Color(1, 1, 1).multiplyScalar(0.9 + 0.2 * r());
    g.merge.add('banana', blade(top.clone().addScaledVector(UP, -age * 0.25 * k), {
      len: leafLen * (0.85 + r() * 0.3),
      width: (f) => (old ? 0.35 : 0.62) * k * Math.min(1, 0.25 + f * 4),
      pitch,
      yaw,
      droop: old ? 0.05 : 0.7 + age * 0.5,
      fold: old ? 0.6 : 0.14,
      foldTip: old ? 0.9 : -0.35,
      segs: 6,
      colour: () => tone,
      sway: old ? 0.05 : 0.12,
    }));
  }
  // A bunch on some: the stalk arches out and down, hands of green fruit, the purple bud below.
  if (adult && r() < 0.45) {
    const yaw = r() * TAU;
    const d = new Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const stalk = [top.clone(), top.clone().addScaledVector(d, 0.3 * k).addScaledVector(UP, 0.12), top.clone().addScaledVector(d, 0.5 * k).addScaledVector(UP, -0.3 * k), top.clone().addScaledVector(d, 0.55 * k).addScaledVector(UP, -0.9 * k), top.clone().addScaledVector(d, 0.56 * k).addScaledVector(UP, -1.2 * k)];
    g.merge.add('paint', tint(tube(stalk, [0.035, 0.035, 0.032, 0.028, 0.02], 5, { tile: 1, colour: () => new Color(1, 1, 1) }), '#6d7a36'));
    const hands = 4;
    for (let h = 0; h < hands; h++) {
      const at = stalk[2].clone().lerp(stalk[3], h / hands);
      const rr = (0.19 - h * 0.022) * k;
      for (let f = 0; f < 7; f++) {
        const a = (f / 7) * TAU + h * 0.4;
        const fruit = new IcosahedronGeometry(0.04 * k, 0);
        fruit.scale(1, 3.2, 1);
        fruit.rotateZ(-0.5);
        fruit.rotateY(-a);
        g.merge.add('paint', tint(fruit.translate(at.x + Math.cos(a) * rr * 0.6, at.y + 0.05, at.z + Math.sin(a) * rr * 0.6), new Color('#6a8a2a').multiplyScalar(0.85 + 0.3 * r())));
      }
    }
    // The heart: a maroon-purple bud hanging at the end of the stalk.
    const bud = lathe([[0.001, 0], [0.05, 0.03], [0.075, 0.1], [0.07, 0.18], [0.04, 0.26], [0.001, 0.3]], 8);
    bud.scale(k, k, k).rotateX(Math.PI);
    g.merge.add('paint', tint(bud.translate(stalk[4].x, stalk[4].y, stalk[4].z), '#5a1f35'));
  }
}
