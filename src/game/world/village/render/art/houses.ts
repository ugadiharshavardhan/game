/**
 * Village houses, built from layout data and the shared dimensions in dims.ts.
 *
 * Anatomy of a Maharashtrian village house at Ganeshotsav, bottom to top:
 *   plinth (rubble stone or geru-painted) · Shahabad-stone veranda floor · steps with diyas ·
 *   lime-washed walls with a painted dado band · carved teak door frame, toran of mango leaves and
 *   marigolds · windows with chhajja, iron grille and open shutters · turned teak veranda posts
 *   under a clay-tile lean-to (or a balcony on two-storey houses) · Mangalore-tile roof with ridge
 *   caps, or a flat roof with parapet and water tank · star lantern (akash kandil) · rangoli.
 *
 * Three levels of detail per house (THREE.LOD): full, simplified (no small props), and a shell.
 */
import {
  BoxGeometry,
  Color,
  Group,
  IcosahedronGeometry,
  LOD,
  Mesh,
  type MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { DOOR_H, DOOR_W, houseDims, type HouseDims, PLINTH_H, ROOF_OVERHANG, roofShape, STEP_COUNT, STEP_RISE, STEP_RUN, STOREY_H, toWorld } from '../../dims';
import type { HouseDef } from '../../types';
import { glow, rangoli, type RangoliStyle, rng } from './canvasTextures';
import { furnishRoom, moonbeams, openShell } from './houses.interior';
import { Batch, beam, box, boxUV, catenary, fill, lathe, leanTo, pitchedRoof, place, type Remap, slab, turnedPost, weather } from './geom';
import { TILE } from './materials';
import { DADO_PAINT, TONE, WALL_PAINT, WOOD_PAINT } from './palette';
import type { ArtContext } from './runtime';

/** LOD switch distances, metres. */
const LOD1 = 38;
const LOD2 = 85;
/** A shelter's furnished room is only drawn this close: you only see into it from nearby. */
const ROOM_REACH = 18;
/**
 * Fewer materials per house, fewer draw calls (and shadow draws): iron and brass fittings are
 * painted colour, teak shares the wood texture, the cot's cloth is paint.
 */
const METALS: Remap = { iron: ['paint', TONE.iron], brass: ['paint', '#b8903a'], teak: ['wood', '#6a472d'], fabric: ['paint', '#cdb27c'] };

export function buildHouses(a: ArtContext, houses: readonly HouseDef[]): Map<string, Object3D> {
  const hinges = new Map<string, Object3D>();
  for (const h of houses) hinges.set(h.id, buildHouse(a, h));
  return hinges;
}

function buildHouse(a: ArtContext, h: HouseDef): Object3D {
  const d = houseDims(h);
  const r = rng(hashId(h.id));
  const style = {
    paint: new Color(WALL_PAINT[h.paint]),
    dado: new Color(DADO_PAINT[h.paint]),
    wood: new Color(WOOD_PAINT[Math.floor(r() * WOOD_PAINT.length)]),
    rubble: h.kind === 'hut' ? false : r() < 0.5,
    tile: new Color(TONE.terracotta).offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.1, (r() - 0.5) * 0.06),
    seed: r() * 100,
    hut: h.kind === 'hut',
  };
  if (style.hut) style.paint = new Color('#b89068');

  const root = new Group();
  root.name = `house:${h.id}`;
  root.position.set(h.x, 0, h.z);
  root.rotation.y = h.rot;

  // Which windows are lit is decided once, so the levels of detail agree.
  const lit = windowsFor(h, d).map(() => (h.shelter ? r() < 0.55 : r() < 0.12));
  // Living detail — lamps, diyas, pots, the cot — joins the full-detail level's batch (no extra
  // draw calls); the decals and the room behind the door are their own groups, culled by distance.
  const decals = new Group();
  const room = new Group();
  const lod = new LOD();
  lod.addLevel(level(a, h, d, style, 0, lit, (b) => details(a, h, d, style, r, b, decals, room)), 0);
  lod.addLevel(level(a, h, d, style, 1, lit), LOD1);
  lod.addLevel(level(a, h, d, style, 2, lit), LOD2);
  root.add(lod, decals, room);
  a.culler.add(decals, new Vector3(h.x, 0, h.z), LOD1 + 6);
  a.culler.add(room, new Vector3(h.x, 0, h.z), ROOM_REACH);

  // The door leaf swings on its hinge, outside the LOD so it never pops.
  const hinge = new Group();
  hinge.position.set(d.doorX - DOOR_W / 2, PLINTH_H + 0.01, d.wallFace + 0.02);
  hinge.add(doorLeaf(a, h, style.wood));
  root.add(hinge);

  a.root.add(root);
  return hinge;
}

type Style = { paint: Color; dado: Color; wood: Color; rubble: boolean; tile: Color; seed: number; hut: boolean };

/** One level of detail. 0 = everything; 1 = no fine detail; 2 = a shell. */
function level(a: ArtContext, h: HouseDef, d: HouseDims, s: Style, lvl: 0 | 1 | 2, lit: boolean[], extra?: (b: Batch) => void): Group {
  const b = new Batch({ remap: METALS });
  const W = d.halfW * 2;
  const D = d.halfD * 2;
  const wallTop = d.eaveH;

  // ---- plinth, veranda floor, steps ----------------------------------------------------------
  const zMin = -d.halfD - 0.05;
  const zMax = d.verandaEdge;
  const pc = (zMin + zMax) / 2;
  const plinth = slab(s.rubble ? 'rubble' : 'plaster', W + 0.1, PLINTH_H, zMax - zMin, 0, PLINTH_H / 2, pc, 2);
  b.add(s.rubble ? 'rubble' : 'plaster', weather(plinth, s.rubble ? '#c9b9a2' : s.dado, { ground: 0, splash: 0.35, strength: 0.3 }));
  if (lvl < 2) {
    // Shahabad stone: the grey-green slab floor of every Deccan veranda.
    b.add('stone', weather(box('stone', W + 0.22, 0.07, zMax - zMin + 0.12, 0, PLINTH_H - 0.02, pc), '#a3a79c', { ground: PLINTH_H, strength: 0.05 }));
    for (let i = 0; i < STEP_COUNT; i++) {
      const top = PLINTH_H - STEP_RISE * (i + 1);
      b.add('stone', weather(box('stone', d.stepsWidth, top, STEP_RUN, d.doorX, top / 2, d.verandaEdge + STEP_RUN * (i + 0.5)), '#b3ad9f', { ground: 0, splash: 0.2, strength: 0.25 }));
    }
  }

  // ---- walls ----------------------------------------------------------------------------------
  // A shelter seen up close is open: doorway, windows and the room behind are real.
  const open = lvl === 0 && h.shelter;
  if (open) {
    openShell(b, h, d, s);
  } else {
    const body = slab('plaster', W, d.wallH, D, 0, PLINTH_H + d.wallH / 2, 0, Math.max(3, Math.round(d.wallH * 1.6)));
    b.add('plaster', weather(body, s.paint, { ground: PLINTH_H, splash: 1.0, strength: 0.26, top: wallTop, topStrength: 0.16, seed: s.seed }));
  }
  if (lvl < 2 && !s.hut && !open) {
    b.add('plaster', weather(slab('plaster', W + 0.03, 0.78, D + 0.03, 0, PLINTH_H + 0.39, 0, 2), s.dado, { ground: PLINTH_H, splash: 0.5, strength: 0.22, seed: s.seed }));
    b.add('plaster', weather(box('plaster', W + 0.05, 0.06, D + 0.05, 0, PLINTH_H + 0.8, 0), '#efe7d6', { ground: 0, strength: 0.05 }));
    if (h.storeys === 2) b.add('stone', weather(box('stone', W + 0.14, 0.15, D + 0.14, 0, PLINTH_H + STOREY_H, 0), TONE.cement, { ground: 0, strength: 0.1 }));
  }
  if (open && h.storeys === 2) b.add('stone', weather(box('stone', W + 0.14, 0.15, D + 0.14, 0, PLINTH_H + STOREY_H, 0), TONE.cement, { ground: 0, strength: 0.1 }));

  // ---- door and windows -------------------------------------------------------------------------
  // A locked (or distant) doorway is a dark plane on the wall face; the leaf swings in front of it.
  if (!open) b.add('interior', new PlaneGeometry(DOOR_W, DOOR_H).translate(d.doorX, PLINTH_H + DOOR_H / 2, d.wallFace + 0.006));
  if (lvl === 0) doorFrame(b, d, s);
  // Shelters are lit for the festival; the families at the pandal left theirs dark.
  windowsFor(h, d).forEach((w, i) => {
    if (lvl === 2) return;
    // Ground-floor front and side windows of an open shelter are real openings.
    const opening = open && w.y < PLINTH_H + STOREY_H && w.yaw !== Math.PI;
    windowAt(b, w, lvl, lit[i], s, opening);
  });

  // ---- veranda / balcony ------------------------------------------------------------------------
  if (h.storeys === 2) balcony(b, h, d, s, lvl);
  else veranda(b, d, s, lvl);

  // ---- roof -------------------------------------------------------------------------------------
  if (h.roof === 'flat') flatRoof(b, d, s, lvl, h);
  else {
    const rs = roofShape(h, d);
    const parts = pitchedRoof(h.roof === 'gable' ? 'gable' : 'hip', d.halfW, d.halfD, wallTop, d.roofRise, ROOF_OVERHANG, TILE.tile ?? 1.5);
    const skin = s.hut ? 'thatch' : 'tile';
    for (const t of parts.tiles) b.add(skin, weather(t, s.hut ? '#c8aa70' : s.tile, { ground: rs.ey, splash: 1.2, strength: 0.28, seed: s.seed }));
    if (lvl < 2) {
      for (const t of parts.soffits) b.add(s.hut ? 'thatch' : 'wood', fill(t, s.hut ? '#6e5a3a' : '#5a4232'));
      for (const g of parts.gables) b.add('plaster', weather(boxUV(g, 'plaster'), s.paint, { ground: wallTop, strength: 0.1 }));
      if (!s.hut) for (const c of parts.caps) b.add('tile', fill(boxUV(c, 'tile'), TONE.ridge));
      if (lvl === 0 && !s.hut) for (const f of parts.fascia) b.add('wood', fill(f, s.wood));
    }
  }

  extra?.(b);
  return b.build(a.kit, { name: `house:${h.id}:lod${lvl}`, cast: lvl < 2 });
}

// ---- parts ------------------------------------------------------------------------------------

function doorFrame(b: Batch, d: HouseDims, s: Style): void {
  const z = d.wallFace;
  const x = d.doorX;
  const teak = s.hut ? '#6e5438' : '#6a472d';
  for (const side of [-1, 1]) b.add('teak', fill(box('teak', 0.14, DOOR_H + 0.12, 0.18, x + side * (DOOR_W / 2 + 0.07), PLINTH_H + (DOOR_H + 0.12) / 2, z + 0.05), teak));
  // Lintel, with a stepped cornice above it.
  b.add('teak', fill(box('teak', DOOR_W + 0.46, 0.2, 0.2, x, PLINTH_H + DOOR_H + 0.16, z + 0.06), teak));
  b.add('teak', fill(box('teak', DOOR_W + 0.6, 0.06, 0.26, x, PLINTH_H + DOOR_H + 0.29, z + 0.08), '#553823'));
  // Threshold (umbara).
  b.add('teak', fill(box('teak', DOOR_W + 0.34, 0.08, 0.26, x, PLINTH_H + 0.04, z + 0.06), '#553823'));
  // Brass bosses on the lintel — a small auspicious touch.
  for (const bx of [-0.35, 0, 0.35]) b.add('brass', new IcosahedronGeometry(0.03, 1).translate(x + bx, PLINTH_H + DOOR_H + 0.16, z + 0.17));

  // Toran: mango leaves and marigolds strung across the lintel for the festival.
  const a = new Vector3(x - DOOR_W / 2 - 0.2, PLINTH_H + DOOR_H + 0.05, z + 0.2);
  const e = new Vector3(x + DOOR_W / 2 + 0.2, PLINTH_H + DOOR_H + 0.05, z + 0.2);
  const pts = catenary(a, e, 0.1, 18);
  pts.forEach((p, i) => {
    b.add('paint', new IcosahedronGeometry(0.034, 0).translate(p.x, p.y, p.z), i % 2 ? TONE.marigold : TONE.marigoldYellow);
    if (i % 2 === 0) b.add('paint', new BoxGeometry(0.045, 0.14, 0.006).translate(p.x, p.y - 0.09, p.z + 0.01), i % 4 ? TONE.mangoLeaf : '#4f7d2e');
  });
  // Two strands hanging at the ends.
  for (const p of [pts[0], pts[pts.length - 1]]) {
    for (let k = 1; k <= 8; k++) b.add('paint', new IcosahedronGeometry(0.03, 0).translate(p.x, p.y - k * 0.06, p.z), k % 2 ? TONE.marigold : TONE.marigoldYellow);
  }
}

interface WindowSpot {
  x: number;
  y: number;
  z: number;
  /** Outward normal direction as a yaw (0 = +z). */
  yaw: number;
}

function windowsFor(h: HouseDef, d: HouseDims): WindowSpot[] {
  const out: WindowSpot[] = [];
  const sill = PLINTH_H + 0.95;
  const floors = h.storeys === 2 ? [0, STOREY_H] : [0];
  for (const f of floors) {
    const y = sill + 0.52 + f;
    for (const sx of [-1, 1]) {
      const x = sx * d.halfW * 0.56;
      if (f > 0 || Math.abs(x - d.doorX) > 1.35) out.push({ x, y, z: d.wallFace, yaw: 0 });
    }
    out.push({ x: d.halfW, y, z: 0, yaw: Math.PI / 2 }, { x: -d.halfW, y, z: 0, yaw: -Math.PI / 2 });
    if (!h.kind || h.kind === 'house') out.push({ x: 0, y, z: -d.halfD, yaw: Math.PI });
  }
  if (h.kind === 'hut') return out.filter((w) => w.yaw !== 0).slice(0, 1);
  return out;
}

/**
 * A window facing +z, placed on a wall: frame, chhajja, grille, open shutters, sill. `opening`: a
 * real hole into the room (no painted pane).
 */
function windowAt(b: Batch, w: WindowSpot, lvl: number, lit: boolean, s: Style, opening = false): void {
  const m = place(w.x, w.y, w.z, w.yaw);
  const ww = 0.92;
  const wh = 1.06;
  if (!opening) b.add(lit ? 'lamplit' : 'interior', new PlaneGeometry(ww, wh).translate(0, 0, 0.006), m);
  if (lvl > 0) return;
  const teak = '#6a472d';
  for (const sx of [-1, 1]) b.add('teak', fill(box('teak', 0.08, wh + 0.16, 0.12, sx * (ww / 2 + 0.04), 0, 0.04), teak), m);
  b.add('teak', fill(box('teak', ww + 0.16, 0.08, 0.12, 0, wh / 2 + 0.04, 0.04), teak), m);
  b.add('stone', fill(box('stone', ww + 0.3, 0.07, 0.24, 0, -wh / 2 - 0.06, 0.1), '#b5ad9d'), m);
  // Chhajja: a small concrete sunshade over the window.
  b.add('plaster', weather(box('plaster', ww + 0.5, 0.07, 0.36, 0, wh / 2 + 0.2, 0.17), '#cfc7b6', { ground: 0, strength: 0.05 }), m);
  for (let i = 0; i < 5; i++) b.add('iron', new BoxGeometry(0.018, wh, 0.018).translate(-ww / 2 + (ww / 6) * (i + 1), 0, 0.05), m);
  b.add('iron', new BoxGeometry(ww, 0.018, 0.018).translate(0, 0, 0.05), m);
  // Shutters folded back against the wall.
  for (const sx of [-1, 1]) {
    const shutter = box('wood', ww / 2, wh, 0.035, 0, 0, 0);
    // Hinge at the frame edge, swung ~160° open.
    shutter.translate(sx * (ww / 4), 0, 0);
    shutter.rotateY(sx * -0.35);
    shutter.translate(sx * (ww / 2 + 0.06 + ww / 4), 0, 0.08);
    b.add('wood', fill(shutter, s.wood), m);
  }
}

function veranda(b: Batch, d: HouseDims, s: Style, lvl: number): void {
  const zEdge = d.verandaEdge + 0.35;
  const slope = (d.verandaRoofHigh - d.verandaRoofLow) / (d.verandaEdge - d.wallFace);
  const lowAtEdge = d.verandaRoofLow - 0.35 * slope;
  const x0 = -d.halfW - 0.3;
  const x1 = d.halfW + 0.3;
  const roof = leanTo(x0, x1, d.wallFace - 0.02, d.verandaRoofHigh, zEdge, lowAtEdge, TILE.tile ?? 1.5);
  const skin = s.hut ? 'thatch' : 'tile';
  b.add(skin, weather(roof.top, s.hut ? '#c8aa70' : s.tile, { ground: lowAtEdge, splash: 1.0, strength: 0.25, seed: s.seed + 3 }));
  if (lvl === 2) return;
  b.add(s.hut ? 'thatch' : 'wood', fill(roof.under, s.hut ? '#6e5a3a' : '#5a4232'));
  const postH = d.verandaRoofLow - PLINTH_H - 0.12;
  const pz = d.verandaEdge - 0.18;
  b.add('teak', fill(box('teak', x1 - x0 - 0.2, 0.13, 0.15, 0, d.verandaRoofLow - 0.065, pz), '#5d3f28'));
  for (const px of d.postXs) {
    if (s.hut) {
      b.add('wood', fill(boxUV(new BoxGeometry(0.12, postH, 0.12).translate(px, PLINTH_H + postH / 2, pz), 'wood'), '#7a6246'));
      continue;
    }
    if (lvl === 0) for (const g of turnedPost(postH, 0.075)) b.add('teak', fill(g, '#6a472d'), place(px, PLINTH_H, pz));
    else b.add('teak', fill(box('teak', 0.16, postH, 0.16, px, PLINTH_H + postH / 2, pz), '#6a472d'));
  }
  if (lvl === 0 && !s.hut) b.add('wood', fill(box('wood', x1 - x0 + 0.1, 0.12, 0.04, 0, lowAtEdge - 0.04, zEdge + 0.02), s.wood));
}

function balcony(b: Batch, h: HouseDef, d: HouseDims, s: Style, lvl: number): void {
  const floorY = PLINTH_H + STOREY_H - 0.1;
  const z0 = d.wallFace;
  const z1 = d.verandaEdge + 0.2;
  const W = d.halfW * 2;
  b.add('plaster', weather(box('plaster', W + 0.1, 0.2, z1 - z0, 0, floorY, (z0 + z1) / 2), TONE.cement, { ground: 0, strength: 0.1 }));
  if (lvl === 2) return;
  // Square plastered pillars holding up the balcony.
  const pillarH = floorY - 0.1 - PLINTH_H;
  for (const px of d.postXs) {
    b.add('plaster', weather(slab('plaster', 0.3, pillarH, 0.3, px, PLINTH_H + pillarH / 2, d.verandaEdge - 0.18, 3), s.paint, { ground: PLINTH_H, splash: 0.7, strength: 0.25 }));
  }
  // Upper-floor door onto the balcony.
  b.add('interior', new PlaneGeometry(DOOR_W, DOOR_H).translate(0, floorY + 0.1 + DOOR_H / 2, d.wallFace + 0.006));
  if (lvl === 1) return;
  b.add('teak', fill(box('teak', DOOR_W + 0.3, 0.16, 0.16, 0, floorY + 0.1 + DOOR_H + 0.08, d.wallFace + 0.05), '#6a472d'));
  // Iron railing with a wooden top rail.
  const railY = floorY + 0.1;
  const edges: [number, number, number, number][] = [
    [-d.halfW, z1 - 0.05, d.halfW, z1 - 0.05],
    [-d.halfW, z0 + 0.05, -d.halfW, z1 - 0.05],
    [d.halfW, z0 + 0.05, d.halfW, z1 - 0.05],
  ];
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / 0.13);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      b.add('iron', new BoxGeometry(0.02, 0.85, 0.02).translate(ax + (bx - ax) * t, railY + 0.43, az + (bz - az) * t));
    }
    b.add('teak', fill(beam(new Vector3(ax, railY + 0.9, az), new Vector3(bx, railY + 0.9, bz), 0.07, 0.06), '#5d3f28'));
  }
  void h;
}

function flatRoof(b: Batch, d: HouseDims, s: Style, lvl: number, h: HouseDef): void {
  const y = d.eaveH;
  const W = d.halfW * 2;
  const D = d.halfD * 2;
  b.add('plaster', weather(box('plaster', W + 0.1, 0.16, D + 0.1, 0, y + 0.06, 0), TONE.cement, { ground: 0, strength: 0.1 }));
  const ph = 0.72;
  for (const [sx, sz, cx, cz] of [
    [W + 0.2, 0.15, 0, d.halfD + 0.02],
    [W + 0.2, 0.15, 0, -d.halfD - 0.02],
    [0.15, D, d.halfW + 0.02, 0],
    [0.15, D, -d.halfW - 0.02, 0],
  ] as const) {
    b.add('plaster', weather(box('plaster', sx, ph, sz, cx, y + ph / 2 + 0.1, cz), s.paint, { ground: y, splash: 0.4, strength: 0.2, top: y + ph + 0.1, topStrength: 0.25 }));
    if (lvl === 0) b.add('stone', fill(box('stone', sx + 0.08, 0.06, sz + 0.08, cx, y + ph + 0.13, cz), TONE.cement));
  }
  if (lvl === 0) {
    // The black plastic water tank that tops half the roofs in rural India.
    const tx = (hashId(h.id) % 2 ? -1 : 1) * (d.halfW - 1.1);
    const tz = -d.halfD + 1.1;
    b.add('paint', lathe([[0.001, 0], [0.55, 0], [0.56, 0.05], [0.56, 0.85], [0.5, 0.95], [0.18, 1.0], [0.18, 1.06], [0.001, 1.06]], 16).translate(tx, y + 0.3, tz), '#1d1d1d');
    b.add('stone', fill(box('stone', 1.2, 0.3, 1.2, tx, y + 0.15, tz), TONE.cement));
  }
}

/** The swinging door leaf (built at the hinge, opening toward −z into the house). */
function doorLeaf(a: ArtContext, h: HouseDef, paint: Color): Group {
  const b = new Batch({ remap: { ...METALS, wood: ['paint', '#ffffff'] } });
  b.add('wood', fill(box('wood', DOOR_W, DOOR_H - 0.02, 0.05, DOOR_W / 2, DOOR_H / 2, 0.025), paint));
  for (const y of [0.35, 1.05, 1.75]) b.add('wood', fill(box('wood', DOOR_W - 0.1, 0.1, 0.025, DOOR_W / 2, y, 0.06), paint.clone().multiplyScalar(0.8)));
  for (const y of [0.35, 1.05, 1.75]) for (const x of [0.15, DOOR_W - 0.15]) b.add('brass', new IcosahedronGeometry(0.022, 0).translate(x, y, 0.08));
  b.add('iron', new TorusGeometry(0.06, 0.012, 6, 14).translate(DOOR_W - 0.16, 1.05, 0.085));
  if (!h.shelter) {
    // A padlock on the hasp: the family is out at the pandal.
    b.add('iron', new BoxGeometry(0.16, 0.03, 0.03).translate(DOOR_W - 0.06, 1.2, 0.08));
    b.add('brass', new BoxGeometry(0.07, 0.08, 0.035).translate(DOOR_W - 0.02, 1.13, 0.1));
  }
  return b.build(a.kit, { name: `door:${h.id}` });
}

/**
 * Lamps, star lantern, diyas, rangoli, pots and a rope cot — the evening's life around a house —
 * into the full-detail batch `b`; the decals go in `decals`, a shelter's room in `room`.
 */
function details(a: ArtContext, h: HouseDef, d: HouseDims, s: Style, r: () => number, b: Batch, decals: Group, room: Group): void {
  const o = { x: h.x, z: h.z };
  const world = (lx: number, y: number, lz: number) => {
    const p = toWorld(o, h.rot, lx, lz);
    return new Vector3(p.x, y, p.z);
  };

  // Wall lantern beside the door: lit where the door is open to anyone tonight, dark where the
  // family is out. The lamp by the doorway is how a shelter is recognised — no markers.
  const lx = d.doorX + DOOR_W / 2 + 0.55;
  const ly = PLINTH_H + 2.2;
  const lz = d.wallFace + 0.16;
  b.add('iron', new BoxGeometry(0.04, 0.04, 0.2).translate(lx, ly + 0.2, lz - 0.08));
  b.add('iron', new BoxGeometry(0.16, 0.03, 0.16).translate(lx, ly + 0.15, lz));
  b.add('iron', new BoxGeometry(0.14, 0.03, 0.14).translate(lx, ly - 0.14, lz));
  if (h.shelter) {
    b.add('lamplit', new BoxGeometry(0.11, 0.26, 0.11).translate(lx, ly, lz));
    a.flames.add(world(lx, ly - 0.08, lz), 1.1);
    a.lamps.anchor(world(lx, ly - 0.1, lz + 0.35), s.hut ? 1.4 : 2.1);
  } else {
    b.add('paint', new BoxGeometry(0.11, 0.26, 0.11).translate(lx, ly, lz), '#3a3530');
  }

  // Akash kandil: a paper star lantern hung from the veranda beam.
  if (!s.hut) {
    const kz = h.storeys === 2 ? d.verandaEdge - 0.6 : (d.wallFace + d.verandaEdge) / 2;
    const ky = (h.storeys === 2 ? PLINTH_H + STOREY_H - 0.2 : (d.verandaRoofHigh + d.verandaRoofLow) / 2) - 0.55;
    const kx = d.doorX + (r() < 0.5 ? -1.6 : 1.6);
    b.add('iron', new BoxGeometry(0.008, 0.4, 0.008).translate(kx, ky + 0.42, kz));
    const star = new IcosahedronGeometry(0.2, 0);
    star.scale(1, 1.25, 1);
    b.add('lamplit', star.translate(kx, ky, kz));
    for (const tx of [-0.08, 0, 0.08]) b.add('paint', new BoxGeometry(0.02, 0.3, 0.004).translate(kx + tx, ky - 0.36, kz), r() < 0.5 ? TONE.vermilion : TONE.marigoldYellow);
  }

  // Diyas on the steps and the plinth edge.
  const diya = lathe([[0.001, 0], [0.045, 0.005], [0.065, 0.025], [0.07, 0.04], [0.055, 0.035], [0.001, 0.02]], 10);
  const diyaAt = (x: number, y: number, z: number) => {
    b.add('paint', diya.clone().translate(x, y, z), '#9c4a2a');
    a.flames.add(world(x, y + 0.04, z));
  };
  for (let i = 0; i < STEP_COUNT; i++) {
    const top = PLINTH_H - STEP_RISE * (i + 1);
    const z = d.verandaEdge + STEP_RUN * (i + 0.5);
    for (const sx of [-1, 1]) diyaAt(d.doorX + sx * (d.stepsWidth / 2 - 0.12), top, z);
  }
  for (const sx of [-1, 1]) for (const k of [1.3, 2.1]) diyaAt(d.doorX + sx * k, PLINTH_H + 0.05, d.verandaEdge - 0.12);
  diya.dispose();

  // Water pots by the door.
  if (!s.hut) {
    const pot = lathe([[0.001, 0], [0.12, 0.02], [0.2, 0.14], [0.21, 0.22], [0.16, 0.34], [0.09, 0.38], [0.1, 0.42], [0.001, 0.42]], 12);
    b.add('paint', pot.clone().translate(d.doorX - 1.05, PLINTH_H + 0.05, d.wallFace + 0.35), '#8e4a2c');
    b.add('brass', pot.clone().scale(0.6, 0.6, 0.6).translate(d.doorX - 0.75, PLINTH_H + 0.05, d.wallFace + 0.3));
    pot.dispose();
  }

  // A rope cot (charpai) on some verandas.
  if (h.storeys === 1 && !s.hut && r() < 0.6) {
    const cx = (r() < 0.5 ? -1 : 1) * (d.halfW - 1.25);
    const cz = d.wallFace + 0.75;
    const top = PLINTH_H + 0.42;
    for (const sz of [-0.42, 0.42]) b.add('teak', fill(box('teak', 1.9, 0.07, 0.07, cx, top, cz + sz), '#6e4a2c'));
    for (const sx of [-0.93, 0.93]) b.add('teak', fill(box('teak', 0.07, 0.07, 0.9, cx + sx, top, cz), '#6e4a2c'));
    for (const sx of [-0.93, 0.93]) for (const sz of [-0.42, 0.42]) b.add('teak', fill(box('teak', 0.07, 0.42, 0.07, cx + sx, PLINTH_H + 0.21, cz + sz), '#5d3f28'));
    b.add('fabric', fill(boxUV(new BoxGeometry(1.8, 0.02, 0.8).translate(cx, top + 0.02, cz), 'fabric'), '#cdb27c'));
  }

  if (h.shelter) {
    // A warm pool of lamplight on the veranda before an open door.
    const pool = new Mesh(new PlaneGeometry(2.4, 1.8).rotateX(-Math.PI / 2), a.kit.decal('shelter-pool', glow(a.bank), { additive: true, opacity: 0.22 }));
    (pool.material as MeshBasicMaterial).color.set('#ff9c45');
    pool.position.set(d.doorX + 0.25, PLINTH_H + 0.03, d.wallFace + 0.85);
    decals.add(pool);
    // The room behind the door: no shadows of its own (the walls and roof cast the room's).
    const furnished = furnishRoom(a, h, d, s, world);
    room.add(furnished.batch.build(a.kit, { name: `house:${h.id}:room`, cast: false }), ...furnished.extras, ...moonbeams(a, h));
  }

  // Rangoli at the foot of the steps (a decal: its own mesh, no shadows).
  const styles: RangoliStyle[] = ['flower', 'kolam', 'lotus'];
  const styleName = s.hut ? 'kolam' : styles[Math.floor(r() * 3)];
  const seed = Math.floor(r() * 3);
  const size = styleName === 'kolam' ? 1.3 : 1.55;
  const rg = new Mesh(new PlaneGeometry(size, size).rotateX(-Math.PI / 2), a.kit.decal(`rangoli-${styleName}-${seed}`, rangoli(a.bank, styleName, seed)));
  rg.position.set(d.doorX, 0.015, d.verandaEdge + STEP_RUN * STEP_COUNT + 0.95);
  rg.receiveShadow = true;
  decals.add(rg);
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
