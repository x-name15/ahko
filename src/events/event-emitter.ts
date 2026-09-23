import type {
  IAhkoEventMap,
  TAhkoEventHandler,
  TAhkoEventName,
  TAhkoUnsubscribe,
} from "../models/events.model.js";

/**
 * Lightweight, zero-dependency typed event emitter with safe error containment.
 */
export class AhkoEventEmitter {
  private readonly listeners = new Map<
    TAhkoEventName,
    Set<TAhkoEventHandler<any>>
  >();

  /**
   * Subscribes a listener to a specific Ahko lifecycle event.
   *
   * @param event - The event name to subscribe to.
   * @param handler - The callback function to invoke when the event is emitted.
   * @returns An unsubscribe function to remove the listener.
   */
  public on<K extends TAhkoEventName>(
    event: K,
    handler: TAhkoEventHandler<K>
  ): TAhkoUnsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }

    set.add(handler);

    return () => {
      this.off(event, handler);
    };
  }

  /**
   * Unsubscribes a listener from a specific Ahko lifecycle event.
   *
   * @param event - The event name.
   * @param handler - The callback function to remove.
   */
  public off<K extends TAhkoEventName>(
    event: K,
    handler: TAhkoEventHandler<K>
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emits an event with the corresponding typed payload to all subscribed listeners.
   * Listener invocations are safely isolated in try/catch to protect scheduler integrity.
   *
   * @param event - The event name to emit.
   * @param payload - The event-specific payload data.
   */
  public emit<K extends TAhkoEventName>(
    event: K,
    payload: IAhkoEventMap[K]
  ): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) {
      return;
    }

    // Iterate over shallow copy to tolerate in-flight unsubscriptions
    const handlers = Array.from(set);
    for (const handler of handlers) {
      try {
        const result = handler(payload);
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch(() => {});
        }
      } catch {
        // Error containment: listener exceptions do not disrupt scheduler operation
      }
    }
  }

  /**
   * Removes all registered event listeners.
   */
  public clear(): void {
    this.listeners.clear();
  }
}
