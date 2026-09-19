/**
 * The village's interactables: house doors (shelter or locked) and the temple offering point.
 * Rules only — the meshes they move are handed in by whichever renderer built the house.
 */
import { MathUtils, type Object3D, Vector3 } from 'three';
import { PlayerAction } from '../../player/PlayerAnimation';
import type { Interactable, InteractionActor } from '../../player/PlayerInteraction';
import type { DoorPoint } from './solids';

/**
 * A shelter door: step inside to hide, step out again when it's safe. The leaf swings open, the
 * player disappears indoors, and the door closes behind them.
 */
export class HouseDoor implements Interactable {
  readonly position: Vector3;
  private occupant: InteractionActor | null = null;
  private swing = 0;
  private readonly door: DoorPoint;
  private readonly hinge: Object3D | null;
  /** Hinge rotation sign: +1 opens inward to the left, −1 to the right. */
  private readonly openSign: number;

  constructor(door: DoorPoint, hinge: Object3D | null, openSign = 1) {
    this.door = door;
    this.position = new Vector3(door.x, door.y, door.z);
    this.hinge = hinge;
    this.openSign = openSign;
  }

  prompt = (a: InteractionActor) =>
    this.occupant === a ? 'Step outside' : this.door.shelter ? `Shelter with ${this.door.family}` : `Locked — ${this.door.family} are at the pandal`;

  actionFor = (a: InteractionActor) =>
    this.occupant === a ? PlayerAction.ExitHouse : this.door.shelter ? PlayerAction.EnterHouse : PlayerAction.Interact;

  canInteract = (a: InteractionActor) => this.occupant === null || this.occupant === a;

  interact(a: InteractionActor): void {
    if (!this.door.shelter) {
      this.swing = 0.25; // a rattle of the latch, nothing more
      return;
    }
    const entering = this.occupant === null;
    this.occupant = entering ? a : null;
    a.setVisible(!entering);
    if (entering) a.state.enterHidden();
    else a.state.exitHidden();
    this.swing = 1.4;
  }

  get sheltering(): boolean {
    return this.occupant !== null;
  }

  update(dt: number): void {
    if (!this.hinge) return;
    this.swing = Math.max(this.swing - dt, 0);
    if (!this.door.shelter) {
      this.hinge.rotation.y = Math.sin(this.swing * 60) * 0.02 * (this.swing > 0 ? 1 : 0);
      return;
    }
    // Open fast, hold, close slowly.
    const open = this.swing > 1.0 ? (1.4 - this.swing) / 0.4 : Math.min(this.swing / 0.6, 1);
    this.hinge.rotation.y = this.openSign * MathUtils.degToRad(-95) * MathUtils.smoothstep(open, 0, 1);
  }
}

/** Where the offerings are placed before Shri Ganesh. The puja itself arrives with the offering system. */
export class TempleOffering implements Interactable {
  readonly position: Vector3;
  private glow = 0;
  private readonly onPray: (() => void) | null;

  constructor(position: Vector3, onPray: (() => void) | null = null) {
    this.position = position;
    this.onPray = onPray;
  }

  prompt = () => 'Offer prayers';
  actionFor = () => PlayerAction.Celebrate;
  canInteract = () => true;

  interact(): void {
    this.glow = 1;
    this.onPray?.();
  }

  /** 0..1, fading after a prayer — renderers use it to brighten the sanctum lamps. */
  get lampBoost(): number {
    return this.glow;
  }

  update(dt: number): void {
    this.glow = Math.max(this.glow - dt / 8, 0);
  }
}
