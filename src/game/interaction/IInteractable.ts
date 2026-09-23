/**
 * Anything the player can use with the one action button: a puja item, a house door, the temple
 * altar, a villager. The InteractionSystem finds these through their trigger volumes, picks one by
 * priority, shows its prompt, plays the player's animation and sound, and calls `interact` at the
 * moment of contact. Objects never read input, and the player never knows what it is using.
 */
import type { Collider } from '@dimforge/rapier3d-compat';
import type { Vector3 } from 'three';
import type { PlayerAction } from '../player/CharacterAnimationController';
import type { SoundKey } from '../audio/SoundFx';

export type InteractableKind = 'item' | 'house' | 'temple' | 'npc';

/** What the player's body offers to things it interacts with. Implemented by Player. */
export interface InteractionActor {
  readonly feet: Vector3;
  /** Facing heading, radians (forward = (sin yaw, 0, cos yaw)). */
  readonly yaw: number;
  /**
   * Plays a one-shot animation. `onContact` fires when the hands reach the object (the clip's
   * midpoint); `onDone` when control returns.
   */
  playAction(action: PlayerAction, onContact: () => void, onDone: () => void): void;
  /** Locks movement while an interaction plays. */
  setBusy(busy: boolean): void;
  /** Turns toward a point while busy. */
  faceTowards(point: Vector3, dt: number): void;
}

/** The words on a prompt. Visual style (key glyphs, touch buttons) is React's business. */
export interface PromptText {
  /** Sentence case: "Collect", "Enter house". */
  verb: string;
  /** Upper case, for the touch button: "COLLECT", "ENTER". */
  mobileVerb: string;
  detail?: string;
  /** Shown but greyed out when false, with `note` saying why ("The bag is full"). */
  enabled: boolean;
  note?: string;
}

export interface IInteractable {
  /** Stable and unique: `item:modak`, `house:patil:enter`. */
  readonly id: string;
  readonly kind: InteractableKind;
  /** Ground-level point the reach is measured to (a door's threshold, an item's resting place). */
  readonly position: Vector3;
  /** Where the prompt floats, and what the line-of-sight check aims at. */
  readonly promptAnchor: Vector3;
  /** Horizontal reach from the player's feet to `position`, metres. */
  readonly interactRadius: number;
  /** When several are in reach, the higher priority wins (distance and facing break ties). */
  readonly priority: number;
  /** The object's own colliders, ignored by its line-of-sight check (a door blocks the view of itself). */
  readonly ownColliders?: readonly Collider[];

  /** False hides the prompt entirely (a collected item, a house you're already inside). */
  isAvailable(actor: InteractionActor): boolean;
  prompt(actor: InteractionActor): PromptText;
  /** The animation to play, or null to act at once. */
  action(actor: InteractionActor): PlayerAction | null;
  /** Played at the moment of contact (several layer: a chime and the item's own sound). */
  sound(actor: InteractionActor): SoundKey | readonly SoundKey[] | null;
  /** Called at the moment of contact (or at once when there is no animation). */
  interact(actor: InteractionActor): void;

  /**
   * How close the player is, 0 (far) → 1 (in reach), and whether this is the current target.
   * Items glow as you approach; anything else may ignore it.
   */
  setHighlight?(approach: number, focused: boolean): void;
  update?(dt: number): void;
}
