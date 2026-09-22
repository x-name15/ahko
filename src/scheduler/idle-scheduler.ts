/**
 * Handle returned by the IdleScheduler allowing cancellation of an idle request.
 */
export interface IIdleHandle {
  /**
   * Cancels the scheduled idle callback and cleans up platform resources.
   */
  cancel(): void;
}

/**
 * Platform-agnostic scheduler for opportunistic idle task execution.
 *
 * Automatically detects and selects platform capabilities:
 * 1. Browser: `requestIdleCallback` / `cancelIdleCallback` (with optional timeout)
 * 2. Node.js: `setImmediate` / `clearImmediate` as low-priority primitive
 * 3. Fallback: `setTimeout(..., 0)` / `clearTimeout`
 */
export class IdleScheduler {
  /**
   * Schedules a callback to execute during the next idle opportunity.
   *
   * @param callback - Function to invoke when idle opportunity arises.
   * @param timeout - Optional max deadline in milliseconds to wait before invoking (browser only).
   * @param runtime - Target runtime scope providing scheduling primitives (defaults to globalThis).
   * @returns An {@link IIdleHandle} with a `cancel()` method for cleanup.
   */
  public static schedule(
    callback: () => void,
    timeout?: number,
    runtime: typeof globalThis = globalThis
  ): IIdleHandle {
    // 1. Browser requestIdleCallback
    if (
      typeof (runtime as Record<string, unknown>).requestIdleCallback === "function" &&
      typeof (runtime as Record<string, unknown>).cancelIdleCallback === "function"
    ) {
      const requestFn = (runtime as Record<string, unknown>).requestIdleCallback as (
        cb: (deadline?: unknown) => void,
        opts?: { timeout?: number }
      ) => number;

      const cancelFn = (runtime as Record<string, unknown>).cancelIdleCallback as (
        handle: number
      ) => void;

      const id = requestFn(
        () => callback(),
        typeof timeout === "number" && !Number.isNaN(timeout) && timeout >= 0
          ? { timeout }
          : undefined
      );

      return {
        cancel: () => cancelFn(id),
      };
    }

    // 2. Node.js setImmediate
    if (
      typeof (runtime as Record<string, unknown>).setImmediate === "function" &&
      typeof (runtime as Record<string, unknown>).clearImmediate === "function"
    ) {
      const setImmFn = (runtime as Record<string, unknown>).setImmediate as (
        cb: () => void
      ) => ReturnType<typeof setImmediate>;

      const clearImmFn = (runtime as Record<string, unknown>).clearImmediate as (
        handle: ReturnType<typeof setImmediate>
      ) => void;

      const handle = setImmFn(() => callback());

      return {
        cancel: () => clearImmFn(handle),
      };
    }

    // 3. Universal fallback setTimeout(0)
    const setTimerFn = runtime.setTimeout.bind(runtime);
    const clearTimerFn = runtime.clearTimeout.bind(runtime);

    const timerId = setTimerFn(() => callback(), 0);

    return {
      cancel: () => clearTimerFn(timerId),
    };
  }
}
