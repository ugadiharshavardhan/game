/**
 * The player's state. Locomotion states are pushed in every frame by the controller;
 * Interacting and Hidden are explicit, lock movement, and take priority (Interacting over Hidden).
 * A scripted walk (through a doorway) also locks input, but still reads as walking.
 */
export const PlayerStateId = {
  Idle: 'idle',
  Walking: 'walking',
  /** Walking with purpose — the pace between a stroll and a run. */
  FastWalking: 'fast-walking',
  Running: 'running',
  Sneaking: 'sneaking',
  Jumping: 'jumping',
  Interacting: 'interacting',
  Hidden: 'hidden',
} as const;

export type PlayerStateId = (typeof PlayerStateId)[keyof typeof PlayerStateId];

export type StateListener = (from: PlayerStateId, to: PlayerStateId) => void;

export class PlayerState {
  private current: PlayerStateId = PlayerStateId.Idle;
  private locomotion: PlayerStateId = PlayerStateId.Idle;
  private interacting = false;
  private hidden = false;
  private scripted = false;
  private readonly listeners = new Set<StateListener>();

  get value(): PlayerStateId {
    return this.current;
  }

  get isLocked(): boolean {
    return this.interacting || this.hidden || this.scripted;
  }

  /** Input is ignored while a cutscene-like walk (entering or leaving a house) plays. */
  setScripted(on: boolean): void {
    this.scripted = on;
  }

  onChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  updateLocomotion(derived: PlayerStateId): void {
    this.locomotion = derived;
    this.resolve();
  }

  beginInteraction(): void {
    this.interacting = true;
    this.resolve();
  }

  endInteraction(): void {
    this.interacting = false;
    this.locomotion = PlayerStateId.Idle;
    this.resolve();
  }

  enterHidden(): void {
    this.hidden = true;
    this.resolve();
  }

  exitHidden(): void {
    this.hidden = false;
    this.locomotion = PlayerStateId.Idle;
    this.resolve();
  }

  private resolve(): void {
    const next = this.interacting
      ? PlayerStateId.Interacting
      : this.hidden
        ? PlayerStateId.Hidden
        : this.locomotion;
    if (next === this.current) return;
    const prev = this.current;
    this.current = next;
    for (const l of this.listeners) l(prev, next);
  }
}
