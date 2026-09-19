/**
 * The third-person interaction system: which thing would the action button use, right now?
 *
 * Each frame:
 *   1. trigger detection   every interactable owns an upright cylinder sensor (its reach); the
 *                          player's chest point is tested against them — Rapier does the broadphase
 *   2. availability        collected items, houses you're already in, … drop out
 *   3. line of sight       a ray from the player's eyes to the prompt anchor: no using things
 *                          through walls (props and the object's own colliders don't block)
 *   4. priority            each priority level is worth `priorityWeight` metres of distance, and
 *                          facing away costs some too — so a coconut at your feet beats the door
 *                          behind you, but not the one you're looking at. The current target keeps
 *                          a small bonus, so two close things don't flicker between prompts
 *   5. prompt              publishes the target's words when they change, and its screen position
 *                          every frame, for React's world-space prompt
 *   6. highlight           everything within `highlightRadius` learns how close the player is
 *
 * The action button starts the target's animation on the player; at the moment of contact the
 * system plays the target's sound and calls `interact`. Nothing here reads movement, and the
 * player controller knows nothing about interactables.
 */
import type { Collider } from '@dimforge/rapier3d-compat';
import { type Camera, Vector3 } from 'three';
import { EventBus } from '../../shared/EventBus';
import type { PromptInfo } from '../../shared/events';
import type { SoundKey } from '../audio/SoundFx';
import type { Physics } from '../core/Physics';
import type { IInteractable, InteractionActor } from './IInteractable';

export interface InteractionConfig {
  /** Height of the point tested against trigger volumes, above the feet. */
  chestHeight: number;
  /** Eye height for the line-of-sight ray. */
  eyeHeight: number;
  /** Trigger cylinders' half height — tall enough for a counter-top or a veranda. */
  triggerHalfHeight: number;
  /** How many metres of distance one level of priority is worth. */
  priorityWeight: number;
  /** Beyond this angle between facing and target, a target is not chosen (degrees). */
  maxAngleDeg: number;
  /** How much a full 90° turn away costs, in metres of distance. */
  anglePenalty: number;
  /** The current target's advantage over a challenger, in metres — stops prompt flicker. */
  stickiness: number;
  /** Things within this distance hear how close the player is (for glow). */
  highlightRadius: number;
}

export const DEFAULT_INTERACTION_CONFIG: InteractionConfig = {
  chestHeight: 1.0,
  eyeHeight: 1.45,
  triggerHalfHeight: 1.6,
  priorityWeight: 1.5,
  maxAngleDeg: 110,
  anglePenalty: 0.9,
  stickiness: 0.35,
  highlightRadius: 6,
};

export interface SoundPlayer {
  play(key: SoundKey): void;
}

interface Entry {
  i: IInteractable;
  trigger: Collider;
  own: Set<number>;
}

export class InteractionSystem {
  /** What the action button would use now (null if nothing). */
  target: IInteractable | null = null;
  /** What is being used (animation playing). */
  active: IInteractable | null = null;

  private readonly entries = new Map<number, Entry>();
  private readonly byId = new Map<string, Entry>();
  private readonly hits = new Set<number>();
  private readonly chest = new Vector3();
  private readonly eye = new Vector3();
  private readonly ndc = new Vector3();
  private lastPrompt = '';
  private readonly physics: Physics;
  private readonly sounds: SoundPlayer | null;
  private readonly config: InteractionConfig;

  constructor(physics: Physics, sounds: SoundPlayer | null, config: InteractionConfig = DEFAULT_INTERACTION_CONFIG) {
    this.physics = physics;
    this.sounds = sounds;
    this.config = config;
  }

  /** Adds an interactable (and its trigger volume). Safe to call at any time — dropped items do. */
  register(i: IInteractable): void {
    if (this.byId.has(i.id)) throw new Error(`duplicate interactable id ${i.id}`);
    const c = this.config;
    const trigger = this.physics.addInteractTrigger(
      new Vector3(i.position.x, i.position.y + c.triggerHalfHeight * 0.5, i.position.z),
      i.interactRadius,
      c.triggerHalfHeight,
    );
    const entry: Entry = { i, trigger, own: new Set((i.ownColliders ?? []).map((o) => o.handle)) };
    this.entries.set(trigger.handle, entry);
    this.byId.set(i.id, entry);
  }

  unregister(i: IInteractable): void {
    const e = this.byId.get(i.id);
    if (!e) return;
    this.physics.remove(e.trigger);
    this.entries.delete(e.trigger.handle);
    this.byId.delete(i.id);
    if (this.target === i) this.setTarget(null, null);
  }

  get all(): IInteractable[] {
    return [...this.byId.values()].map((e) => e.i);
  }

  update(dt: number, actor: InteractionActor, camera: Camera | null): void {
    for (const e of this.byId.values()) e.i.update?.(dt);

    if (this.active) {
      actor.faceTowards(this.active.position, dt);
      this.highlight(actor, this.active);
      return;
    }

    const best = this.choose(actor);
    this.setTarget(best, actor);
    this.highlight(actor, best);
    if (best && camera) this.publishPosition(best, camera);
  }

  /**
   * The action button. Starts the target's interaction; returns false if there is nothing to use
   * (or it can't be used right now — then the player hears why).
   */
  tryBegin(actor: InteractionActor): boolean {
    const t = this.target;
    if (!t || this.active) return false;
    const p = t.prompt(actor);
    if (!p.enabled) {
      this.sounds?.play('deny');
      if (p.note) EventBus.emit('ui:toast', { text: p.note, tone: 'warn' });
      return false;
    }
    this.active = t;
    actor.setBusy(true);
    this.setTarget(null, actor);
    const contact = () => {
      const s = t.sound(actor);
      if (typeof s === 'string') this.sounds?.play(s);
      else if (s) for (const k of s) this.sounds?.play(k);
      t.interact(actor);
    };
    const done = () => {
      this.active = null;
      actor.setBusy(false);
    };
    const action = t.action(actor);
    if (action) actor.playAction(action, contact, done);
    else {
      contact();
      done();
    }
    return true;
  }

  dispose(): void {
    for (const e of [...this.byId.values()]) this.unregister(e.i);
    EventBus.emit('ui:prompt', null);
  }

  // ---- choosing -------------------------------------------------------------------------------

  private choose(actor: InteractionActor): IInteractable | null {
    const c = this.config;
    const f = actor.feet;
    this.physics.interactablesAt(this.chest.set(f.x, f.y + c.chestHeight, f.z), this.hits);
    this.eye.set(f.x, f.y + c.eyeHeight, f.z);
    let best: IInteractable | null = null;
    let bestScore = -Infinity;
    for (const h of this.hits) {
      const e = this.entries.get(h);
      if (!e || !e.i.isAvailable(actor)) continue;
      const score = this.score(e, actor);
      if (score > bestScore) {
        bestScore = score;
        best = e.i;
      }
    }
    return best;
  }

  /** Higher is better; −∞ when it can't be the target at all. */
  private score(e: Entry, actor: InteractionActor): number {
    const c = this.config;
    const i = e.i;
    const dx = i.position.x - actor.feet.x;
    const dz = i.position.z - actor.feet.z;
    const dist = Math.hypot(dx, dz);
    let angle = 0;
    if (dist > 0.3) {
      angle = Math.abs(Math.atan2(dx, dz) - actor.yaw) % (Math.PI * 2);
      if (angle > Math.PI) angle = Math.PI * 2 - angle;
      if (angle > (c.maxAngleDeg * Math.PI) / 180) return -Infinity;
    }
    if (!this.physics.lineOfSight(this.eye, i.promptAnchor, e.own)) return -Infinity;
    const sticky = i === this.target ? c.stickiness : 0;
    return i.priority * c.priorityWeight - dist - (angle / (Math.PI / 2)) * c.anglePenalty + sticky;
  }

  // ---- prompt and highlight -------------------------------------------------------------------

  private setTarget(t: IInteractable | null, actor: InteractionActor | null): void {
    this.target = t;
    let info: PromptInfo | null = null;
    if (t && actor) {
      const p = t.prompt(actor);
      info = { id: `${t.id}:${p.verb}:${p.enabled}`, verb: p.verb, mobileVerb: p.mobileVerb, detail: p.detail, enabled: p.enabled, note: p.note };
    }
    const key = info ? JSON.stringify(info) : '';
    if (key === this.lastPrompt) return;
    this.lastPrompt = key;
    EventBus.emit('ui:prompt', info);
  }

  private publishPosition(t: IInteractable, camera: Camera): void {
    this.ndc.copy(t.promptAnchor).project(camera);
    const visible = this.ndc.z < 1 && Math.abs(this.ndc.x) < 1.1 && Math.abs(this.ndc.y) < 1.1;
    EventBus.emit('ui:prompt-position', { x: (this.ndc.x + 1) / 2, y: (1 - this.ndc.y) / 2, visible });
  }

  private highlight(actor: InteractionActor, focus: IInteractable | null): void {
    const r = this.config.highlightRadius;
    for (const e of this.byId.values()) {
      const i = e.i;
      if (!i.setHighlight) continue;
      const d = Math.hypot(i.position.x - actor.feet.x, i.position.z - actor.feet.z);
      const approach = d >= r ? 0 : 1 - Math.max(d - i.interactRadius, 0) / Math.max(r - i.interactRadius, 1e-3);
      i.setHighlight(i.isAvailable(actor) ? approach : 0, i === focus);
    }
  }
}
