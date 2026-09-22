/**
 * Result of combining multiple AbortSignals.
 */
export interface ICombinedSignal {
  /**
   * The unified AbortSignal that aborts when any source signal aborts.
   */
  readonly signal: AbortSignal;

  /**
   * Detaches all registered event listeners from source signals to prevent memory leaks.
   */
  cleanup: () => void;
}

/**
 * Combines multiple AbortSignals into a single coordinated AbortSignal with deterministic cleanup.
 *
 * @param signals - Array of source AbortSignals (undefined entries are ignored).
 * @returns A unified signal interface with explicit cleanup callback.
 */
export function combineSignals(
  signals: ReadonlyArray<AbortSignal | undefined>
): ICombinedSignal {
  const activeSignals = signals.filter(
    (signal): signal is AbortSignal => signal !== undefined
  );

  if (activeSignals.length === 0) {
    const controller = new AbortController();
    return {
      signal: controller.signal,
      cleanup: () => {},
    };
  }

  // Check if any source signal is already aborted
  const alreadyAborted = activeSignals.find((s) => s.aborted);
  if (alreadyAborted) {
    const controller = new AbortController();
    controller.abort(alreadyAborted.reason);
    return {
      signal: controller.signal,
      cleanup: () => {},
    };
  }

  if (activeSignals.length === 1) {
    return {
      signal: activeSignals[0],
      cleanup: () => {},
    };
  }

  const controller = new AbortController();
  const cleanupFns: Array<() => void> = [];

  const onAbort = (event: Event): void => {
    const target = event.target as AbortSignal;
    cleanup();
    controller.abort(target.reason);
  };

  for (const sig of activeSignals) {
    sig.addEventListener("abort", onAbort, { once: true });
    cleanupFns.push(() => {
      sig.removeEventListener("abort", onAbort);
    });
  }

  const cleanup = (): void => {
    for (const fn of cleanupFns) {
      fn();
    }
    cleanupFns.length = 0;
  };

  return {
    signal: controller.signal,
    cleanup,
  };
}
