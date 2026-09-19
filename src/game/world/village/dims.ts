/**
 * Derived building measurements, shared by collision (solids.ts) and every renderer (greybox and
 * art). A number lives here once — so what you see is exactly what you collide with.
 */
import type { HouseDef, P2, ShopDef, TempleDef } from './types';

/** Raised house plinth — the ota / thinnai you sit on in the evening. */
export const PLINTH_H = 0.45;
export const STEP_RISE = 0.15;
export const STEP_RUN = 0.36;
/** Rises from the ground to the plinth (the last rise is the plinth itself). */
export const STEP_COUNT = Math.round(PLINTH_H / STEP_RISE) - 1;
export const STOREY_H = 2.9;
export const DOOR_W = 1.1;
export const DOOR_H = 2.1;
export const ROOF_OVERHANG = 0.55;
/**
 * Walls stand this far outside a building's nominal footprint (half the wall thickness plus render
 * detail). Collision and visuals both use the outer faces below — the wall you see is the wall you hit.
 */
export const WALL_MARGIN = 0.25;
/** Rise over run of a clay-tile roof — about 24°, typical for Mangalore tiles. */
export const ROOF_PITCH = 0.45;

/** Rotates a local (x, z) by `rot` about y and offsets by `o`. Matches Object3D.rotation.y. */
export function toWorld(o: P2, rot: number, lx: number, lz: number): P2 {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
}

export interface HouseDims {
  /** Outer wall half-extents (local x, local z). */
  halfW: number;
  halfD: number;
  /** Local z of the outer face of the front wall — where the door leaf sits. */
  wallFace: number;
  wallH: number;
  verandaDepth: number;
  /** Local z of the front wall face. */
  front: number;
  /** Local z of the veranda's outer edge. */
  verandaEdge: number;
  doorX: number;
  /** Local z where the player stands to use the door. */
  doorStandZ: number;
  /** Height the eaves sit at. */
  eaveH: number;
  roofRise: number;
  /** Veranda lean-to roof: high end at the wall, low end at the posts. */
  verandaRoofHigh: number;
  verandaRoofLow: number;
  /** Local x of the veranda posts. */
  postXs: number[];
  stepsWidth: number;
}

export function houseDims(h: HouseDef): HouseDims {
  const hut = h.kind === 'hut';
  const wallH = hut ? 2.4 : STOREY_H * h.storeys;
  const verandaDepth = hut ? 1.3 : h.storeys === 2 ? 1.7 : 2.1;
  const front = h.depth / 2;
  const doorX = h.doorOffset ?? 0;
  const half = h.width / 2 - 0.35;
  const pitch = h.roof === 'thatch' ? 0.85 : ROOF_PITCH;
  // Rise from the wall line to the ridge: over the half-depth (gable) or the shorter half-side (hip).
  const halfD = h.depth / 2 + WALL_MARGIN;
  const halfW = h.width / 2 + WALL_MARGIN;
  const roofRise = h.roof === 'flat' ? 0 : pitch * (h.roof === 'gable' ? halfD : Math.min(halfW, halfD));
  return {
    halfW: h.width / 2 + WALL_MARGIN,
    halfD: h.depth / 2 + WALL_MARGIN,
    wallFace: front + WALL_MARGIN,
    wallH,
    verandaDepth,
    front,
    verandaEdge: front + verandaDepth,
    doorX,
    doorStandZ: front + 0.75,
    eaveH: PLINTH_H + wallH,
    roofRise,
    verandaRoofHigh: PLINTH_H + Math.min(wallH, STOREY_H) - 0.15,
    // Two-storey houses: the veranda's "roof" is the balcony slab, and the pillars rise to meet it.
    verandaRoofLow: h.storeys === 2 ? PLINTH_H + STOREY_H - 0.2 : PLINTH_H + (hut ? 1.95 : 2.2),
    postXs: [-half, doorX - 1.3 < -half + 0.8 ? -half : doorX - 1.3, doorX + 1.3 > half - 0.8 ? half : doorX + 1.3, half].filter(
      (v, i, a) => a.indexOf(v) === i,
    ),
    stepsWidth: 1.9,
  };
}

/** The pitched roof's outline, shared by its collider and its mesh. */
export interface RoofShape {
  /** Half-extents of the eave outline (x, z) and its height. */
  ex: number;
  ez: number;
  ey: number;
  /** Ridge height and half-length along x. */
  ry: number;
  ridge: number;
  pitch: number;
}

export function roofShape(h: HouseDef, d: HouseDims): RoofShape {
  const pitch = d.roofRise / (h.roof === 'gable' ? d.halfD : Math.min(d.halfW, d.halfD));
  const gable = h.roof === 'gable';
  return {
    ex: d.halfW + (gable ? ROOF_OVERHANG * 0.7 : ROOF_OVERHANG),
    ez: d.halfD + ROOF_OVERHANG,
    ey: d.eaveH - ROOF_OVERHANG * pitch,
    ry: d.eaveH + d.roofRise,
    ridge: gable ? d.halfW + ROOF_OVERHANG * 0.7 : Math.max(d.halfW - d.halfD, 0.05),
    pitch,
  };
}

export interface ShopDims {
  wallH: number;
  plinthH: number;
  /** Counter in front of the open shopfront. */
  counterH: number;
  counterDepth: number;
  /** Local z of the counter's outer face. */
  counterFront: number;
  awningDepth: number;
  awningHigh: number;
  awningLow: number;
}

export function shopDims(s: ShopDef): ShopDims {
  return {
    wallH: 3.3,
    plinthH: 0.3,
    counterH: 0.92,
    counterDepth: 0.7,
    counterFront: s.depth / 2 + 0.55,
    awningDepth: 1.9,
    awningHigh: 3.0,
    awningLow: 2.35,
  };
}

export interface TempleDims {
  /** Platform centre (world). */
  platformZ: number;
  stepsCount: number;
  stepsWidth: number;
  /** Mandapa (pillared hall) — front half of the platform. */
  mandapaW: number;
  mandapaFront: number;
  mandapaBack: number;
  mandapaH: number;
  pillarXs: number[];
  pillarZs: number[];
  /** Sanctum (garbhagriha) — back half. */
  sanctumW: number;
  sanctumFront: number;
  sanctumBack: number;
  sanctumH: number;
  shikharaH: number;
}

export function templeDims(t: TempleDef): TempleDims {
  const platformZ = t.z - 2;
  const pFront = platformZ + t.platformD / 2; // south edge of the platform
  const mandapaFront = pFront - 0.6;
  const mandapaBack = mandapaFront - 5.6;
  return {
    platformZ,
    stepsCount: Math.round(t.platformH / STEP_RISE) - 1,
    stepsWidth: 4,
    mandapaW: 8,
    mandapaFront,
    mandapaBack,
    mandapaH: 3.1,
    pillarXs: [-3.4, -1.3, 1.3, 3.4],
    pillarZs: [mandapaFront - 0.35, mandapaBack + 2.4],
    sanctumW: 6,
    sanctumFront: mandapaBack,
    sanctumBack: mandapaBack - 6,
    sanctumH: 4.2,
    shikharaH: 9.5,
  };
}
