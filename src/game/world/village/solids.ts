/**
 * Layout → collision solids, door points and trigger zones. Pure data (no Three.js, no Rapier), so
 * the same list builds the physics world in the game, the physics world in tests, and the
 * navigation grid the level tests walk.
 */
import { DOOR_H, DOOR_W, houseDims, interiorDims, PLINTH_H, roofShape, shopDims, STEP_RISE, STEP_RUN, STEP_COUNT, STOREY_H, templeDims, toWorld, WALL_T } from './dims';
import type { AreaDef, LandmarkDef, P2, TreeKind, VillageLayout } from './types';

/** Which physics layer a solid lives on. 'none' = navigation-only (no collider). */
export type SolidLayer = 'world' | 'prop' | 'blocker' | 'none';
/**
 * How navigation treats a solid: 'block' — can't walk through; 'walkable' — a raised floor you can
 * stand on (reached by steps); 'ignore' — overhead (roofs, eaves) or otherwise irrelevant.
 */
export type NavRole = 'block' | 'walkable' | 'ignore';

interface SolidBase {
  layer: SolidLayer;
  nav: NavRole;
  /** Which feature produced it — for debugging and tests. */
  tag: string;
}
export interface BoxSolid extends SolidBase {
  kind: 'box';
  /** Centre. */
  x: number;
  y: number;
  z: number;
  /** Full size. */
  sx: number;
  sy: number;
  sz: number;
  /** Rotation about y, radians. */
  rot: number;
}
export interface CylSolid extends SolidBase {
  kind: 'cyl';
  x: number;
  /** Bottom. */
  y: number;
  z: number;
  r: number;
  h: number;
}
export interface HullSolid extends SolidBase {
  kind: 'hull';
  points: { x: number; y: number; z: number }[];
}
export type Solid = BoxSolid | CylSolid | HullSolid;

export interface DoorPoint {
  houseId: string;
  family: string;
  /** A shelter: its door opens and its front room can be walked into (see interiorDims). */
  shelter: boolean;
  /** Where the player stands to use the door. */
  x: number;
  y: number;
  z: number;
  /** Heading that faces the door. */
  yaw: number;
}

export interface Level {
  solids: Solid[];
  doors: DoorPoint[];
  zones: AreaDef[];
  templeOffer: { x: number; y: number; z: number };
  spawn: { x: number; y: number; z: number; yaw: number };
}

const TRUNK: Record<TreeKind, { r: number; layer: SolidLayer }> = {
  banyan: { r: 1.1, layer: 'world' },
  peepal: { r: 0.7, layer: 'world' },
  neem: { r: 0.3, layer: 'world' },
  mango: { r: 0.34, layer: 'world' },
  coconut: { r: 0.2, layer: 'prop' },
  banana: { r: 0.15, layer: 'prop' },
};

const VILLAGE_PEOPLE = (v: VillageLayout) => v.villagers;

export function buildLevel(v: VillageLayout): Level {
  const v_ = v;
  const solids: Solid[] = [];
  const doors: DoorPoint[] = [];

  const box = (o: P2, rot: number, lx: number, lz: number, y: number, sx: number, sy: number, sz: number, layer: SolidLayer, nav: NavRole, tag: string) => {
    const c = toWorld(o, rot, lx, lz);
    solids.push({ kind: 'box', x: c.x, y, z: c.z, sx, sy, sz, rot, layer, nav, tag });
  };
  const cyl = (x: number, z: number, y: number, r: number, h: number, layer: SolidLayer, nav: NavRole, tag: string) =>
    solids.push({ kind: 'cyl', x, y, z, r, h, layer, nav, tag });
  const hull = (o: P2, rot: number, pts: [number, number, number][], layer: SolidLayer, tag: string) =>
    solids.push({
      kind: 'hull',
      points: pts.map(([lx, y, lz]) => {
        const w = toWorld(o, rot, lx, lz);
        return { x: w.x, y, z: w.z };
      }),
      layer,
      nav: 'ignore',
      tag,
    });
  /**
   * A raised platform you reach by steps: a walkable top, plus navigation-only rim strips so paths
   * only climb where the steps are. `openings` are [from, to] spans of the front edge (local x).
   */
  const platform = (o: P2, rot: number, cx: number, cz: number, w: number, d: number, h: number, openings: [number, number][], tag: string, layer: SolidLayer = 'world') => {
    box(o, rot, cx, cz, h / 2, w, h, d, layer, 'walkable', tag);
    const rim = 0.12;
    box(o, rot, cx, cz - d / 2, h / 2, w, h, rim, 'none', 'block', `${tag}:rim-back`);
    box(o, rot, cx - w / 2, cz, h / 2, rim, h, d, 'none', 'block', `${tag}:rim-left`);
    box(o, rot, cx + w / 2, cz, h / 2, rim, h, d, 'none', 'block', `${tag}:rim-right`);
    let x = cx - w / 2;
    for (const [a, b] of [...openings, [cx + w / 2, cx + w / 2] as [number, number]]) {
      if (a > x) box(o, rot, (x + a) / 2, cz + d / 2, h / 2, a - x, h, rim, 'none', 'block', `${tag}:rim-front`);
      x = b;
    }
  };
  /**
   * Steps rising toward local −z, their top edge at `topZ`, reaching height `top`.
   *
   * The treads are what you *see*; what you *walk on* is a smooth ramp under them. Rapier's
   * character controller wedges itself on the edge of a longer flight of box steps (caught by the
   * playthrough test), and a ramp also stops the camera bobbing on every tread — which is why
   * shipped games do stairs this way. Side rims keep navigation from climbing on from the side.
   */
  const steps = (o: P2, rot: number, cx: number, topZ: number, width: number, top: number, count: number, tag: string) => {
    for (let i = 0; i < count; i++) {
      const h = top - STEP_RISE * (i + 1);
      const z = topZ + STEP_RUN * (i + 0.5);
      box(o, rot, cx, z, h / 2, width, h, STEP_RUN, 'none', 'walkable', `${tag}:step${i}`);
    }
    const outer = topZ + STEP_RUN * count;
    const hw = width / 2;
    hull(o, rot, [[cx - hw, 0, outer], [cx + hw, 0, outer], [cx - hw, top, topZ], [cx + hw, top, topZ], [cx - hw, 0, topZ], [cx + hw, 0, topZ]], 'world', `${tag}:ramp`);
    const run = STEP_RUN * count;
    for (const side of [-1, 1]) box(o, rot, cx + side * (hw + 0.06), topZ + run / 2 - 0.1, top / 2, 0.12, top, run - 0.2, 'none', 'block', `${tag}:rim-side`);
  };

  // ---- Houses -------------------------------------------------------------------------------
  for (const h of v.houses) {
    const d = houseDims(h);
    const o = { x: h.x, z: h.z };
    const tag = `house:${h.id}`;
    if (h.shelter) {
      // A shell with a front room you can walk into: back block, side walls, a front wall with
      // a doorway, floor, ceiling, and the door itself (enabled while it's shut).
      const r = interiorDims(h);
      const E = d.eaveH;
      const W = d.halfW * 2;
      const fz = (r.zFront + d.halfD) / 2;
      const dl = d.doorX - DOOR_W / 2;
      const dr = d.doorX + DOOR_W / 2;
      box(o, h.rot, 0, (-d.halfD + r.zBack) / 2, E / 2, W, E, r.zBack + d.halfD, 'world', 'block', tag);
      for (const sx of [-1, 1]) box(o, h.rot, sx * (d.halfW - WALL_T / 2), (r.zBack + r.zFront) / 2, E / 2, WALL_T, E, r.zFront - r.zBack, 'world', 'block', tag);
      box(o, h.rot, (-d.halfW + dl) / 2, fz, E / 2, dl + d.halfW, E, WALL_T, 'world', 'block', tag);
      box(o, h.rot, (dr + d.halfW) / 2, fz, E / 2, d.halfW - dr, E, WALL_T, 'world', 'block', tag);
      box(o, h.rot, d.doorX, fz, (PLINTH_H + DOOR_H + E) / 2, DOOR_W, E - PLINTH_H - DOOR_H, WALL_T, 'world', 'block', tag);
      box(o, h.rot, d.doorX, fz, PLINTH_H / 2, DOOR_W, PLINTH_H, WALL_T, 'world', 'ignore', `${tag}:sill`);
      box(o, h.rot, (r.x0 + r.x1) / 2, (r.zBack + r.zFront) / 2, PLINTH_H / 2, r.x1 - r.x0, PLINTH_H, r.zFront - r.zBack, 'world', 'ignore', `${tag}:floor`);
      box(o, h.rot, (r.x0 + r.x1) / 2, (r.zBack + r.zFront) / 2, (r.ceilingY + E) / 2, r.x1 - r.x0, E - r.ceilingY, r.zFront - r.zBack, 'world', 'ignore', `${tag}:ceiling`);
      box(o, h.rot, d.doorX, fz, PLINTH_H + DOOR_H / 2, DOOR_W, DOOR_H, WALL_T, 'world', 'block', `${tag}:door`);
      // The room is not part of the street network: outdoor navigation treats it as solid.
      box(o, h.rot, (r.x0 + r.x1) / 2, (r.zBack + r.zFront) / 2, 1, r.x1 - r.x0, 2, r.zFront - r.zBack, 'none', 'block', `${tag}:interior`);
    } else {
      // Walls (the whole block, plinth to eaves).
      box(o, h.rot, 0, 0, d.eaveH / 2, d.halfW * 2, d.eaveH, d.halfD * 2, 'world', 'block', tag);
    }
    // Plinth and veranda: walkable, reached by the steps.
    platform(o, h.rot, 0, d.front + d.verandaDepth / 2, d.halfW * 2, d.verandaDepth, PLINTH_H, [[d.doorX - d.stepsWidth / 2, d.doorX + d.stepsWidth / 2]], `${tag}:veranda`);
    steps(o, h.rot, d.doorX, d.verandaEdge, d.stepsWidth, PLINTH_H, STEP_COUNT, `${tag}:steps`);
    // Veranda posts — thin: stop the player, not the camera.
    for (const px of d.postXs) {
      const p = toWorld(o, h.rot, px, d.verandaEdge - 0.18);
      cyl(p.x, p.z, PLINTH_H, 0.1, d.verandaRoofLow - PLINTH_H, 'prop', 'block', `${tag}:post`);
    }
    // Roofs — the same outline the art draws (dims.roofShape).
    const eave = d.eaveH;
    const hw = d.halfW + 0.3;
    if (h.roof === 'flat') {
      box(o, h.rot, 0, 0, eave + 0.35, d.halfW * 2 + 0.2, 0.7, d.halfD * 2 + 0.2, 'world', 'ignore', `${tag}:parapet`);
    } else {
      const r = roofShape(h, d);
      hull(o, h.rot, [[-r.ex, r.ey, -r.ez], [r.ex, r.ey, -r.ez], [-r.ex, r.ey, r.ez], [r.ex, r.ey, r.ez], [-r.ridge, r.ry + 0.1, 0], [r.ridge, r.ry + 0.1, 0]], 'world', `${tag}:roof`);
    }
    if (h.storeys === 2) {
      // The balcony slab over the veranda.
      box(o, h.rot, 0, (d.wallFace + d.verandaEdge + 0.2) / 2, PLINTH_H + STOREY_H - 0.1, d.halfW * 2, 0.2, d.verandaEdge + 0.2 - d.wallFace, 'world', 'ignore', `${tag}:balcony`);
    } else {
      // The veranda's lean-to roof.
      const zEdge = d.verandaEdge + 0.35;
      const lowAtEdge = d.verandaRoofLow - (0.35 * (d.verandaRoofHigh - d.verandaRoofLow)) / (d.verandaEdge - d.wallFace);
      hull(
        o,
        h.rot,
        [
          [-hw, d.verandaRoofHigh + 0.12, d.wallFace - 0.05],
          [hw, d.verandaRoofHigh + 0.12, d.wallFace - 0.05],
          [-hw, lowAtEdge + 0.12, zEdge],
          [hw, lowAtEdge + 0.12, zEdge],
          [-hw, d.verandaRoofHigh - 0.1, d.wallFace - 0.05],
          [hw, d.verandaRoofHigh - 0.1, d.wallFace - 0.05],
          [-hw, lowAtEdge - 0.1, zEdge],
          [hw, lowAtEdge - 0.1, zEdge],
        ],
        'world',
        `${tag}:veranda-roof`,
      );
    }
    const stand = toWorld(o, h.rot, d.doorX, d.doorStandZ);
    doors.push({ houseId: h.id, family: h.family, shelter: h.shelter, x: stand.x, y: PLINTH_H, z: stand.z, yaw: h.rot + Math.PI });
  }

  // ---- Shops --------------------------------------------------------------------------------
  for (const s of v.shops) {
    const d = shopDims(s);
    const o = { x: s.x, z: s.z };
    const tag = `shop:${s.id}`;
    box(o, s.rot, 0, 0, (d.wallH + 0.6) / 2, s.width + 0.3, d.wallH + 0.6, s.depth + 0.3, 'world', 'block', tag);
    box(o, s.rot, 0, d.counterFront - d.counterDepth / 2, d.counterH / 2, s.width - 0.4, d.counterH, d.counterDepth, 'world', 'block', `${tag}:counter`);
    for (const px of [-s.width / 2 + 0.25, s.width / 2 - 0.25]) {
      const p = toWorld(o, s.rot, px, s.depth / 2 + d.awningDepth - 0.1);
      cyl(p.x, p.z, 0, 0.06, d.awningLow, 'prop', 'block', `${tag}:awning-pole`);
    }
  }

  // ---- Temple -------------------------------------------------------------------------------
  const t = v.temple;
  const td = templeDims(t);
  const to = { x: t.x, z: 0 };
  const pFront = td.platformZ + t.platformD / 2;
  platform(to, 0, 0, td.platformZ, t.platformW, t.platformD, t.platformH, [[-td.stepsWidth / 2, td.stepsWidth / 2]], 'temple:platform');
  steps(to, 0, 0, pFront, td.stepsWidth, t.platformH, td.stepsCount, 'temple:steps');
  // Sanctum: solid; devotees offer from the mandapa, facing the deity.
  const sanctumZ = (td.sanctumFront + td.sanctumBack) / 2;
  box(to, 0, 0, sanctumZ, t.platformH + td.sanctumH / 2, td.sanctumW, td.sanctumH, td.sanctumFront - td.sanctumBack, 'world', 'block', 'temple:sanctum');
  // Shikhara — the spire, a tapering hull.
  const sb = td.sanctumW / 2 + 0.3;
  const top = t.platformH + td.sanctumH;
  hull(to, 0, [
    [-sb, top, td.sanctumBack - 0.3], [sb, top, td.sanctumBack - 0.3], [-sb, top, td.sanctumFront + 0.3], [sb, top, td.sanctumFront + 0.3],
    [-0.6, top + td.shikharaH, sanctumZ - 0.6], [0.6, top + td.shikharaH, sanctumZ - 0.6], [-0.6, top + td.shikharaH, sanctumZ + 0.6], [0.6, top + td.shikharaH, sanctumZ + 0.6],
  ], 'world', 'temple:shikhara');
  // Mandapa pillars and roof.
  for (const px of td.pillarXs) for (const pz of td.pillarZs) cyl(t.x + px, pz, t.platformH, 0.24, td.mandapaH, 'prop', 'block', 'temple:pillar');
  box(to, 0, 0, (td.mandapaFront + td.mandapaBack) / 2, t.platformH + td.mandapaH + 0.25, td.mandapaW + 0.8, 0.5, td.mandapaFront - td.mandapaBack + 0.8, 'world', 'ignore', 'temple:mandapa-roof');

  // ---- Walls and fences -----------------------------------------------------------------------
  const segments = (pts: P2[], each: (a: P2, b: P2) => void) => {
    for (let i = 0; i + 1 < pts.length; i++) each(pts[i], pts[i + 1]);
  };
  for (const w of v.walls) {
    segments(w.points, (a, b) => {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const rot = Math.atan2(b.x - a.x, b.z - a.z);
      solids.push({ kind: 'box', x: (a.x + b.x) / 2, y: w.height / 2, z: (a.z + b.z) / 2, sx: w.thickness, sy: w.height, sz: len + w.thickness, rot, layer: 'world', nav: 'block', tag: `wall:${w.id}` });
    });
  }
  for (const f of v.fences) {
    const thick = f.kind === 'hedge' ? 0.8 : 0.12;
    const high = f.kind === 'hedge' ? 1.15 : 1.1;
    segments(f.points, (a, b) => {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const rot = Math.atan2(b.x - a.x, b.z - a.z);
      solids.push({ kind: 'box', x: (a.x + b.x) / 2, y: high / 2, z: (a.z + b.z) / 2, sx: thick, sy: high, sz: len, rot, layer: 'prop', nav: 'block', tag: `fence:${f.id}` });
    });
  }

  // ---- Trees --------------------------------------------------------------------------------
  for (const tr of v.trees) {
    const k = TRUNK[tr.kind];
    cyl(tr.x, tr.z, 0, k.r * tr.scale, tr.kind === 'banana' ? 2 : 4, k.layer, 'block', `tree:${tr.kind}`);
  }

  // ---- Landmarks ----------------------------------------------------------------------------
  for (const l of v.landmarks) landmarkSolids(l, box, cyl, platform);

  // ---- Villagers: blocking the player like any person would (not the camera) -------------------
  for (const v of VILLAGE_PEOPLE(v_)) {
    if (v.noCollider) continue;
    const low = v.pose === 'kneel' || v.pose === 'sit-edge' || v.pose === 'sit-stool';
    // A seated villager's legs reach forward: centre the collider over the knees.
    const reach = v.pose === 'sit-edge' ? 0.3 : v.pose === 'kneel' ? 0.1 : 0;
    cyl(v.x + Math.sin(v.rot) * reach, v.z + Math.cos(v.rot) * reach, 0, low ? 0.42 : 0.3, low ? 1.2 : 1.75, 'prop', 'block', `villager:${v.id}`);
  }

  // ---- Map edge -------------------------------------------------------------------------------
  const b = v.bounds;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const W = b.maxX - b.minX;
  const D = b.maxZ - b.minZ;
  for (const [x, z, sx, sz] of [
    [cx, b.minZ - 0.5, W + 2, 1],
    [cx, b.maxZ + 0.5, W + 2, 1],
    [b.minX - 0.5, cz, 1, D + 2],
    [b.maxX + 0.5, cz, 1, D + 2],
  ] as const) {
    solids.push({ kind: 'box', x, y: 5, z, sx, sy: 10, sz, rot: 0, layer: 'blocker', nav: 'block', tag: 'edge' });
  }
  for (const { a, b: e } of v.edgeCuts) {
    const len = Math.hypot(e.x - a.x, e.z - a.z);
    solids.push({ kind: 'box', x: (a.x + e.x) / 2, y: 5, z: (a.z + e.z) / 2, sx: 1, sy: 10, sz: len, rot: Math.atan2(e.x - a.x, e.z - a.z), layer: 'blocker', nav: 'block', tag: 'edge:cut' });
  }

  return {
    solids,
    doors,
    zones: v.areas,
    templeOffer: { x: t.offerX, y: t.platformH, z: t.offerZ },
    spawn: { x: v.spawn.x, y: 0, z: v.spawn.z, yaw: v.spawnYaw },
  };
}

type BoxFn = (o: P2, rot: number, lx: number, lz: number, y: number, sx: number, sy: number, sz: number, layer: SolidLayer, nav: NavRole, tag: string) => void;
type CylFn = (x: number, z: number, y: number, r: number, h: number, layer: SolidLayer, nav: NavRole, tag: string) => void;
type PlatformFn = (o: P2, rot: number, cx: number, cz: number, w: number, d: number, h: number, openings: [number, number][], tag: string, layer?: SolidLayer) => void;

/** Footprints of the landmark props. Visual detail lives in the art modules; these are what you bump into. */
function landmarkSolids(l: LandmarkDef, box: BoxFn, cyl: CylFn, _platform: PlatformFn): void {
  const o = { x: l.x, z: l.z };
  const tag = `landmark:${l.kind}:${l.id}`;
  switch (l.kind) {
    case 'pandal': {
      // 9 m wide (local x) × 7 m deep (local z), open toward local +z. Stage at the back.
      box(o, l.rot, 0, -2.25, 0.35, 7, 0.7, 2.5, 'world', 'block', `${tag}:stage`);
      for (const [px, pz] of [[-4.5, -3.5], [4.5, -3.5], [-4.5, 3.5], [4.5, 3.5], [-4.5, 0], [4.5, 0]]) {
        const p = toWorld(o, l.rot, px, pz);
        cyl(p.x, p.z, 0, 0.08, 4.2, 'prop', 'block', `${tag}:pole`);
      }
      // Side cloth walls (camera passes through fabric).
      box(o, l.rot, -4.5, -0.9, 1.4, 0.1, 2.8, 5.2, 'prop', 'block', `${tag}:side`);
      box(o, l.rot, 4.5, -0.9, 1.4, 0.1, 2.8, 5.2, 'prop', 'block', `${tag}:side`);
      break;
    }
    case 'banyan-platform':
      cyl(l.x, l.z, 0, 3.2, 0.5, 'world', 'block', tag);
      break;
    case 'well':
      cyl(l.x, l.z, 0, 1.05, 0.85, 'world', 'block', tag);
      break;
    case 'pond':
      // A stepped tank: rim walls you can't step over; the water is inside.
      for (const [lx, lz, sx, sz] of [[0, -3.2, 9, 0.5], [0, 3.2, 9, 0.5], [-4.25, 0, 0.5, 6.9], [4.25, 0, 0.5, 6.9]] as const) {
        box(o, l.rot, lx, lz, 0.3, sx, 0.6, sz, 'world', 'block', `${tag}:rim`);
      }
      box(o, l.rot, 0, 0, 0.3, 8, 0.6, 6, 'none', 'block', `${tag}:water`);
      break;
    case 'deepastambha':
      cyl(l.x, l.z, 0, 0.5, 4.6, 'world', 'block', tag);
      break;
    case 'shrine':
      box(o, l.rot, 0, 0, 0.5, 0.8, 1.0, 0.9, 'world', 'block', tag);
      break;
    case 'tulsi':
      box(o, l.rot, 0, 0, 0.5, 0.85, 1.0, 0.85, 'prop', 'block', tag);
      break;
    case 'flower-stall':
      box(o, l.rot, 0, -0.35, 0.4, 2.4, 0.8, 1.1, 'prop', 'block', tag);
      break;
    case 'potter':
      box(o, l.rot, 0, -0.9, 0.4, 2.6, 0.8, 0.8, 'prop', 'block', `${tag}:pots`);
      break;
    case 'fruit-stall':
      box(o, l.rot, 0, -0.35, 0.45, 2.6, 0.9, 1.2, 'prop', 'block', tag);
      break;
    case 'puja-stall':
      box(o, l.rot, 0, -0.4, 0.42, 1.6, 0.85, 0.9, 'prop', 'block', tag);
      break;
    case 'cart':
      box(o, l.rot, 0, 0, 0.7, 1.5, 1.4, 3.2, 'prop', 'block', tag);
      break;
    case 'haystack':
      cyl(l.x, l.z, 0, 1.45, 2.4, 'world', 'block', tag);
      break;
    case 'scarecrow':
      cyl(l.x, l.z, 0, 0.12, 2.1, 'prop', 'block', tag);
      break;
    case 'handpump':
      cyl(l.x, l.z, 0, 0.18, 1.2, 'prop', 'block', tag);
      break;
  }
}
