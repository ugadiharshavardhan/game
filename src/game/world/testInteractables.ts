/**
 * Testbed-only interactables that prove the animation + state pipeline without game systems:
 * no inventory, no shelter rules, no moon.
 */
import { type Group, MathUtils, type Mesh, type PointLight, type Sprite, type SpriteMaterial, type Vector3 } from 'three';
import { PlayerAction } from '../player/PlayerAnimation';
import type { Interactable, InteractionActor } from '../player/PlayerInteraction';

/** Pick up → hides, comes back after a few seconds. */
export class TestPickup implements Interactable {
  private respawn = 0;
  private readonly visual: Mesh;
  readonly position: Vector3;

  constructor(
    visual: Mesh,
    position: Vector3,
  ) {
    this.visual = visual;
    this.position = position;
  }
  prompt = () => 'Pick up coconut';
  actionFor = () => PlayerAction.Pickup;
  canInteract = () => this.visual.visible;
  interact(): void {
    this.visual.visible = false;
    this.respawn = 4;
  }
  update(dt: number): void {
    if (this.respawn > 0 && (this.respawn -= dt) <= 0) this.visual.visible = true;
  }
}

/** Pray → the diya glows for a while. */
export class TestShrine implements Interactable {
  private lit = 0;
  private flicker = 0;
  readonly position: Vector3;
  private readonly light: PointLight;
  private readonly flame: Sprite;

  constructor(
    position: Vector3,
    light: PointLight,
    flame: Sprite,
  ) {
    this.position = position;
    this.light = light;
    this.flame = flame;
  }
  prompt = () => 'Pray';
  actionFor = () => PlayerAction.Celebrate;
  canInteract = () => true;
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

/** Enter → hidden inside; interact again → step out. The door swings each time. */
export class TestDoor implements Interactable {
  private occupant: InteractionActor | null = null;
  private swing = 0;
  readonly position: Vector3;
  private readonly hinge: Group;

  constructor(
    position: Vector3,
    hinge: Group,
  ) {
    this.position = position;
    this.hinge = hinge;
  }
  prompt = (a: InteractionActor) => (this.occupant === a ? 'Step outside' : 'Enter house');
  actionFor = (a: InteractionActor) => (this.occupant === a ? PlayerAction.ExitHouse : PlayerAction.EnterHouse);
  canInteract = (a: InteractionActor) => this.occupant === null || this.occupant === a;
  interact(a: InteractionActor): void {
    const entering = this.occupant === null;
    this.occupant = entering ? a : null;
    a.setVisible(!entering);
    if (entering) a.state.enterHidden();
    else a.state.exitHidden();
    this.swing = 1.4;
  }
  update(dt: number): void {
    // Open fast, hold, close slowly.
    this.swing = Math.max(this.swing - dt, 0);
    const open = this.swing > 1.0 ? (1.4 - this.swing) / 0.4 : Math.min(this.swing / 0.6, 1);
    this.hinge.rotation.y = MathUtils.degToRad(-100) * MathUtils.smoothstep(open, 0, 1);
  }
}


