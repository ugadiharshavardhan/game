/**
 * A puja item waiting in the village: a basket of flowers at the garden bed, a hand of bananas on
 * the fruit stall, a tray of modaks on the sweet-shop counter. Reusable for every item kind — the
 * kind, the count and the placement come from the layout (OfferingSpotDef); the look comes from
 * whichever renderer drew it (a PujaItemVisual).
 *
 * Each has:
 *   - a model and material        its PujaItemVisual (the art pass, or a greybox marker)
 *   - a collider                  a small body on Layer.Item (rays find it; nobody trips over it)
 *   - a pickup point              where the hand reaches — the top of the arrangement
 *   - an interaction trigger      registered by the InteractionSystem from `interactRadius`
 *   - an idle animation and glow  the visual's `update` and `setHighlight`
 */
import type { Collider } from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { EventBus } from '../../shared/EventBus';
import { ITEMS, type ItemId } from '../../shared/items';
import type { SoundKey } from '../audio/SoundFx';
import { Layer, type Physics } from '../core/Physics';
import type { IInteractable, InteractionActor, PromptText } from '../interaction/IInteractable';
import type { InventorySystem } from '../inventory/InventorySystem';
import { InventoryItem } from '../inventory/InventoryItem';
import { PlayerAction } from '../player/CharacterAnimationController';
import type { OfferingSpotDef } from '../world/village/types';

/** What a renderer hands back for an item. */
export interface PujaItemVisual {
  /** Approach glow (0..1) and whether this item is the prompt's target. */
  setHighlight(approach: number, focused: boolean): void;
  /** Show `left` of the `total` the spot started with; 0 hides it. */
  setRemaining(left: number, total: number): void;
  /** Idle motion: petals in the breeze, a flame's flicker, steam off the modaks. */
  update(dt: number, time: number): void;
}

/** Material sound per item, layered under the pickup chime. */
const SOUND: Record<ItemId, SoundKey> = {
  flowers: 'rustle',
  durva: 'rustle',
  coconut: 'thunk',
  bananas: 'rustle',
  rice: 'grain',
  diya: 'clay',
  modak: 'collect',
};

/** Height of each arrangement above its surface — the pickup point and the prompt sit on top. */
export const ITEM_HEIGHT: Record<ItemId, number> = {
  flowers: 0.26,
  durva: 0.13,
  coconut: 0.31,
  bananas: 0.16,
  rice: 0.21,
  diya: 0.13,
  modak: 0.16,
};

export class PujaItem implements IInteractable {
  // ---- the brief's properties ------------------------------------------------------------------
  readonly itemId: ItemId;
  readonly itemName: string;
  /** How many the puja needs in all (the same for every spot of this kind). */
  readonly requiredQuantity: number;
  /** How many are still here to take. */
  currentQuantity: number;
  /** Where the arrangement rests (its base, on its surface). */
  readonly worldPosition: Vector3;

  // ---- IInteractable -------------------------------------------------------------------------
  readonly id: string;
  readonly kind = 'item' as const;
  readonly position: Vector3;
  readonly promptAnchor: Vector3;
  readonly interactRadius = 1.6;
  readonly priority = 2;
  readonly ownColliders: readonly Collider[];

  /** Where the hand reaches. */
  readonly pickupPoint: Vector3;
  readonly spot: OfferingSpotDef;
  readonly initialQuantity: number;
  visual: PujaItemVisual | null = null;
  private time = 0;
  private readonly inventory: InventorySystem;

  constructor(spot: OfferingSpotDef, inventory: InventorySystem, physics: Physics | null) {
    this.spot = spot;
    this.inventory = inventory;
    this.itemId = spot.item;
    this.itemName = ITEMS[spot.item].name;
    this.requiredQuantity = ITEMS[spot.item].required;
    this.currentQuantity = this.initialQuantity = spot.quantity;
    this.worldPosition = new Vector3(spot.x, spot.y, spot.z);
    this.position = this.worldPosition;
    this.id = `item:${spot.id}`;
    const h = ITEM_HEIGHT[spot.item];
    this.pickupPoint = new Vector3(spot.x, spot.y + h, spot.z);
    this.promptAnchor = new Vector3(spot.x, spot.y + h + 0.45, spot.z);
    const body = physics?.addCylinder(new Vector3(spot.x, spot.y + h / 2, spot.z), h / 2, 0.24, Layer.Item) ?? null;
    this.ownColliders = body ? [body] : [];
  }

  /** The bag's icon for this item: the rendered one once the art has loaded, else its glyph. */
  get icon(): string {
    return new InventoryItem(this.itemId, 1).icon;
  }

  isAvailable(): boolean {
    return this.currentQuantity > 0;
  }

  prompt(): PromptText {
    const inv = this.inventory;
    const base = { verb: 'Collect', mobileVerb: 'COLLECT' };
    const detail = `${this.itemName} ×${this.currentQuantity}`;
    if (inv.wanted(this.itemId) <= 0) {
      const done = inv.offered(this.itemId) >= this.requiredQuantity;
      return { ...base, detail, enabled: false, note: done ? `Bappa already has the ${this.itemName.toLowerCase()}` : `You carry all the ${this.itemName.toLowerCase()} the puja needs` };
    }
    if (inv.free <= 0) return { ...base, detail, enabled: false, note: 'Your bag is full — offer at the temple first' };
    const take = inv.acceptable(this.itemId, this.currentQuantity);
    if (take >= this.currentQuantity) return { ...base, detail, enabled: true };
    // Say why only part of it will be taken: the bag, or the puja's need.
    const why = take === inv.free && inv.free < inv.wanted(this.itemId) ? `room for ${take}` : `the puja needs ${take}`;
    return { ...base, detail: `${detail} · ${why}`, enabled: true };
  }

  /** Bend down for things on the ground; reach out for a counter or stall. */
  action(): PlayerAction {
    return this.spot.y < 0.3 ? PlayerAction.Pickup : PlayerAction.Interact;
  }

  sound(): readonly SoundKey[] {
    return ['collect', SOUND[this.itemId]];
  }

  interact(_actor: InteractionActor): void {
    const taken = this.inventory.add(this.itemId, this.currentQuantity);
    if (taken <= 0) return;
    this.currentQuantity -= taken;
    this.visual?.setRemaining(this.currentQuantity, this.initialQuantity);
    EventBus.emit('ui:pickup', { id: this.itemId, quantity: taken, leftBehind: this.currentQuantity });
  }

  /**
   * Puts back what was taken. A failure empties the bag, and what it carried has to be gathered
   * again — from here, where it was found.
   */
  restock(): void {
    if (this.currentQuantity === this.initialQuantity) return;
    this.currentQuantity = this.initialQuantity;
    this.visual?.setRemaining(this.currentQuantity, this.initialQuantity);
  }

  setHighlight(approach: number, focused: boolean): void {
    this.visual?.setHighlight(approach, focused);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.currentQuantity > 0) this.visual?.update(dt, this.time);
  }
}
