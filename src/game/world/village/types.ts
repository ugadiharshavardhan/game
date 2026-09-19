/**
 * The village as data. No Three.js, no physics — so the level can be validated in plain Node
 * (reachability, route choice, shelter coverage) before anything is drawn.
 *
 * Conventions: metres; y up; north is −z. A building's door faces its local +z, rotated by `rot`
 * (radians about y): rot 0 → door faces +z (south), π → north, π/2 → east, −π/2 → west.
 */

export interface P2 {
  x: number;
  z: number;
}

export type RoadKind = 'main' | 'lane' | 'path';

export interface RoadDef {
  id: string;
  kind: RoadKind;
  width: number;
  points: P2[];
}

export type RoofStyle = 'gable' | 'hip' | 'flat' | 'thatch';

/** Muted, lime-wash and mineral paints — see art/palette.ts. */
export type PaintId = 'limewhite' | 'ochre' | 'indigo' | 'turquoise' | 'rose' | 'saffron' | 'sage';

export interface HouseDef {
  id: string;
  /** A farmer's hut is a shelter too, but not one of the village's houses. */
  kind?: 'house' | 'hut';
  /** Family name for the prompt and environmental storytelling. */
  family: string;
  x: number;
  z: number;
  rot: number;
  /** Walled block, along local x. */
  width: number;
  /** Walled block, along local z. */
  depth: number;
  storeys: 1 | 2;
  roof: RoofStyle;
  paint: PaintId;
  /** Door usable as a shelter during moonlight. */
  shelter: boolean;
  /** Door offset along local x from the centre of the front wall. */
  doorOffset?: number;
  /** Two-storey houses may have a front balcony. */
  balcony?: boolean;
  /** The player's own home. */
  start?: boolean;
}

export type ShopKind = 'kirana' | 'sweets';

export interface ShopDef {
  id: string;
  kind: ShopKind;
  /** Shown on the signboard. */
  sign: string;
  signLocal: string;
  x: number;
  z: number;
  rot: number;
  width: number;
  depth: number;
  paint: PaintId;
}

export type WallKind = 'compound' | 'garden' | 'temple' | 'field';

export interface WallDef {
  id: string;
  kind: WallKind;
  /** A polyline; consecutive points form segments. Gaps are separate walls. */
  points: P2[];
  height: number;
  thickness: number;
}

export type FenceKind = 'bamboo' | 'hedge';

export interface FenceDef {
  id: string;
  kind: FenceKind;
  points: P2[];
}

export type TreeKind = 'banyan' | 'peepal' | 'neem' | 'mango' | 'coconut' | 'banana';

export interface TreeDef {
  kind: TreeKind;
  x: number;
  z: number;
  scale: number;
  /** Deterministic variation seed. */
  seed: number;
}

export type AreaKind =
  | 'home'
  | 'square'
  | 'temple'
  | 'garden'
  | 'farm'
  | 'orchard'
  | 'grove'
  | 'kirana'
  | 'sweets'
  | 'pond'
  | 'lanes';

export interface AreaDef {
  id: string;
  kind: AreaKind;
  /** Shown when the player walks in. */
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  rot?: number;
  /** Open ground with no cover: moonlight here is dangerous. */
  open?: boolean;
}

/** Matches GAME_DESIGN.md §6 ItemId. */
export type OfferingItem = 'modak' | 'durva' | 'hibiscus' | 'coconut' | 'diya' | 'kumkum' | 'banana-leaf' | 'marigold' | 'incense';

/**
 * Level-design intent for an offering spot. Every tag is a *claim* that level.test.ts checks
 * against real path distances, so the layout cannot drift from the design without a red test.
 */
export type OfferingTag = 'near-temple' | 'far-from-temple' | 'near-shelter' | 'risky';

export interface OfferingSpotDef {
  id: string;
  item: OfferingItem;
  x: number;
  z: number;
  /** Surface height the prop sits on (stall, basket, ground). */
  y: number;
  tags: OfferingTag[];
}

export type LandmarkKind =
  | 'pandal'
  | 'banyan-platform'
  | 'well'
  | 'pond'
  | 'deepastambha'
  | 'cart'
  | 'haystack'
  | 'tulsi'
  | 'handpump'
  | 'shrine'
  | 'flower-stall'
  | 'potter'
  | 'fruit-stall'
  | 'puja-stall'
  | 'scarecrow';

export interface LandmarkDef {
  id: string;
  kind: LandmarkKind;
  x: number;
  z: number;
  rot: number;
}

/** What a villager is doing: a pose held while they prepare for the festival. */
export type VillagerPose = 'stand' | 'talk' | 'arms-up' | 'hold-up' | 'kneel' | 'sit-edge' | 'sit-stool' | 'light-lamp';

export interface VillagerDef {
  id: string;
  /** What they are doing, for the pose and for anyone reading the layout. */
  task: string;
  pose: VillagerPose;
  x: number;
  z: number;
  /** Height of the surface they stand or sit on. */
  y: number;
  /** Facing, radians (0 = +z). */
  rot: number;
  /** Clothing colour variant. */
  outfit: number;
  /** 1 = the player's build; adults a little taller. */
  scale: number;
  /** Elders go grey. */
  grey?: boolean;
  /** Behind a counter or on a stage already blocked by something else: no collider of its own. */
  noCollider?: boolean;
}

export interface FieldDef {
  id: string;
  crop: 'millet' | 'sugarcane' | 'vegetable';
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
}

export interface TempleDef {
  /** Centre of the courtyard. */
  x: number;
  z: number;
  /** Courtyard wall extents. */
  courtW: number;
  courtD: number;
  /** Stone platform (jagati) under mandapa and sanctum. */
  platformW: number;
  platformD: number;
  platformH: number;
  /** Where the player offers — in the mandapa, facing the sanctum. */
  offerX: number;
  offerZ: number;
}

export interface VillageLayout {
  /** Playable extent; beyond it the terrain rises and invisible walls stop the player. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawn: P2;
  spawnYaw: number;
  roads: RoadDef[];
  houses: HouseDef[];
  shops: ShopDef[];
  walls: WallDef[];
  fences: FenceDef[];
  trees: TreeDef[];
  areas: AreaDef[];
  offerings: OfferingSpotDef[];
  landmarks: LandmarkDef[];
  fields: FieldDef[];
  villagers: VillagerDef[];
  temple: TempleDef;
  /** Diagonal walls that cut the rectangle's corners, making the playable space an octagon. */
  edgeCuts: { a: P2; b: P2 }[];
}
