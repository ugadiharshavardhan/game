import type { Vector3 } from 'three';
import { EventBus } from '../../shared/EventBus';
import type { PlayerConfig } from '../config/playerConfig';
import type { PlayerAction } from './PlayerAnimation';
import { PlayerStateId } from './PlayerState';

/** What the interaction system needs from the player. Implemented by Player. */
export interface InteractionActor {
  readonly feet: Vector3;
  readonly yaw: number;
  readonly state: { value: PlayerStateId; beginInteraction(): void; endInteraction(): void; enterHidden(): void; exitHidden(): void };
  setVisible(visible: boolean): void;
}

/** Anything the player can use with the single action verb. */
export interface Interactable {
  readonly position: Vector3;
  prompt(actor: InteractionActor): string;
  actionFor(actor: InteractionActor): PlayerAction;
  canInteract(actor: InteractionActor): boolean;
  /** Called at the animation's midpoint — the moment the hand reaches the object. */
  interact(actor: InteractionActor): void;
  update?(dt: number): void;
}

/** Picks the best interactable in front of the player and publishes its prompt to the HUD. */
export class PlayerInteraction {
  target: Interactable | null = null;
  active: Interactable | null = null;
  private scanTimer = 0;
  private lastPrompt: string | null = null;
  private readonly interactables: readonly Interactable[];

  private readonly config: PlayerConfig;

  constructor(
    interactables: readonly Interactable[],
    config: PlayerConfig,
  ) {
    this.interactables = interactables;
    this.config = config;
  }

  update(dt: number, actor: InteractionActor): void {
    for (const i of this.interactables) i.update?.(dt);
    if (this.active) return;
    this.scanTimer -= dt;
    if (this.scanTimer > 0) return;
    this.scanTimer = 0.1;
    this.target = this.findBest(actor);
    const text = this.target && this.target.canInteract(actor) ? this.target.prompt(actor) : null;
    if (text !== this.lastPrompt) {
      this.lastPrompt = text;
      EventBus.emit('ui:prompt', text ? { text } : null);
    }
  }

  /** Starts an interaction if one is available. Returns the action to animate, or null. */
  tryBegin(actor: InteractionActor): PlayerAction | null {
    if (this.active || !this.target || actor.state.value === PlayerStateId.Interacting) return null;
    if (!this.target.canInteract(actor)) return null;
    this.active = this.target;
    actor.state.beginInteraction();
    this.lastPrompt = null;
    EventBus.emit('ui:prompt', null);
    return this.active.actionFor(actor);
  }

  midpoint(actor: InteractionActor): void {
    this.active?.interact(actor);
  }

  complete(actor: InteractionActor): void {
    this.active = null;
    this.scanTimer = 0;
    actor.state.endInteraction();
  }

  private findBest(actor: InteractionActor): Interactable | null {
    const hidden = actor.state.value === PlayerStateId.Hidden;
    const maxAngle = (this.config.interactMaxAngleDeg * Math.PI) / 180;
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const i of this.interactables) {
      const dx = i.position.x - actor.feet.x;
      const dz = i.position.z - actor.feet.z;
      const dist = Math.hypot(dx, dz);
      if (dist > this.config.interactRadius) continue;
      let angle = Math.abs(Math.atan2(dx, dz) - actor.yaw) % (Math.PI * 2);
      if (angle > Math.PI) angle = Math.PI * 2 - angle;
      if (!hidden && angle > maxAngle) continue;
      const score = dist + angle / (Math.PI / 2);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }
}
