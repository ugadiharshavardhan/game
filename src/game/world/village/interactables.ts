/**
 * The village's other interactables (puja items are items/PujaItem, shelters are shelter/SafeHouse):
 *
 *   TempleAltar       offer what the puja still needs; pray when there's nothing to offer
 *   LockedDoor        the families at the pandal: knock, and nobody answers
 *   VillagerTalk      people preparing for the festival, with a word of advice
 *   DroppedOfferings  what fell when the moon overwhelmed you — still yours to pick up
 *
 * Rules only — meshes are handed in by whichever renderer drew them.
 */
import type { Collider } from '@dimforge/rapier3d-compat';
import { MathUtils, type Object3D, Vector3 } from 'three';
import { EventBus } from '../../../shared/EventBus';
import { describeStacks, type InventoryStack, stillNeeded } from '../../../shared/items';
import type { SoundKey } from '../../audio/SoundFx';
import type { IInteractable, PromptText } from '../../interaction/IInteractable';
import type { InventorySystem } from '../../inventory/InventorySystem';
import type { PujaItemVisual } from '../../items/PujaItem';
import { PlayerAction } from '../../player/PlayerAnimation';
import type { DoorPoint } from './solids';
import type { VillagerDef } from './types';

/**
 * The offering point in the mandapa, facing the sanctum. Offering moves everything the puja still
 * needs from the bag to Bappa; with nothing to offer, a prayer restores purity (the cleansing).
 */
export class TempleAltar implements IInteractable {
  readonly id = 'temple:altar';
  readonly kind = 'temple' as const;
  readonly position: Vector3;
  readonly promptAnchor: Vector3;
  readonly interactRadius = 2.2;
  readonly priority = 3;
  private glow = 0;
  private readonly inventory: InventorySystem;
  private readonly onPray: () => void;
  private readonly onComplete: () => void;

  constructor(position: Vector3, inventory: InventorySystem, onPray: () => void, onComplete: () => void) {
    this.position = position;
    this.promptAnchor = position.clone().setY(position.y + 1.25);
    this.inventory = inventory;
    this.onPray = onPray;
    this.onComplete = onComplete;
  }

  /** How many carried items the puja still needs. */
  private get offerable(): number {
    const offered = this.inventory.snapshot().offered;
    return this.inventory.items.reduce((n, s) => n + Math.min(s.quantity, stillNeeded(s.id, offered)), 0);
  }

  isAvailable(): boolean {
    return true;
  }

  prompt(): PromptText {
    if (this.inventory.pujaComplete) return { verb: 'Pray', mobileVerb: 'PRAY', detail: 'Ganpati Bappa Morya!', enabled: true };
    const n = this.offerable;
    if (n > 0) return { verb: 'Offer', mobileVerb: 'OFFER', detail: `${n} offering${n === 1 ? '' : 's'} for Bappa`, enabled: true };
    // Nothing to place yet: a prayer steadies you after the moonlight.
    return { verb: 'Pray', mobileVerb: 'PRAY', detail: 'The puja still wants more', enabled: true };
  }

  action(): PlayerAction {
    return PlayerAction.Celebrate;
  }

  sound(): SoundKey {
    return this.offerable > 0 ? 'offer' : 'bell';
  }

  interact(): void {
    this.glow = 1;
    const wasComplete = this.inventory.pujaComplete;
    const moved = this.inventory.offerAtTemple();
    this.onPray();
    if (moved.length) EventBus.emit('ui:toast', { text: `Offered ${describeStacks(moved)}`, tone: 'good' });
    if (!wasComplete && this.inventory.pujaComplete) this.onComplete();
  }

  /** 0..1, fading after an offering — renderers brighten the sanctum lamps with it. */
  get lampBoost(): number {
    return this.glow;
  }

  update(dt: number): void {
    this.glow = Math.max(this.glow - dt / 8, 0);
  }
}

/** A house whose family is out at the pandal: knock, rattle the latch, and nobody comes. */
export class LockedDoor implements IInteractable {
  readonly id: string;
  readonly kind = 'house' as const;
  readonly position: Vector3;
  readonly promptAnchor: Vector3;
  readonly interactRadius = 1.8;
  readonly priority = 1;
  private rattle = 0;
  private readonly door: DoorPoint;
  private readonly hinge: Object3D | null;

  constructor(door: DoorPoint, threshold: Vector3, anchor: Vector3, hinge: Object3D | null) {
    this.id = `house:${door.houseId}:locked`;
    this.door = door;
    this.position = threshold;
    this.promptAnchor = anchor;
    this.hinge = hinge;
  }

  isAvailable(): boolean {
    return true;
  }

  prompt(): PromptText {
    const who = this.door.family.replace(/^the /, 'The ');
    return { verb: 'Knock', mobileVerb: 'KNOCK', detail: `${who}’ home · locked`, enabled: true };
  }

  action(): PlayerAction {
    return PlayerAction.Interact;
  }

  sound(): SoundKey {
    return 'knock';
  }

  interact(): void {
    this.rattle = 0.35;
    EventBus.emit('ui:toast', { text: `No answer — ${this.door.family} are at the pandal`, tone: 'info' });
  }

  update(dt: number): void {
    this.rattle = Math.max(this.rattle - dt, 0);
    if (this.hinge) this.hinge.rotation.y = this.rattle > 0 ? Math.sin(this.rattle * 70) * MathUtils.degToRad(1.2) : 0;
  }
}

/** Someone preparing for the festival, with a few words for whoever stops to talk. */
export class VillagerTalk implements IInteractable {
  readonly id: string;
  readonly kind = 'npc' as const;
  readonly position: Vector3;
  readonly promptAnchor: Vector3;
  readonly interactRadius = 2.0;
  readonly priority = 1;
  private next = 0;
  private readonly name: string;
  private readonly lines: readonly string[];

  constructor(v: VillagerDef & { name: string; lines: readonly string[] }) {
    this.id = `npc:${v.id}`;
    this.name = v.name;
    this.lines = v.lines;
    this.position = new Vector3(v.x, v.y, v.z);
    this.promptAnchor = new Vector3(v.x, v.y + (v.pose.startsWith('sit') || v.pose === 'kneel' ? 1.25 : 1.75), v.z);
  }

  isAvailable(): boolean {
    return true;
  }

  prompt(): PromptText {
    return { verb: 'Talk', mobileVerb: 'TALK', detail: this.name, enabled: true };
  }

  action(): null {
    return null;
  }

  sound(): null {
    return null;
  }

  interact(): void {
    EventBus.emit('ui:speech', { speaker: this.name, text: this.lines[this.next % this.lines.length] });
    this.next++;
  }
}

let dropCount = 0;

/**
 * Offerings that fell when the moon overwhelmed the player. They stay exactly where they fell
 * until picked up again — nothing is ever lost, only time.
 */
export class DroppedOfferings implements IInteractable {
  readonly id = `dropped:${++dropCount}`;
  readonly kind = 'item' as const;
  readonly position: Vector3;
  readonly promptAnchor: Vector3;
  readonly interactRadius = 1.7;
  readonly priority = 2.5;
  readonly ownColliders: readonly Collider[] = [];
  readonly stacks: InventoryStack[];
  visual: PujaItemVisual | null = null;
  private time = 0;
  private readonly total: number;
  private readonly inventory: InventorySystem;
  private readonly onEmpty: (d: DroppedOfferings) => void;

  constructor(at: Vector3, stacks: InventoryStack[], inventory: InventorySystem, onEmpty: (d: DroppedOfferings) => void) {
    this.position = at.clone();
    this.promptAnchor = at.clone().setY(at.y + 0.6);
    this.stacks = stacks.map((s) => ({ ...s }));
    this.total = stacks.reduce((n, s) => n + s.quantity, 0);
    this.inventory = inventory;
    this.onEmpty = onEmpty;
  }

  private get left(): number {
    return this.stacks.reduce((n, s) => n + s.quantity, 0);
  }

  isAvailable(): boolean {
    return this.left > 0;
  }

  prompt(): PromptText {
    const base = { verb: 'Collect', mobileVerb: 'COLLECT', detail: `Your dropped offerings (${this.left})` };
    const takeable = this.stacks.some((s) => s.quantity > 0 && this.inventory.acceptable(s.id, s.quantity) > 0);
    if (takeable) return { ...base, enabled: true };
    return { ...base, enabled: false, note: this.inventory.free <= 0 ? 'Your bag is full — offer at the temple first' : 'The puja has enough of these' };
  }

  action(): PlayerAction {
    return PlayerAction.Pickup;
  }

  sound(): readonly SoundKey[] {
    return ['collect', 'rustle'];
  }

  interact(): void {
    for (const s of this.stacks) {
      const taken = this.inventory.add(s.id, s.quantity);
      s.quantity -= taken;
      if (taken > 0) EventBus.emit('ui:pickup', { id: s.id, quantity: taken, leftBehind: s.quantity });
    }
    this.visual?.setRemaining(this.left, this.total);
    if (this.left === 0) this.onEmpty(this);
  }

  setHighlight(approach: number, focused: boolean): void {
    this.visual?.setHighlight(approach, focused);
  }

  update(dt: number): void {
    this.time += dt;
    this.visual?.update(dt, this.time);
  }
}
