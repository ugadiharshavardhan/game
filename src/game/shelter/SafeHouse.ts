/**
 * One enterable house: its door (the leaf you see, the collider that shuts the doorway), its front
 * room, and the two prompts — "Enter house" on the veranda, "Leave house" inside. The walk through
 * the doorway and the camera hand-over belong to the ShelterManager; this class is the door.
 */
import type { Collider } from '@dimforge/rapier3d-compat';
import { MathUtils, type Object3D } from 'three';
import type { IInteractable, InteractionActor, PromptText } from '../interaction/IInteractable';
import { PlayerAction } from '../player/CharacterAnimationController';
import type { HouseDef } from '../world/village/types';
import { HouseInterior } from './HouseInterior';
import type { ShelterManager } from './ShelterManager';

const OPEN_ANGLE = MathUtils.degToRad(95);

export class SafeHouse {
  readonly interior: HouseInterior;
  readonly entrance: IInteractable;
  readonly exit: IInteractable;
  /** 0 = shut, 1 = wide open. */
  openness = 0;
  private openTarget = 0;
  private readonly door: Collider | null;
  private readonly hinge: Object3D | null;
  private onShut: (() => void) | null = null;
  private doorSolid = true;

  constructor(house: HouseDef, manager: ShelterManager, door: Collider | null, hinge: Object3D | null) {
    this.interior = new HouseInterior(house);
    this.door = door;
    this.hinge = hinge;
    const i = this.interior;
    const title = i.label.charAt(0).toUpperCase() + i.label.slice(1);

    this.entrance = {
      id: `house:${house.id}:enter`,
      kind: 'house',
      position: i.threshold,
      promptAnchor: i.doorFaceOut,
      interactRadius: 1.8,
      priority: 1,
      ownColliders: door ? [door] : [],
      isAvailable: (a: InteractionActor) => !manager.busy && manager.current === null && !i.contains(a.feet),
      prompt: (): PromptText => ({ verb: 'Enter house', mobileVerb: 'ENTER', detail: title, enabled: true }),
      action: () => PlayerAction.EnterHouse,
      sound: () => 'door-open',
      interact: () => manager.enter(this),
    };

    this.exit = {
      id: `house:${house.id}:exit`,
      kind: 'house',
      position: i.exitPoint,
      promptAnchor: i.doorFaceIn,
      interactRadius: 1.7,
      priority: 1,
      ownColliders: door ? [door] : [],
      isAvailable: () => !manager.busy && manager.current === this,
      prompt: (): PromptText => ({
        verb: 'Leave house',
        mobileVerb: 'LEAVE',
        detail: manager.moonIsOut() ? 'Moonlight outside' : title,
        enabled: true,
      }),
      action: () => PlayerAction.ExitHouse,
      sound: () => 'door-open',
      interact: () => manager.exit(this),
    };
  }

  get houseId(): string {
    return this.interior.houseId;
  }

  /** Swing the door open; the doorway is clear at once (the leaf opens away from you). */
  open(): void {
    this.openTarget = 1;
    this.setSolid(false);
  }

  /** Swing it shut; the doorway is solid again once it is. */
  close(onShut?: () => void): void {
    this.openTarget = 0;
    this.onShut = onShut ?? null;
  }

  get isOpen(): boolean {
    return this.openness > 0.9;
  }

  get isShut(): boolean {
    return this.openTarget === 0 && this.openness === 0;
  }

  update(dt: number): void {
    const opening = this.openTarget > this.openness;
    // Opens briskly, closes slowly (a heavy door swinging to on its own weight).
    const rate = opening ? 1 / 0.4 : 1 / 0.75;
    this.openness = opening ? Math.min(this.openness + dt * rate, 1) : Math.max(this.openness - dt * rate, this.openTarget);
    if (this.hinge) this.hinge.rotation.y = OPEN_ANGLE * MathUtils.smoothstep(this.openness, 0, 1);
    if (this.openTarget === 0 && this.openness === 0) {
      this.setSolid(true);
      if (this.onShut) {
        const cb = this.onShut;
        this.onShut = null;
        cb();
      }
    }
  }

  private setSolid(solid: boolean): void {
    if (solid === this.doorSolid) return;
    this.doorSolid = solid;
    this.door?.setEnabled(solid);
  }
}
