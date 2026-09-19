/**
 * Moonlight Seva — the village.
 *
 * Shape: a main road runs north from the player's home (south) through the festival ground to the
 * Ganesh temple (north). Two cross lanes and a ring road around the edge give every trip at least
 * two routes. Cover is uneven on purpose: the home streets are dense with houses; the festival
 * ground, the fields, the coconut grove and the orchard are open and risky.
 *
 *                         N (−z)
 *        pond   sweets   TEMPLE   banana    orchard
 *      garden            │
 *      ────── lane B ────┼──── lane B ──────  (ring)
 *        houses       FESTIVAL GROUND   houses
 *      ────── lane A ────┼──── lane A ──────
 *  fields   houses    kirana │   houses     coconut grove
 *      ────── south lane ─ HOME ─ south lane ─
 *                         S (+z)
 */
import type { VillageLayout } from './types';

const PI = Math.PI;
const EAST = PI / 2;
const WEST = -PI / 2;
const NORTH = PI;
const SOUTH = 0;

export const VILLAGE: VillageLayout = {
  // The temple's back wall is the village's northern edge: behind it the land rises.
  bounds: { minX: -62, maxX: 62, minZ: -60.6, maxZ: 60 },

  // Just out of home's front yard, facing up the main road toward the temple's spire (far enough
  // out that the camera starts clear of the veranda roof).
  spawn: { x: 0, z: 43.6 },
  spawnYaw: NORTH,

  roads: [
    {
      id: 'main',
      kind: 'main',
      width: 6,
      points: [
        { x: 0, z: 46.4 },
        { x: 1.5, z: 36 },
        { x: -0.5, z: 24 },
        { x: 0, z: 14 },
        { x: 0, z: -6 },
        { x: 1.5, z: -18 },
        { x: 0, z: -28 },
        { x: 0, z: -35 },
      ],
    },
    // Cross lanes.
    { id: 'lane-a-west', kind: 'lane', width: 3.6, points: [{ x: -2, z: 24 }, { x: -15, z: 24.3 }, { x: -30, z: 23 }, { x: -44.5, z: 22 }] },
    { id: 'lane-a-east', kind: 'lane', width: 3.6, points: [{ x: 2, z: 24 }, { x: 15, z: 23.5 }, { x: 30, z: 23 }, { x: 45, z: 22 }] },
    { id: 'lane-b-west', kind: 'lane', width: 3.6, points: [{ x: -2, z: -10 }, { x: -15, z: -10.5 }, { x: -30, z: -10 }, { x: -43, z: -10 }] },
    { id: 'lane-b-east', kind: 'lane', width: 3.6, points: [{ x: 2, z: -10 }, { x: 15, z: -9.5 }, { x: 30, z: -10 }, { x: 43, z: -10 }] },
    // South lanes out of home, and the ring road that closes the loop to the temple's side gates.
    { id: 'south-west', kind: 'lane', width: 3.6, points: [{ x: -3, z: 43.5 }, { x: -16, z: 42.5 }, { x: -30, z: 39 }, { x: -42, z: 31 }] },
    { id: 'south-east', kind: 'lane', width: 3.6, points: [{ x: 3, z: 43.5 }, { x: 16, z: 42.5 }, { x: 30, z: 39 }, { x: 42, z: 30 }] },
    {
      id: 'ring-west',
      kind: 'lane',
      width: 3.6,
      points: [
        { x: -42, z: 31 },
        { x: -45, z: 18 },
        { x: -44.5, z: 4 },
        { x: -43, z: -10 },
        { x: -49, z: -15 },
        { x: -50, z: -24 },
        { x: -46, z: -36 },
        { x: -38, z: -42 },
        { x: -28, z: -45.5 },
        { x: -15, z: -45.5 },
      ],
    },
    {
      id: 'ring-east',
      kind: 'lane',
      width: 3.6,
      points: [
        { x: 42, z: 30 },
        { x: 45, z: 18 },
        { x: 45, z: 4 },
        { x: 43, z: -10 },
        { x: 40, z: -24 },
        { x: 32, z: -38 },
        { x: 22, z: -45.5 },
        { x: 15, z: -45.5 },
      ],
    },
    // Footpaths.
    { id: 'path-garden', kind: 'path', width: 2, points: [{ x: -30.8, z: -11.5 }, { x: -31, z: -20.25 }, { x: -33, z: -20.25 }] },
    { id: 'path-pond', kind: 'path', width: 2, points: [{ x: -2.5, z: -22.5 }, { x: -13, z: -24.6 }, { x: -15.5, z: -32 }, { x: -17, z: -37 }, { x: -26, z: -41 }] },
    { id: 'path-banana', kind: 'path', width: 2, points: [{ x: 18, z: -10 }, { x: 20, z: -27 }, { x: 24, z: -28 }] },
    { id: 'path-farm', kind: 'path', width: 2, points: [{ x: -44.5, z: 22 }, { x: -50, z: 22 }, { x: -55, z: 22 }] },
    { id: 'path-grove', kind: 'path', width: 2, points: [{ x: 45, z: 12 }, { x: 52, z: 12 }, { x: 56, z: 20 }] },
  ],

  houses: [
    { id: 'home', family: 'your family', x: 0, z: 53, rot: NORTH, width: 9, depth: 6, storeys: 1, roof: 'hip', paint: 'limewhite', shelter: true, start: true },
    { id: 'patil', family: 'the Patils', x: -19, z: 32, rot: NORTH, width: 8, depth: 6, storeys: 1, roof: 'gable', paint: 'indigo', shelter: true },
    { id: 'kulkarni', family: 'the Kulkarnis', x: 12, z: 33, rot: WEST, width: 8, depth: 6, storeys: 2, roof: 'flat', paint: 'ochre', shelter: true, balcony: true },
    { id: 'deshmukh', family: 'the Deshmukhs', x: -17, z: 15, rot: SOUTH, width: 8, depth: 6, storeys: 1, roof: 'hip', paint: 'rose', shelter: true },
    { id: 'pawar', family: 'the Pawars', x: -29.5, z: 30.5, rot: NORTH, width: 8, depth: 6, storeys: 1, roof: 'gable', paint: 'sage', shelter: false },
    { id: 'jadhav', family: 'the Jadhavs', x: 26, z: 14, rot: SOUTH, width: 8, depth: 6, storeys: 1, roof: 'gable', paint: 'turquoise', shelter: true },
    { id: 'more', family: 'the Mores', x: 24, z: 32, rot: NORTH, width: 8, depth: 6, storeys: 1, roof: 'hip', paint: 'saffron', shelter: false },
    { id: 'gokhale', family: 'the Gokhales', x: -13, z: -19, rot: EAST, width: 8, depth: 6, storeys: 1, roof: 'gable', paint: 'limewhite', shelter: true },
    { id: 'bhosale', family: 'the Bhosales', x: 13, z: -21, rot: WEST, width: 8, depth: 6, storeys: 2, roof: 'flat', paint: 'rose', shelter: true, balcony: true },
    { id: 'shinde', family: 'the Shindes', x: -23, z: -19, rot: WEST, width: 8, depth: 6, storeys: 1, roof: 'hip', paint: 'ochre', shelter: true },
    { id: 'naik', family: 'the Naiks', x: 27, z: -18, rot: NORTH, width: 8, depth: 6, storeys: 1, roof: 'gable', paint: 'indigo', shelter: true },
    { id: 'mane', family: 'the Manes', x: -26, z: -1.5, rot: NORTH, width: 8, depth: 6, storeys: 1, roof: 'gable', paint: 'turquoise', shelter: false },
    // The farmer's hut: rough shelter at the far edge of the fields.
    { id: 'farm-hut', kind: 'hut', family: 'the farmhands', x: -53, z: 47, rot: EAST, width: 4, depth: 3.4, storeys: 1, roof: 'thatch', paint: 'ochre', shelter: true },
  ],

  shops: [
    { id: 'kirana', kind: 'kirana', sign: 'Ganesh Kirana Stores', signLocal: 'गणेश किराणा', x: -9, z: 30, rot: EAST, width: 6, depth: 5, paint: 'saffron' },
    { id: 'sweets', kind: 'sweets', sign: 'Laxmi Mithai', signLocal: 'लक्ष्मी मिठाई', x: -9, z: -30, rot: EAST, width: 7, depth: 5, paint: 'rose' },
  ],

  walls: [
    // Temple courtyard: south gate on the main road, side gates for the ring road.
    { id: 'temple-s-w', kind: 'temple', height: 1.6, thickness: 0.5, points: [{ x: -15, z: -38 }, { x: -2.6, z: -38 }] },
    { id: 'temple-s-e', kind: 'temple', height: 1.6, thickness: 0.5, points: [{ x: 2.6, z: -38 }, { x: 15, z: -38 }] },
    { id: 'temple-e-s', kind: 'temple', height: 1.6, thickness: 0.5, points: [{ x: 15, z: -38 }, { x: 15, z: -43.8 }] },
    { id: 'temple-e-n', kind: 'temple', height: 1.6, thickness: 0.5, points: [{ x: 15, z: -47.2 }, { x: 15, z: -60 }, { x: -15, z: -60 }, { x: -15, z: -47.2 }] },
    { id: 'temple-w-s', kind: 'temple', height: 1.6, thickness: 0.5, points: [{ x: -15, z: -43.8 }, { x: -15, z: -38 }] },
    // Home compound, open to the road.
    { id: 'home-wall', kind: 'compound', height: 1.3, thickness: 0.3, points: [{ x: -7, z: 48.5 }, { x: -7, z: 57.5 }, { x: 7, z: 57.5 }, { x: 7, z: 48.5 }] },
    // Tulsi garden, gate on the east side facing the Shindes' door.
    { id: 'garden-a', kind: 'garden', height: 1.2, thickness: 0.35, points: [{ x: -33, z: -18.5 }, { x: -33, z: -15 }, { x: -45, z: -15 }, { x: -45, z: -29 }, { x: -33, z: -29 }, { x: -33, z: -22 }] },
  ],

  fences: [
    { id: 'field-1', kind: 'bamboo', points: [{ x: -47.5, z: 5 }, { x: -47.5, z: 13 }] },
    { id: 'field-1b', kind: 'bamboo', points: [{ x: -47.5, z: 16 }, { x: -47.5, z: 20 }] },
    { id: 'field-2', kind: 'bamboo', points: [{ x: -47.5, z: 24 }, { x: -47.5, z: 29.5 }] },
    { id: 'orchard-hedge', kind: 'hedge', points: [{ x: 47.5, z: -36 }, { x: 47.5, z: -27 }] },
    { id: 'orchard-hedge-b', kind: 'hedge', points: [{ x: 47.5, z: -21 }, { x: 47.5, z: -13 }] },
    { id: 'lane-hedge', kind: 'hedge', points: [{ x: -36, z: 17 }, { x: -24, z: 17.5 }] },
    { id: 'lane-hedge-e', kind: 'hedge', points: [{ x: 33, z: 4 }, { x: 33, z: 10 }] },
  ],

  trees: [
    // Landmarks.
    { kind: 'banyan', x: -9, z: 8, scale: 1, seed: 1 },
    { kind: 'peepal', x: -10, z: -55, scale: 1, seed: 2 },
    // Neem and mango along the lanes — shade, and landmarks for route-finding.
    { kind: 'neem', x: -8, z: 42, scale: 0.9, seed: 3 },
    { kind: 'neem', x: 9, z: 41.5, scale: 1, seed: 4 },
    { kind: 'mango', x: -36, z: 36.5, scale: 1, seed: 5 },
    { kind: 'neem', x: 35, z: 33, scale: 1.05, seed: 6 },
    { kind: 'neem', x: -24, z: 21, scale: 0.85, seed: 7 },
    { kind: 'mango', x: 8, z: 18, scale: 0.9, seed: 8 },
    { kind: 'neem', x: 20, z: 6, scale: 1, seed: 9 },
    { kind: 'neem', x: -34, z: 6, scale: 1.1, seed: 10 },
    { kind: 'mango', x: -20, z: -6, scale: 0.95, seed: 11 },
    { kind: 'neem', x: 21, z: -14, scale: 0.9, seed: 12 },
    { kind: 'neem', x: -20, z: -13, scale: 0.85, seed: 13 },
    { kind: 'mango', x: 9, z: -31, scale: 1, seed: 14 },
    { kind: 'neem', x: 37, z: -3, scale: 1, seed: 15 },
    { kind: 'neem', x: -38, z: -40, scale: 1.1, seed: 16 },
    { kind: 'neem', x: 30, z: -44, scale: 1, seed: 17 },
    { kind: 'coconut', x: 8, z: 49, scale: 1, seed: 18 },
    { kind: 'coconut', x: -9, z: 48, scale: 0.95, seed: 19 },
    // Mango orchard (north-east).
    ...[-33, -27, -21, -15].flatMap((z, row) =>
      [50, 55.5].map((x, col) => ({ kind: 'mango' as const, x: x + (row % 2) * 1.5, z, scale: 0.85 + ((row + col) % 3) * 0.08, seed: 20 + row * 2 + col })),
    ),
    // Banana plantation beside the Naiks.
    ...[-27.5, -31, -34.5].flatMap((z, row) =>
      [22, 25, 28, 31].map((x, col) => ({ kind: 'banana' as const, x: x + (row % 2) * 1.2, z, scale: 0.9 + ((row * 3 + col) % 4) * 0.06, seed: 40 + row * 4 + col })),
    ),
    // Coconut grove (south-east).
    ...[4, 11, 18, 25, 32].flatMap((z, row) =>
      [49.5, 55, 59].map((x, col) => ({ kind: 'coconut' as const, x: x + ((row + col) % 2) * 1.4 - 0.7, z, scale: 0.9 + ((row + col) % 3) * 0.1, seed: 60 + row * 3 + col })),
    ).filter((t) => !(Math.abs(t.x - 52) < 2.6 && Math.abs(t.z - 12) < 2.5) && !(Math.abs(t.x - 54) < 3 && Math.abs(t.z - 18.5) < 3)),
    // Garden.
    { kind: 'banana', x: -43, z: -27, scale: 0.8, seed: 80 },
    { kind: 'mango', x: -42.5, z: -17.5, scale: 0.8, seed: 81 },
  ],

  areas: [
    { id: 'home', kind: 'home', name: 'Home', x: 0, z: 52, w: 14, d: 12 },
    { id: 'square', kind: 'square', name: 'Festival Ground', x: -1, z: 4, w: 28, d: 19, open: true },
    { id: 'temple', kind: 'temple', name: 'Shri Ganesh Mandir', x: 0, z: -49, w: 30, d: 22 },
    { id: 'garden', kind: 'garden', name: 'Tulsi Garden', x: -39, z: -22, w: 12, d: 14 },
    { id: 'farm', kind: 'farm', name: 'The Fields', x: -54, z: 26, w: 14, d: 46, open: true },
    { id: 'orchard', kind: 'orchard', name: 'Mango Orchard', x: 54, z: -24, w: 14, d: 24, open: true },
    { id: 'bananas', kind: 'orchard', name: 'Banana Grove', x: 26.5, z: -30.5, w: 12, d: 10 },
    { id: 'grove', kind: 'grove', name: 'Coconut Grove', x: 54, z: 19, w: 14, d: 34, open: true },
    { id: 'kirana', kind: 'kirana', name: 'Ganesh Kirana Stores', x: -7, z: 30, w: 9, d: 8 },
    { id: 'sweets', kind: 'sweets', name: 'Laxmi Mithai', x: -7, z: -30, w: 9, d: 9 },
    { id: 'pond', kind: 'pond', name: 'Village Tank', x: -22, z: -30, w: 13, d: 10, open: true },
  ],

  // The puja items, where they'd naturally be: flowers in gardens and at the flower stall, durva on
  // the grassy banks and field edges, coconuts under palms and at the puja stall, bananas at the fruit
  // stall and the grove, rice at the kirana, diyas at the potter's and on doorsteps, modaks at the
  // sweet shop. Tags are measured claims (level.test.ts): near/far from the temple, near a shelter
  // or out on risky open ground.
  offerings: [
    { id: 'flowers-garden', item: 'flowers', quantity: 3, x: -36, z: -25.5, y: 0, surface: 'ground', rot: WEST, tags: ['near-shelter'] },
    { id: 'flowers-stall', item: 'flowers', quantity: 3, x: -5.4, z: -1.25, y: 0.8, surface: 'stall', rot: SOUTH, tags: ['risky'] },
    { id: 'flowers-home', item: 'flowers', quantity: 2, x: -5.6, z: 45.8, y: 0, surface: 'ground', rot: NORTH, tags: ['far-from-temple', 'near-shelter'] },
    { id: 'durva-tank', item: 'durva', quantity: 1, x: -22, z: -35.2, y: 0, surface: 'ground', rot: SOUTH, tags: ['near-temple', 'risky'] },
    { id: 'durva-field', item: 'durva', quantity: 2, x: -56.5, z: 21.5, y: 0, surface: 'ground', rot: EAST, tags: ['far-from-temple', 'risky'] },
    { id: 'durva-veg', item: 'durva', quantity: 1, x: -30.5, z: 45.5, y: 0, surface: 'ground', rot: NORTH, tags: ['far-from-temple', 'risky'] },
    { id: 'coconut-grove', item: 'coconut', quantity: 1, x: 56, z: 28, y: 0, surface: 'ground', rot: WEST, tags: ['far-from-temple', 'risky'] },
    { id: 'coconut-home', item: 'coconut', quantity: 1, x: 6, z: 46, y: 0, surface: 'ground', rot: NORTH, tags: ['far-from-temple', 'near-shelter'] },
    { id: 'coconut-stall', item: 'coconut', quantity: 1, x: -5.8, z: -35.2, y: 0.85, surface: 'stall', rot: EAST, tags: ['near-temple'] },
    { id: 'bananas-stall', item: 'bananas', quantity: 4, x: 37.6, z: -13.6, y: 0.9, surface: 'stall', rot: SOUTH, tags: ['risky'] },
    { id: 'bananas-grove', item: 'bananas', quantity: 2, x: 25, z: -26.2, y: 0, surface: 'ground', rot: SOUTH, tags: ['near-shelter'] },
    { id: 'rice-kirana', item: 'rice', quantity: 3, x: -6.15, z: 31, y: 0.92, surface: 'counter', rot: EAST, tags: ['far-from-temple', 'near-shelter'] },
    { id: 'modak-sweets', item: 'modak', quantity: 6, x: -6.15, z: -29.2, y: 0.92, surface: 'counter', rot: EAST, tags: ['near-temple', 'near-shelter'] },
    { id: 'diya-potter', item: 'diya', quantity: 3, x: 5.5, z: 11.6, y: 0, surface: 'ground', rot: SOUTH, tags: ['risky'] },
    { id: 'diya-jadhav', item: 'diya', quantity: 2, x: 27.7, z: 20.0, y: 0, surface: 'ground', rot: SOUTH, tags: ['far-from-temple', 'near-shelter'] },
    { id: 'diya-gokhale', item: 'diya', quantity: 2, x: -7.0, z: -17.3, y: 0, surface: 'ground', rot: EAST, tags: ['near-temple', 'near-shelter'] },
  ],

  landmarks: [
    { id: 'pandal', kind: 'pandal', x: 11.5, z: 5, rot: WEST },
    { id: 'banyan-platform', kind: 'banyan-platform', x: -9, z: 8, rot: 0 },
    { id: 'well', kind: 'well', x: -19, z: 7, rot: 0 },
    { id: 'garden-well', kind: 'well', x: -41, z: -24.5, rot: 0 },
    { id: 'tank', kind: 'pond', x: -22, z: -30, rot: 0 },
    { id: 'deepastambha', kind: 'deepastambha', x: -5, z: -41.4, rot: 0 },
    { id: 'mushak', kind: 'shrine', x: 0, z: -40.3, rot: NORTH },
    { id: 'garden-tulsi', kind: 'tulsi', x: -39, z: -22, rot: 0 },
    { id: 'home-tulsi', kind: 'tulsi', x: -4.4, z: 46.5, rot: 0 },
    { id: 'flower-stall', kind: 'flower-stall', x: -6, z: -1.2, rot: SOUTH },
    { id: 'potter', kind: 'potter', x: 5.5, z: 12.4, rot: NORTH },
    { id: 'fruit-stall', kind: 'fruit-stall', x: 37, z: -13.6, rot: SOUTH },
    { id: 'puja-stall', kind: 'puja-stall', x: -5.6, z: -35.6, rot: EAST },
    { id: 'cart', kind: 'cart', x: -40, z: 45, rot: 0.4 },
    { id: 'haystack', kind: 'haystack', x: -52, z: 21.8, rot: 0 },
    { id: 'haystack-2', kind: 'haystack', x: -44, z: 51, rot: 1 },
    { id: 'scarecrow', kind: 'scarecrow', x: -53, z: 33, rot: 0.3 },
    { id: 'handpump', kind: 'handpump', x: 17.5, z: 26.5, rot: 0 },
  ],

  fields: [
    { id: 'millet', crop: 'millet', x: -54, z: 12, w: 10, d: 14, rot: 0 },
    { id: 'sugarcane', crop: 'sugarcane', x: -54, z: 34, w: 10, d: 16, rot: 0 },
    { id: 'vegetables', crop: 'vegetable', x: -35, z: 50, w: 12, d: 7, rot: 0 },
  ],

  // People preparing for the puja. Where they stand in the open they have a collider (solids.ts).
  villagers: [
    { id: 'pandal-garland', task: 'hanging a marigold garland over the stage', pose: 'arms-up', x: 13.8, z: 6.2, y: 0.7, rot: WEST, outfit: 1, scale: 1.06, noCollider: true },
    { id: 'pandal-helper', task: 'handing up the next garland', pose: 'hold-up', x: 11.9, z: 3.4, y: 0, rot: EAST, outfit: 3, scale: 1.0, name: 'Raju', lines: ['The potter by the pandal has new diyas — take some for the aarti.', 'Out here on the festival ground there\'s no roof for miles. Don\'t let the moon catch you in the open.'] },
    { id: 'rangoli-boy', task: 'finishing the rangoli on the festival ground', pose: 'kneel', x: 3.1, z: 4.5, y: 0, rot: WEST, outfit: 2, scale: 0.9, name: 'Chintu', lines: ['Durva grows by the tank and along the field edges. Twenty-one blades to a bundle!', 'Don\'t step on my rangoli!'] },
    { id: 'mithai-seller', task: 'arranging modak on the trays', pose: 'stand', x: -7.35, z: -30.3, y: 0, rot: EAST, outfit: 4, scale: 1.08, noCollider: true, name: 'Ganpat-kaka', lines: ['Ukadiche modak, fresh from the steamer! Take them to Bappa — they\'re his favourite.', 'The puja wants five modaks. There are six on the tray, so one is for you.'] },
    { id: 'kirana-keeper', task: 'minding the kirana from his stool', pose: 'sit-stool', x: -7.4, z: 30.4, y: 0, rot: EAST, outfit: 0, scale: 1.08, noCollider: true, grey: true, name: 'Shankar-anna', lines: ['Rice for the akshata is on the counter. Take what the puja needs.', 'Coconuts? The puja stall by the temple has one, and there are more under the palms by your house and out in the grove.'] },
    { id: 'aajoba', task: 'watching the lane from the Deshmukhs\' veranda', pose: 'sit-edge', x: -14.6, z: 20.0, y: 0.45, rot: SOUTH, outfit: 4, scale: 1.04, grey: true, name: 'Aajoba', lines: ['When the sky goes blue and the lamps burn brighter, the moon is coming. Nobody should see the Chaturthi moon — get indoors.', 'Any open door is yours tonight. Look for the lamp by the doorway.', 'Your bag won\'t hold everything at once. Carry what you can, offer it, and come back.'] },
    { id: 'well-talk-a', task: 'talking by the well', pose: 'talk', x: -17.2, z: 8.3, y: 0, rot: -1.01, outfit: 3, scale: 1.07, name: 'Sadu', lines: ['Bananas? The fruit stall on the east lane, or the grove behind the Naiks\' house.', 'The clouds are thinning. That\'s how it starts.'] },
    { id: 'well-talk-b', task: 'listening, water pot on the ground', pose: 'stand', x: -18.8, z: 9.3, y: 0, rot: 2.13, outfit: 1, scale: 1.02, name: 'Vithoba', lines: ['Flowers are in the tulsi garden past the Shindes\', and at the flower stall on the festival ground.', 'My wife says the moon brings bad luck on Chaturthi. My mother said the same.'] },
    { id: 'lamp-lighter', task: 'lighting the diyas on the deepastambha', pose: 'light-lamp', x: -4.05, z: -40.55, y: 0, rot: -2.3, outfit: 0, scale: 1.05, name: 'Pujari-kaka', lines: ['The puja needs flowers, durva, a coconut, bananas, rice, diyas and modaks. Bring them to the mandapa.', 'Stand before Bappa and pray — it will steady you after the moonlight.'] },
  ],

  // Cut the rectangle's corners: beyond these the land rises into scrub and hills.
  edgeCuts: [
    { a: { x: -62, z: -38 }, b: { x: -15, z: -61 } },
    { a: { x: 15, z: -61 }, b: { x: 62, z: -38 } },
    { a: { x: -62, z: 50 }, b: { x: -52, z: 60 } },
    { a: { x: 40, z: 60 }, b: { x: 62, z: 38 } },
  ],

  temple: {
    x: 0,
    z: -49,
    courtW: 30,
    courtD: 22,
    platformW: 12,
    platformD: 14,
    platformH: 0.9,
    offerX: 0,
    offerZ: -49.2,
  },
};
