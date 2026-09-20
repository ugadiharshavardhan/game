/**
 * The village map's rules: which offerings the player knows about, and how well.
 *
 * Nothing is marked at the start. A spot becomes a faint *hint* when the villager who knows about
 * it has been talked to — a glow round a named house or shop and a sentence — and a clear *pin*
 * once the player has walked within sight of it. Picked-up offerings drop off the map; if the
 * moonlight takes the bag and the offerings are put back, they come back on it. A kind the puja
 * no longer needs is not shown at all.
 *
 * Pure: it reads positions and counts it is handed, and knows nothing of Three.js or React.
 */
import { ITEMS, type ItemId } from '../../shared/items';
import type { MapSpot } from '../../shared/map';
import type { VillageLayout } from '../world/village/types';

/** Close enough to see what is on a doorstep or a counter. */
export const SIGHT_RADIUS = 12;

/** Which spots each villager talks about. Anything not listed here is found by walking to it. */
export const HINTS: Record<string, readonly string[]> = {
  Raju: ['diya-potter'],
  Chintu: ['durva-tank', 'durva-field', 'durva-veg'],
  'Ganpat-kaka': ['modak-sweets'],
  'Shankar-anna': ['rice-kirana', 'coconut-stall', 'coconut-home', 'coconut-grove'],
  Sadu: ['bananas-stall', 'bananas-grove'],
  Vithoba: ['flowers-garden', 'flowers-stall'],
  Aajoba: ['flowers-home', 'diya-jadhav', 'diya-gokhale'],
  'Pujari-kaka': ['coconut-stall'],
};

/** An offering as the map sees it: where it is, and how much of it is still there. */
export interface MapSource {
  id: string;
  item: ItemId;
  x: number;
  z: number;
  left(): number;
}

const LANDMARK: Record<string, string> = {
  pandal: 'the pandal',
  'banyan-platform': 'the banyan tree',
  well: 'the well',
  'garden-well': 'the garden well',
  pond: 'the village tank',
  deepastambha: 'the lamp tower',
  shrine: 'the Mushak shrine',
  tulsi: 'the tulsi plant',
  'flower-stall': 'the flower stall',
  potter: 'the potter’s stall',
  'fruit-stall': 'the fruit stall',
  'puja-stall': 'the puja stall',
  cart: 'the bullock cart',
  haystack: 'the haystack',
  scarecrow: 'the scarecrow',
  handpump: 'the hand pump',
};

/** The eight winds, from the top of the map: north is −z, east is +x. */
const WINDS = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'] as const;

export function compass(x: number, z: number, cx = 0, cz = 0): string {
  const angle = Math.atan2(x - cx, -(z - cz));
  const sector = Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return WINDS[sector];
}

const NEAR = 14;

/** "South-west · near the Patils’ house": where a spot is, in words a person would use. */
export function describeSpot(x: number, z: number, layout: VillageLayout): string {
  const centre = Math.hypot(x, z) < 9 ? 'The middle of the village' : compass(x, z);
  let best: { label: string; d: number } | null = null;
  const consider = (label: string, cx: number, cz: number, reach = 0) => {
    const d = Math.max(Math.hypot(x - cx, z - cz) - reach, 0);
    if (d < NEAR && (!best || d < best.d)) best = { label, d };
  };
  for (const h of layout.houses) {
    const label = h.family === 'your family' ? 'your home' : h.kind === 'hut' ? 'the farm hut' : `${h.family}’ house`;
    consider(label, h.x, h.z, Math.max(h.width, h.depth) / 2);
  }
  for (const s of layout.shops) consider(s.sign, s.x, s.z, Math.max(s.width, s.depth) / 2);
  for (const l of layout.landmarks) if (LANDMARK[l.kind]) consider(LANDMARK[l.kind], l.x, l.z, 1);
  const found = best as { label: string; d: number } | null;
  if (found) return `${centre} · near ${found.label}`;
  const area = layout.areas.find((a) => Math.abs(x - a.x) <= a.w / 2 && Math.abs(z - a.z) <= a.d / 2);
  return area ? `${centre} · in ${area.name}` : centre;
}

export class MapSystem {
  private readonly sources: readonly MapSource[];
  private readonly hints = new Map<string, string>();
  private readonly hinted = new Set<string>();
  private readonly found = new Set<string>();
  private readonly stillNeeded: (item: ItemId) => boolean;
  private signature = '';

  constructor(sources: readonly MapSource[], layout: VillageLayout, stillNeeded: (item: ItemId) => boolean = () => true) {
    this.sources = sources;
    this.stillNeeded = stillNeeded;
    for (const s of sources) this.hints.set(s.id, describeSpot(s.x, s.z, layout));
  }

  /** A villager has said their piece: the spots they know about are now on the map as hints. */
  hear(speaker: string): void {
    for (const id of HINTS[speaker] ?? []) this.hinted.add(id);
  }

  /** The player's position: anything within sight becomes a pin. */
  see(x: number, z: number): void {
    for (const s of this.sources) if (Math.hypot(s.x - x, s.z - z) <= SIGHT_RADIUS) this.found.add(s.id);
  }

  spots(): MapSpot[] {
    const out: MapSpot[] = [];
    for (const s of this.sources) {
      const state = this.found.has(s.id) ? 'found' : this.hinted.has(s.id) ? 'hinted' : null;
      const quantity = s.left();
      if (!state || quantity <= 0 || !this.stillNeeded(s.item)) continue;
      out.push({ id: s.id, item: s.item, quantity, x: s.x, z: s.z, state, hint: this.hints.get(s.id) ?? '' });
    }
    return out;
  }

  /** The spots, but only when they are not what was last handed out — so nobody redraws for nothing. */
  changed(): MapSpot[] | null {
    const spots = this.spots();
    const signature = spots.map((s) => `${s.id}:${s.state}:${s.quantity}`).join('|');
    if (signature === this.signature) return null;
    this.signature = signature;
    return spots;
  }
}

/** What an item is called on a map label: "Flowers ×3". */
export function spotLabel(item: ItemId, quantity: number): string {
  return `${ITEMS[item].name} ×${quantity}`;
}
