import { useEffect, useLayoutEffect, useRef } from 'react';
import { EventBus, type EventHandler } from '../../shared/EventBus';
import type { GameEventName } from '../../shared/events';

/**
 * Subscribe a React component to one event on the bus.
 *
 * The handler is held in a ref so that passing an inline arrow function does not
 * resubscribe on every render — the subscription depends only on the event name,
 * while the callback stays current.
 */
export function useGameEvent<K extends GameEventName>(event: K, handler: EventHandler<K>): void {
  const handlerRef = useRef(handler);

  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => EventBus.on(event, (payload) => handlerRef.current(payload)), [event]);
}
