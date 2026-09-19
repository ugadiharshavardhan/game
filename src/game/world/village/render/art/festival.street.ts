/**
 * The village dressed for Ganeshotsav, outside the pandal: bunting strung across the main road
 * between shop roofs, balconies and neem trunks · the "गणेशोत्सव" banners at the festival ground's
 * gateways, on bamboo poles flying saffron dhwaj · warm string lights ringing the ground and fanning
 * from the pandal to the banyan · paper kandils across the lanes · the big rangoli in the middle of
 * the square, ringed with diyas · and a double line of diyas along the last stretch to the temple.
 *
 * Every rope is tied to something that exists: a house's eave or balcony rail, a shop roof, a tree
 * trunk, a pandal post, or one of the four gateway poles.
 */
import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { houseDims, PLINTH_H, ROOF_OVERHANG, ROOF_PITCH, shopDims, STOREY_H, toWorld } from '../../dims';
import type { HouseDef, VillageLayout } from '../../types';
import { rangoli } from './canvasTextures';
import { atlasPlane, bamboo, FestBatch, lashing, type Ornaments, rope } from './festival.kit';
import { squareRangoli } from './festival.paint';
import { diya } from './festival.things';
import { catenary, place } from './geom';
import type { ArtContext } from './runtime';

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const JUTE = '#5e4c36';
const WIRE = '#23211c';

/** The festival ground's two gateways: a pair of bamboo poles either side of the main road. */
const GATES = [
  { z: 15.8, x: [-3.9, 3.9] },
  { z: -6.8, x: [-3.9, 3.9] },
] as const;
const POLE_H = 6.3;
/** Where ropes are tied on a gateway pole. */
const TIE = 4.45;

export function buildStreet(a: ArtContext, orn: Ornaments): void {
  const L = a.layout;
  const b = new FestBatch();
  const anchors = anchorsFor(L);

  gateways(b, orn);
  square(b, orn, anchors);
  road(b, orn, anchors, L);
  lanes(a, b, orn, anchors);
  temple(a, b);
  bigRangoli(a, b);

  a.root.add(b.build(a, { name: 'festival:street', cast: true, noShadow: ['paint'] }));
}

// ---- Anchors on the village's own buildings and trees ------------------------------------------

interface Anchors {
  /** East face of the banyan's trunk, north and south of centre. */
  banyanN: Vector3;
  banyanS: Vector3;
  /** Tops of the pandal's entrance posts (its left and right, seen from the road). */
  pandalN: Vector3;
  pandalS: Vector3;
  house: (id: string, lx: number, y: number, lz: number) => Vector3;
  shop: (id: string, lx: number, y: number, lz: number) => Vector3;
  tree: (x: number, z: number, y: number, toward: Vector3) => Vector3;
}

function anchorsFor(L: VillageLayout): Anchors {
  const houses = new Map(L.houses.map((h) => [h.id, h]));
  const shops = new Map(L.shops.map((s) => [s.id, s]));
  const onTree = (x: number, z: number, y: number, toward: Vector3) => {
    const t = L.trees.find((tr) => Math.hypot(tr.x - x, tr.z - z) < 0.5);
    const r = t ? { banyan: 1.1, peepal: 0.7, neem: 0.3, mango: 0.34, coconut: 0.2, banana: 0.15 }[t.kind] * t.scale : 0.3;
    const d = new Vector3(toward.x - x, 0, toward.z - z).normalize();
    return V(x + d.x * (r + 0.03), y, z + d.z * (r + 0.03));
  };
  const pandal = L.landmarks.find((l) => l.kind === 'pandal');
  const pp = (lx: number) => {
    const p = pandal ? toWorld(pandal, pandal.rot, lx, 3.5) : { x: 8, z: 5 + lx };
    return V(p.x, 5.3, p.z);
  };
  return {
    banyanN: onTree(-9, 8, 4.3, V(0, 0, 6.2)),
    banyanS: onTree(-9, 8, 4.3, V(0, 0, 10)),
    pandalN: pp(-4.5),
    pandalS: pp(4.5),
    house: (id, lx, y, lz) => {
      const h = houses.get(id) as HouseDef;
      const p = toWorld(h, h.rot, lx, lz);
      return V(p.x, y, p.z);
    },
    shop: (id, lx, y, lz) => {
      const s = shops.get(id);
      if (!s) return V(0, y, 0);
      const p = toWorld(s, s.rot, lx, lz);
      return V(p.x, y, p.z);
    },
    tree: onTree,
  };
}

/** Where a house's front eave line is (local z, height) — ropes are tied to its fascia. */
function frontEave(h: HouseDef): { z: number; y: number } {
  const d = houseDims(h);
  if (h.roof === 'flat') return { z: d.halfD, y: d.eaveH + 0.4 };
  return { z: d.halfD + ROOF_OVERHANG - 0.05, y: d.eaveH - ROOF_OVERHANG * ROOF_PITCH - 0.06 };
}

// ---- Strings ------------------------------------------------------------------------------------

function buntingLine(b: FestBatch, orn: Ornaments, p: Vector3, q: Vector3, sag: number): void {
  const pts = catenary(p, q, sag, Math.max(8, Math.round(p.distanceTo(q) * 1.3)));
  rope(b, pts, 0.006, JUTE);
  orn.bunting(pts);
}

function lightLine(b: FestBatch, orn: Ornaments, p: Vector3, q: Vector3, sag: number, spacing = 0.3): void {
  const pts = catenary(p, q, sag, Math.max(8, Math.round(p.distanceTo(q) * 1.3)));
  rope(b, pts, 0.004, WIRE);
  orn.bulbs(pts, spacing);
}

/** A rope of paper kandils: each on its own short string at `ts` along the rope. */
function lanternLine(b: FestBatch, orn: Ornaments, p: Vector3, q: Vector3, sag: number, ts: number[], colors: string[]): void {
  const n = 24;
  const pts = catenary(p, q, sag, n);
  rope(b, pts, 0.006, JUTE);
  ts.forEach((t, i) => {
    const at = pts[Math.round(t * n)];
    const drop = 0.18 + (i % 2) * 0.1;
    rope(b, [at, at.clone().setY(at.y - drop)], 0.003, JUTE);
    orn.lantern(at.clone().setY(at.y - drop), colors[i % colors.length]);
  });
}

// ---- The gateways -----------------------------------------------------------------------------

function gateways(b: FestBatch, orn: Ornaments): void {
  const wind = Math.atan2(0.75, 0.66);
  for (const [gi, g] of GATES.entries()) {
    for (const [k, x] of g.x.entries()) {
      const base = V(x, 0, g.z);
      b.add('paint', bamboo(base, V(x, POLE_H, g.z), 0.065, 70 + gi * 2 + k));
      for (const y of [TIE, 3.7]) b.add('paint', lashing(V(x, y, g.z), 0.065), JUTE);
      orn.dhwaj(V(x, POLE_H - 0.05, g.z), wind + (k - 0.5) * 0.12);
    }
    // The banner: saffron cloth on a stick top and bottom, lashed to the poles. Painted both sides.
    const w = 5.0;
    const h = 0.94;
    const y0 = 3.62;
    const bz = g.z;
    b.add('atlas', atlasPlane('banner', w, h).translate(0, y0 + h / 2, bz + 0.012));
    b.add('atlas', atlasPlane('banner', w, h).rotateY(Math.PI).translate(0, y0 + h / 2, bz - 0.012));
    for (const y of [y0, y0 + h]) b.add('paint', bamboo(V(-w / 2 - 0.08, y, bz), V(w / 2 + 0.08, y, bz), 0.018, 80 + y));
    for (const s of [-1, 1]) {
      rope(b, [V(s * (w / 2 + 0.05), y0 + h, bz), V(g.x[s > 0 ? 1 : 0] - s * 0.06, TIE + 0.06, bz)], 0.007, JUTE);
      rope(b, [V(s * (w / 2 + 0.05), y0, bz), V(g.x[s > 0 ? 1 : 0] - s * 0.06, 3.7, bz)], 0.007, JUTE);
    }
    // A string of bulbs above the banner, pole to pole.
    lightLine(b, orn, V(g.x[0] + 0.07, 4.8, bz), V(g.x[1] - 0.07, 4.8, bz), 0.18, 0.2);
  }
}

// ---- The festival ground ----------------------------------------------------------------------

function square(b: FestBatch, orn: Ornaments, an: Anchors): void {
  const [south, north] = GATES;
  const sw = V(south.x[0], TIE, south.z);
  const se = V(south.x[1], TIE, south.z);
  const nw = V(north.x[0], TIE, north.z);
  const ne = V(north.x[1], TIE, north.z);
  // A ring of lights: gateway → banyan → gateway → pandal → gateway.
  lightLine(b, orn, sw, an.banyanS, 0.5);
  lightLine(b, orn, an.banyanN, nw, 0.7);
  lightLine(b, orn, ne, an.pandalN, 0.5);
  lightLine(b, orn, an.pandalS, se, 0.5);
  // And two strings fanning from the pandal's posts to the banyan, over the rangoli.
  lightLine(b, orn, an.pandalN, an.banyanN.clone().setY(4.5), 1.0);
  lightLine(b, orn, an.pandalS, an.banyanS.clone().setY(4.5), 0.95);
  // Bunting on the same ring, hung a little lower.
  const low = (p: Vector3) => p.clone().setY(p.y - 0.3);
  buntingLine(b, orn, low(sw), low(an.banyanS), 0.55);
  buntingLine(b, orn, low(an.banyanN), low(nw), 0.75);
  buntingLine(b, orn, low(ne), low(an.pandalN), 0.6);
  buntingLine(b, orn, low(an.pandalS), low(se), 0.6);
  for (const p of [an.banyanN, an.banyanS]) b.add('paint', lashing(V(-9, p.y, 8), 0.82), JUTE);
}

// ---- The main road ----------------------------------------------------------------------------

function road(b: FestBatch, orn: Ornaments, an: Anchors, L: VillageLayout): void {
  // By home: between the two neem trees, and on to the Kulkarnis' balcony for the banner.
  const neemW = an.tree(-8, 42, 3.9, V(9, 0, 41.5));
  const neemE = an.tree(9, 41.5, 3.9, V(-8, 0, 42));
  buntingLine(b, orn, neemW, neemE, 0.7);
  // Kirana roof ↔ the Kulkarnis' balcony rail, twice.
  const railTop = PLINTH_H + STOREY_H + 0.9;
  const rail = (lx: number) => an.house('kulkarni', lx, railTop, 4.85);
  // Shop roofs: the top front edge of the shop's block.
  const shopRoof = (id: string, lx: number) => {
    const s = L.shops.find((x) => x.id === id);
    if (!s) return V(0, 3.9, 0);
    const d = shopDims(s);
    return an.shop(id, lx, d.wallH + 0.55, s.depth / 2 + 0.12);
  };
  const kirana = (lx: number) => shopRoof('kirana', lx);
  buntingLine(b, orn, kirana(1.8), rail(-3.2), 0.5);
  buntingLine(b, orn, kirana(-2.4), rail(2.2), 0.5);
  lightLine(b, orn, kirana(-0.4).setY(3.95), rail(-0.4).setY(4.3), 0.45);
  // Banner over the road near home, from the west neem to the Kulkarnis' balcony corner.
  roadBanner(b, an.tree(-8, 42, 4.45, V(7, 0, 37)), rail(4.1).setY(4.35));

  // Past the square: the Gokhales' eave ↔ the Bhosales' balcony rail, bunting and kandils.
  const gokhale = L.houses.find((h) => h.id === 'gokhale');
  const ge = gokhale ? frontEave(gokhale) : { z: 3.75, y: 3.04 };
  const gEave = (lx: number) => an.house('gokhale', lx, ge.y, ge.z);
  const bRail = (lx: number) => an.house('bhosale', lx, railTop, 4.85);
  buntingLine(b, orn, gEave(1.5), bRail(-2.5), 0.55);
  lanternLine(b, orn, gEave(-1.6), bRail(1.0).setY(4.0), 0.5, [0.35, 0.5, 0.65], ['#e8872b', '#c8321e', '#f2b82a']);
  // Laxmi Mithai's roof ↔ the mango tree across the road.
  const sweets = shopRoof('sweets', 1.4);
  buntingLine(b, orn, sweets, an.tree(9, -31, 3.85, sweets), 0.55);
  lightLine(b, orn, shopRoof('sweets', -1.6), an.tree(9, -31, 4.1, V(-6, 0, -27)), 0.5);
}

/** A cloth banner hung on ropes between two anchors, centred over the road, facing south. */
function roadBanner(b: FestBatch, p: Vector3, q: Vector3): void {
  // Centre it on the road rather than between the anchors.
  const t = (0.8 - p.x) / (q.x - p.x);
  const c = p.clone().lerp(q, t);
  c.y = Math.min(p.y, q.y) - 0.05;
  const dir = new Vector3().subVectors(q, p).setY(0).normalize();
  const yaw = Math.atan2(-dir.z, dir.x);
  const w = 4.6;
  const h = 0.86;
  const m = place(c.x, c.y - h / 2, c.z, yaw);
  b.add('atlas', atlasPlane('banner', w, h).translate(0, 0, 0.012), m);
  b.add('atlas', atlasPlane('banner', w, h).rotateY(Math.PI).translate(0, 0, -0.012), m);
  for (const y of [-h / 2, h / 2]) b.add('paint', bamboo(V(-w / 2 - 0.06, y, 0), V(w / 2 + 0.06, y, 0), 0.016, 90 + y), m);
  const corner = (sx: number, sy: number) => V(sx * (w / 2 + 0.04), sy * (h / 2), 0).applyMatrix4(m);
  rope(b, catenary(p, corner(-1, 1), 0.12, 8), 0.006, JUTE);
  rope(b, catenary(corner(1, 1), q, 0.12, 8), 0.006, JUTE);
  rope(b, catenary(p.clone().setY(p.y - 0.8), corner(-1, -1), 0.1, 8), 0.006, JUTE);
  rope(b, catenary(corner(1, -1), q.clone().setY(q.y - 0.8), 0.1, 8), 0.006, JUTE);
}

// ---- The lanes: paper kandils --------------------------------------------------------------------

function lanes(a: ArtContext, b: FestBatch, orn: Ornaments, an: Anchors): void {
  const L = a.layout;
  const kandil = ['#e8872b', '#c8321e', '#f2b82a', '#d4507a', '#e8872b', '#5f9a4a'];
  const eave = (id: string, lx: number) => {
    const h = L.houses.find((x) => x.id === id);
    if (!h) return null;
    const e = frontEave(h);
    return an.house(id, lx, e.y, e.z);
  };
  // Lane A west: the Deshmukhs' eave to the Patils', across the lane.
  // Lane A east: the Jadhavs' to the Mores'.
  const pairs: [string, number, string, number][] = [
    ['deshmukh', 1.2, 'patil', -3.2],
    ['deshmukh', -2.6, 'patil', 0.6],
    ['jadhav', -3.0, 'more', 1.0],
    ['jadhav', 1.0, 'more', -3.0],
  ];
  for (const [i, [h1, x1, h2, x2]] of pairs.entries()) {
    const p = eave(h1, x1);
    const q = eave(h2, x2);
    if (!p || !q) continue;
    lanternLine(b, orn, p, q, 0.28, [0.32, 0.5, 0.68], kandil.slice(i, i + 3));
  }
  // Lane B west: between the mango and the neem either side of the lane.
  const m = an.tree(-20, -6, 3.7, V(-20, 0, -13));
  const n = an.tree(-20, -13, 3.7, V(-20, 0, -6));
  lanternLine(b, orn, m, n, 0.3, [0.3, 0.5, 0.7], ['#f2b82a', '#c8321e', '#e8872b']);
  for (const [x, y, z] of [[-18, 2.6, 23.5], [25, 2.6, 23], [-20, 3.0, -9.6]] as const) a.lamps.anchor(V(x, y, z), 0.9, '#ffb070', 6);
}

// ---- The square's rangoli and the temple road's diyas ------------------------------------------

function bigRangoli(a: ArtContext, b: FestBatch): void {
  const c = V(0, 0, 4);
  const size = 5.4;
  const rg = new Mesh(new PlaneGeometry(size, size).rotateX(-Math.PI / 2), a.kit.decal('festival-rangoli', squareRangoli(a.bank)));
  rg.name = 'festival:rangoli';
  rg.position.set(c.x, 0.02, c.z);
  rg.receiveShadow = true;
  rg.renderOrder = 1;
  a.root.add(rg);
  // Diyas round its rim, lit.
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    const m = place(c.x + Math.cos(t) * 2.85, 0, c.z + Math.sin(t) * 2.85, -t);
    a.flames.add(diya(b, m).applyMatrix4(m));
  }
  a.lamps.anchor(V(0, 3.2, 4), 1.6, '#ffbf78', 11);
}

function temple(a: ArtContext, b: FestBatch): void {
  // Two lines of diyas at the road's edges, from the sweet shop to the temple's gate.
  const wall = -38 + 0.25;
  for (let z = -27.6; z > wall - 0.02 + 0.45; z -= 0.72) {
    for (const s of [-1, 1]) {
      const m = place(s * 3.15, 0, z, z * 1.7);
      a.flames.add(diya(b, m).applyMatrix4(m));
    }
  }
  // A lotus rangoli before the gate, a pair of diyas beside it.
  const rg = new Mesh(new PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2), a.kit.decal('festival-gate-rangoli', rangoli(a.bank, 'lotus', 2)));
  rg.position.set(0, 0.02, -35.9);
  rg.receiveShadow = true;
  a.root.add(rg);
  for (const s of [-1, 1]) {
    const m = place(s * 1.05, 0, -35.9, s);
    a.flames.add(diya(b, m).applyMatrix4(m));
  }
  a.lamps.anchor(V(0, 0.7, -32.5), 1.3, '#ffa24a', 7);
}
