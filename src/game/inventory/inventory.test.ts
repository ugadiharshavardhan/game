import { describe, expect, it } from 'vitest';
import { INVENTORY_CAPACITY, ITEM_IDS, ITEMS, TOTAL_REQUIRED } from '../../shared/items';
import { InventorySystem } from './InventorySystem';

describe('InventorySystem', () => {
  it('starts empty with a capacity of 15', () => {
    const inv = new InventorySystem();
    expect(inv.capacity).toBe(15);
    expect(INVENTORY_CAPACITY).toBe(15);
    expect(inv.used).toBe(0);
    expect(inv.items).toHaveLength(0);
  });

  it('stacks identical items into one slot', () => {
    const inv = new InventorySystem();
    inv.add('flowers', 2);
    inv.add('bananas', 3);
    inv.add('flowers', 1);
    expect(inv.items.map((s) => [s.id, s.quantity])).toEqual([
      ['flowers', 3],
      ['bananas', 3],
    ]);
    expect(inv.used).toBe(6);
  });

  it('holds the example load from the brief', () => {
    const inv = new InventorySystem();
    expect(inv.add('flowers', 3)).toBe(3);
    expect(inv.add('durva', 2)).toBe(2);
    expect(inv.add('coconut', 1)).toBe(1);
    expect(inv.add('bananas', 4)).toBe(4);
    expect(inv.used).toBe(10);
    expect(inv.free).toBe(5);
  });

  it('never goes over capacity: a pickup takes what fits', () => {
    const inv = new InventorySystem(5);
    expect(inv.add('diya', 4)).toBe(4);
    expect(inv.add('modak', 4)).toBe(1);
    expect(inv.used).toBe(5);
    expect(inv.add('rice', 1)).toBe(0);
    expect(inv.used).toBe(5);
  });

  it('never takes more than the puja still needs', () => {
    const inv = new InventorySystem();
    expect(inv.add('coconut', 3)).toBe(ITEMS.coconut.required);
    expect(inv.wanted('coconut')).toBe(0);
    expect(inv.acceptable('coconut', 1)).toBe(0);
  });

  it('removes, and empties a slot at zero', () => {
    const inv = new InventorySystem();
    inv.add('rice', 2);
    expect(inv.remove('rice', 5)).toBe(2);
    expect(inv.items).toHaveLength(0);
    expect(inv.remove('rice', 1)).toBe(0);
  });

  it('can grow but never shrink below what it holds', () => {
    const inv = new InventorySystem();
    inv.add('diya', 5);
    inv.add('modak', 5);
    inv.setCapacity(4);
    expect(inv.capacity).toBe(10);
    inv.setCapacity(20);
    expect(inv.capacity).toBe(20);
  });

  it('offers only what the puja still needs, and remembers it', () => {
    const inv = new InventorySystem();
    inv.add('flowers', 3);
    inv.add('bananas', 4);
    expect(inv.offerAtTemple()).toEqual([
      { id: 'flowers', quantity: 3 },
      { id: 'bananas', quantity: 4 },
    ]);
    expect(inv.used).toBe(0);
    expect(inv.offered('flowers')).toBe(3);
    // Two more flowers complete the flowers; a third would be one too many.
    expect(inv.add('flowers', 3)).toBe(2);
    expect(inv.offerAtTemple()).toEqual([{ id: 'flowers', quantity: 2 }]);
    expect(inv.offerAtTemple()).toEqual([]);
  });

  it('the whole puja takes more than one bag: at least two trips', () => {
    expect(TOTAL_REQUIRED).toBeGreaterThan(INVENTORY_CAPACITY);
    const inv = new InventorySystem();
    let trips = 0;
    while (!inv.pujaComplete) {
      for (const id of ITEM_IDS) inv.add(id, 99);
      inv.offerAtTemple();
      trips++;
      expect(trips).toBeLessThan(5);
    }
    expect(trips).toBe(2);
  });

  describe('a failure under the moon', () => {
    it('drops half the bag, rounded down — never all of it', () => {
      const inv = new InventorySystem();
      inv.add('flowers', 3);
      inv.add('durva', 2);
      inv.add('coconut', 1);
      inv.add('bananas', 4);
      const dropped = inv.dropForFailure();
      expect(dropped.reduce((n, s) => n + s.quantity, 0)).toBe(5);
      expect(inv.used).toBe(5);
    });

    it('takes from the fullest stacks first, a little of everything', () => {
      const inv = new InventorySystem();
      inv.add('diya', 5);
      inv.add('modak', 5);
      const dropped = new Map(inv.dropForFailure().map((s) => [s.id, s.quantity]));
      expect(dropped.get('diya')).toBeGreaterThanOrEqual(2);
      expect(dropped.get('modak')).toBeGreaterThanOrEqual(2);
      expect(inv.count('diya') + inv.count('modak')).toBe(5);
    });

    it('a single carried item is never lost', () => {
      const inv = new InventorySystem();
      inv.add('coconut', 1);
      expect(inv.dropForFailure()).toEqual([]);
      expect(inv.count('coconut')).toBe(1);
    });

    it('never touches what is already offered at the temple', () => {
      const inv = new InventorySystem();
      inv.add('modak', 5);
      inv.offerAtTemple();
      inv.add('diya', 4);
      inv.dropForFailure();
      expect(inv.offered('modak')).toBe(5);
    });
  });

  it('tells listeners about every change, with a plain snapshot', () => {
    const inv = new InventorySystem();
    const seen: number[] = [];
    const off = inv.onChange((s) => seen.push(s.used));
    inv.add('rice', 1);
    inv.add('rice', 1);
    inv.remove('rice', 1);
    off();
    inv.add('rice', 1);
    expect(seen).toEqual([1, 2, 1]);
    expect(JSON.parse(JSON.stringify(inv.snapshot())).stacks).toEqual([{ id: 'rice', quantity: 2 }]);
  });
});
