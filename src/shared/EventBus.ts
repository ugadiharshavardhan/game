/**
 * A tiny typed event emitter — deliberately NOT Phaser.Events.EventEmitter.
 *
 * React components subscribe to this bus. If it were Phaser's emitter, every
 * React module that imports it would drag the ~1.3MB Phaser bundle into the
 * main chunk and the main menu would pay for an engine it hasn't started yet.
 * Forty lines here buys a menu that loads instantly.
 */

import type { GameEventMap, GameEventName } from './events';

export type EventHandler<K extends GameEventName> = (payload: GameEventMap[K]) => void;

/**
 * `never` as the parameter type makes every concrete handler assignable here
 * (parameters are contravariant), so we need exactly one cast, in `emit`.
 */
type AnyHandler = (payload: never) => void;

/** Events whose payload is `undefined` are emitted with no second argument. */
type EmitArgs<K extends GameEventName> = GameEventMap[K] extends undefined
  ? []
  : [payload: GameEventMap[K]];

class TypedEventBus {
  private handlers = new Map<GameEventName, Set<AnyHandler>>();

  /** Subscribe. Returns an unsubscribe function — convenient in useEffect. */
  on<K extends GameEventName>(event: K, handler: EventHandler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  off<K extends GameEventName>(event: K, handler: EventHandler<K>): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit<K extends GameEventName>(event: K, ...args: EmitArgs<K>): void {
    const set = this.handlers.get(event);
    if (!set) return;
    const payload = args[0] as never;
    // Copy first: a handler may unsubscribe itself during dispatch.
    for (const handler of [...set]) handler(payload);
  }

  /** Drop every subscription. Used when tearing the game down. */
  clear(): void {
    this.handlers.clear();
  }
}

export const EventBus = new TypedEventBus();
