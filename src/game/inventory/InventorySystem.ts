/**
 * The offerings bag. Owned by the engine for the whole run, independent of the player's body: going
 * indoors, coming out, the moon, a failure — none of them rebuild or clear it.
 *
 * Rules:
 *   - identical items stack; the bag holds `capacity` items in all (15 to start)
 *   - a pickup takes what fits and leaves the rest where it lies — never over capacity
 *   - nothing is taken beyond what the puja still needs (carried + offered ≤ required)
 *   - at the temple, everything the puja still needs moves from the bag to the altar
 *   - a failure under the moon drops half the bag (rounded down) — never all of it
 */
import { INVENTORY_CAPACITY, ITEM_IDS, ITEMS, type InventorySnapshot, type InventoryStack, type ItemId, stillNeeded } from '../../shared/items';
import { InventoryItem } from './InventoryItem';

export type InventoryListener = (snapshot: InventorySnapshot) => void;

export class InventorySystem {
  private cap: number;
  private readonly stacks: InventoryItem[] = [];
  private readonly offeredCount = Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<ItemId, number>;
  private readonly listeners = new Set<InventoryListener>();

  constructor(capacity = INVENTORY_CAPACITY) {
    this.cap = capacity;
  }

  get capacity(): number {
    return this.cap;
  }

  /** Items carried, across all stacks. */
  get used(): number {
    return this.stacks.reduce((n, s) => n + s.quantity, 0);
  }

  get free(): number {
    return this.cap - this.used;
  }

  get items(): readonly InventoryItem[] {
    return this.stacks;
  }

  get pujaComplete(): boolean {
    return ITEM_IDS.every((id) => this.offeredCount[id] >= ITEMS[id].required);
  }

  count(id: ItemId): number {
    return this.stacks.find((s) => s.id === id)?.quantity ?? 0;
  }

  offered(id: ItemId): number {
    return this.offeredCount[id];
  }

  /** How many more of `id` are worth carrying: what the puja still needs, less what's in the bag. */
  wanted(id: ItemId): number {
    return Math.max(stillNeeded(id, this.offeredCount) - this.count(id), 0);
  }

  /** How many of `quantity` would go in right now (bag space and the puja's need both apply). */
  acceptable(id: ItemId, quantity: number): number {
    return Math.max(Math.min(quantity, this.free, this.wanted(id)), 0);
  }

  /** Adds what fits; returns how many went in. */
  add(id: ItemId, quantity: number): number {
    const n = this.acceptable(id, quantity);
    if (n <= 0) return 0;
    const stack = this.stacks.find((s) => s.id === id);
    if (stack) stack.quantity += n;
    else this.stacks.push(new InventoryItem(id, n));
    this.changed();
    return n;
  }

  /** Takes up to `quantity` out; returns how many came out. */
  remove(id: ItemId, quantity: number): number {
    const i = this.stacks.findIndex((s) => s.id === id);
    if (i < 0 || quantity <= 0) return 0;
    const n = Math.min(quantity, this.stacks[i].quantity);
    this.stacks[i].quantity -= n;
    if (this.stacks[i].quantity === 0) this.stacks.splice(i, 1);
    this.changed();
    return n;
  }

  /** A bigger bag (never smaller than what's already in it). */
  setCapacity(capacity: number): void {
    this.cap = Math.max(Math.floor(capacity), this.used);
    this.changed();
  }

  /**
   * Places everything the puja still needs before Bappa. Returns what moved (possibly nothing —
   * then the bag held nothing useful).
   */
  offerAtTemple(): InventoryStack[] {
    const moved: InventoryStack[] = [];
    for (const s of [...this.stacks]) {
      const n = Math.min(s.quantity, stillNeeded(s.id, this.offeredCount));
      if (n <= 0) continue;
      s.quantity -= n;
      this.offeredCount[s.id] += n;
      moved.push({ id: s.id, quantity: n });
    }
    for (let i = this.stacks.length - 1; i >= 0; i--) if (this.stacks[i].quantity === 0) this.stacks.splice(i, 1);
    if (moved.length) this.changed();
    return moved;
  }

  /**
   * The moon overwhelmed the player: a few offerings fall where they stand, one at a time from the
   * fullest stack — so it costs a little of everything, never one whole kind, never more than half
   * the bag, and never a lone carried item. Returns what fell, to be left in the world.
   */
  dropForFailure(limit = 3): InventoryStack[] {
    let toDrop = Math.min(Math.floor(this.used / 2), Math.max(Math.floor(limit), 0));
    if (toDrop <= 0) return [];
    const dropped = new Map<ItemId, number>();
    while (toDrop > 0) {
      const fullest = this.stacks.reduce((a, b) => (b.quantity > a.quantity ? b : a));
      fullest.quantity--;
      dropped.set(fullest.id, (dropped.get(fullest.id) ?? 0) + 1);
      if (fullest.quantity === 0) this.stacks.splice(this.stacks.indexOf(fullest), 1);
      toDrop--;
    }
    this.changed();
    return [...dropped].map(([id, quantity]) => ({ id, quantity }));
  }

  snapshot(): InventorySnapshot {
    return {
      capacity: this.cap,
      used: this.used,
      stacks: this.stacks.map((s) => ({ id: s.id, quantity: s.quantity })),
      offered: { ...this.offeredCount },
      pujaComplete: this.pujaComplete,
    };
  }

  onChange(listener: InventoryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }
}
