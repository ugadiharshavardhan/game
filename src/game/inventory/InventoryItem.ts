/**
 * One stack in the bag: an item kind and how many of it. Identical items always share a stack.
 */
import { ITEMS, type ItemDef, type ItemId } from '../../shared/items';

/** Rendered 3D icons (image URLs), filled in once the art has loaded. Glyphs stand in until then. */
const icons = new Map<ItemId, string>();

export function setItemIcon(id: ItemId, url: string): void {
  icons.set(id, url);
}

export class InventoryItem {
  readonly id: ItemId;
  quantity: number;

  constructor(id: ItemId, quantity: number) {
    this.id = id;
    this.quantity = quantity;
  }

  get def(): ItemDef {
    return ITEMS[this.id];
  }

  get name(): string {
    return ITEMS[this.id].name;
  }

  /** The rendered icon if there is one, else the item's glyph. */
  get icon(): string {
    return icons.get(this.id) ?? ITEMS[this.id].glyph;
  }
}
