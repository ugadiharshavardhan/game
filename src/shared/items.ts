/**
 * The seven puja offerings — shared by the engine (pickups, inventory, temple) and React (the bag,
 * prompts, the puja list). Plain data, no Three.js: the menu can import it for free.
 *
 * `required` is how many the puja asks for in all. Together they are more than one bag holds
 * (see INVENTORY_CAPACITY), so the temple always takes at least two trips — a route to plan
 * around the moon, not a shopping list.
 */
export const ITEM_IDS = ['flowers', 'durva', 'coconut', 'bananas', 'rice', 'diya', 'modak'] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export interface ItemDef {
  id: ItemId;
  /** As shown on a slot and in prompts: "Flowers". */
  name: string;
  /** One respectful line for the bag's detail view. */
  description: string;
  /** How many the puja needs. */
  required: number;
  /** Fallback icon until the engine has rendered the 3D one. */
  glyph: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  flowers: {
    id: 'flowers',
    name: 'Flowers',
    description: 'Marigolds and red hibiscus — the red jaswand is Bappa’s favourite flower.',
    required: 5,
    glyph: '🌺',
  },
  durva: {
    id: 'durva',
    name: 'Durva grass',
    description: 'Three-bladed durva, tied in bundles of twenty-one. No Ganesh puja is complete without it.',
    required: 3,
    glyph: '🌿',
  },
  coconut: {
    id: 'coconut',
    name: 'Coconut',
    description: 'A whole coconut, the purest of offerings, to be broken before the god.',
    required: 1,
    glyph: '🥥',
  },
  bananas: {
    id: 'bananas',
    name: 'Bananas',
    description: 'Ripe bananas for the naivedya, the food offered to Bappa.',
    required: 4,
    glyph: '🍌',
  },
  rice: {
    id: 'rice',
    name: 'Rice',
    description: 'Akshata — unbroken rice mixed with kumkum, scattered in blessing.',
    required: 2,
    glyph: '🍚',
  },
  diya: {
    id: 'diya',
    name: 'Diyas',
    description: 'Clay lamps for the aarti, five flames for the five elements.',
    required: 5,
    glyph: '🪔',
  },
  modak: {
    id: 'modak',
    name: 'Modaks',
    description: 'Ukadiche modak, steamed and filled with coconut and jaggery — Bappa’s favourite sweet.',
    required: 5,
    glyph: '🍬',
  },
};

/** Items the bag holds when a run starts. */
export const INVENTORY_CAPACITY = 15;

/** One stack in the bag. */
export interface InventoryStack {
  id: ItemId;
  quantity: number;
}

/** What React renders for the bag and the puja list. */
export interface InventorySnapshot {
  capacity: number;
  used: number;
  /** In pickup order; one stack per item kind. */
  stacks: InventoryStack[];
  /** Already placed before Bappa at the temple. */
  offered: Record<ItemId, number>;
  pujaComplete: boolean;
}

/** How many more of `id` the puja still needs, after what has been offered. */
export function stillNeeded(id: ItemId, offered: Partial<Record<ItemId, number>>): number {
  return Math.max(ITEMS[id].required - (offered[id] ?? 0), 0);
}

export const TOTAL_REQUIRED = ITEM_IDS.reduce((n, id) => n + ITEMS[id].required, 0);

/** "3 Flowers, 4 Bananas and 1 Coconut". */
export function describeStacks(stacks: readonly InventoryStack[]): string {
  const parts = stacks.map((s) => `${s.quantity} ${ITEMS[s.id].name}`);
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
