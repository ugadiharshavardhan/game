/** A value React can subscribe to without a state library. */
export class Observable<T> {
  private value: T;
  private readonly listeners = new Set<(value: T) => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T): void {
    if (Object.is(next, this.value)) return;
    this.value = next;
    for (const l of this.listeners) l(next);
  }

  update(change: (current: T) => T): void {
    this.set(change(this.value));
  }

  subscribe = (listener: (value: T) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}
