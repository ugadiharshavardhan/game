/**
 * Testbed-only interactables that prove the interaction, animation and sound pipeline without the
 * village's systems: a coconut that comes back, a shrine lamp, and a door that opens and shuts.
 */
import type { Collider } from '@dimforge/rapier3d-compat';
import { type Group, MathUtils, type Mesh, type PointLight, type Sprite, type SpriteMaterial, Vector3 } from 'three';
import type { SoundKey } from '../audio/SoundFx';
import type { IInteractable, PromptText } from '../interaction/IInteractable';
import { PlayerAction } from '../player/PlayerAnimation';

/** Pick up → hides, comes back after a few seconds. */
export class TestPickup implements IInteractable {
  readonly id = 'test:coconut';
  readonly kind = 'item' as const;
  readonly interactRadius = 1.6;
  readonly priority = 2;
  readonly promptAnchor: Vector3;
  private respawn = 0;
  readonly position: Vector3;
  private readonly visual: Mesh;

  constructor(visual: Mesh, position: Vector3) {
    this.visual = visual;
    this.position = position;
    this.promptAnchor = position.clone().setY(0.9);
  }
  isAvailable = () => this.visual.visible;
  prompt = (): PromptText => ({ verb: 'Collect', mobileVerb: 'COLLECT', detail: 'Coconut', enabled: true });
  action = () => PlayerAction.Pickup;
  sound = (): readonly SoundKey[] => ['collect', 'thunk'];
  interact(): void {
    this.visual.visible = false;
    this.respawn = 4;
  }
  update(dt: number): void {
    if (this.respawn > 0 && (this.respawn -= dt) <= 0) this.visual.visible = true;
  }
}

/** Pray → the diya glows for a while. */
export class TestShrine implements IInteractable {
  readonly id = 'test:shrine';
  readonly kind = 'temple' as const;
  readonly interactRadius = 1.8;
  readonly priority = 3;
  readonly promptAnchor: Vector3;
  private lit = 0;
  private flicker = 0;
  readonly position: Vector3;
  private readonly light: PointLight;
  private readonly flame: Sprite;

  constructor(position: Vector3, light: PointLight, flame: Sprite) {
    this.position = position;
    this.promptAnchor = position.clone().setY(1.3);
    this.light = light;
    this.flame = flame;
  }
  isAvailable = () => true;
  prompt = (): PromptText => ({ verb: 'Pray', mobileVerb: 'PRAY', detail: 'Shrine', enabled: true });
  action = () => PlayerAction.Celebrate;
  sound = (): SoundKey => 'bell';
  interact(): void {
    this.lit = 8;
  }
  update(dt: number): void {
    this.lit = Math.max(this.lit - dt, 0);
    this.flicker += dt * 13;
    const on = MathUtils.clamp(this.lit, 0, 1);
    const f = 1 + Math.sin(this.flicker) * 0.08 + Math.sin(this.flicker * 2.3) * 0.05;
    this.light.intensity = 3.2 * on * f;
    (this.flame.material as SpriteMaterial).opacity = on * f;
  }
}

/** A door that opens (its collider off) and shuts again. */
export class TestDoor implements IInteractable {
  readonly id = 'test:door';
  readonly kind = 'house' as const;
  readonly interactRadius = 1.8;
  readonly priority = 1;
  readonly promptAnchor: Vector3;
  readonly ownColliders: readonly Collider[];
  private open = false;
  private swing = 0;
  readonly position: Vector3;
  private readonly hinge: Group;
  private readonly collider: Collider;

  constructor(position: Vector3, hinge: Group, collider: Collider) {
    this.position = position;
    this.promptAnchor = position.clone().setY(1.4);
    this.hinge = hinge;
    this.collider = collider;
    this.ownColliders = [collider];
  }
  isAvailable = () => true;
  prompt = (): PromptText => ({ verb: this.open ? 'Close door' : 'Open door', mobileVerb: this.open ? 'CLOSE' : 'OPEN', enabled: true });
  action = () => PlayerAction.Interact;
  sound = (): SoundKey => (this.open ? 'door-close' : 'door-open');
  interact(): void {
    this.open = !this.open;
    this.collider.setEnabled(!this.open);
  }
  update(dt: number): void {
    this.swing = MathUtils.clamp(this.swing + (this.open ? dt : -dt) / 0.5, 0, 1);
    this.hinge.rotation.y = MathUtils.degToRad(-100) * MathUtils.smoothstep(this.swing, 0, 1);
  }
}

