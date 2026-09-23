import { AhkoCancellationError } from "../errors/cancellation.error.js";
import type { IScheduleOptions } from "../models/options.model.js";
import type { ITask } from "../models/task.model.js";

/**
 * Internal tracking entry for throttled executions.
 */
interface IThrottleEntry<T = unknown> {
  readonly key: string | symbol;
  windowTimerId?: ReturnType<typeof setTimeout>;
  trailingTask?: ITask<T>;
  trailingOptions?: IScheduleOptions;
  trailingResolve?: (value: T) => void;
  trailingReject?: (reason: unknown) => void;
  trailingPromise?: Promise<T>;
  abortListener?: () => void;
}

/**
 * Coordinates throttle execution with leading execution, trailing execution,
 * and Promise coalescing by explicit key.
 *
 * Incoming calls with the same key within the throttle period coalesce into a
 * single shared trailing execution, preventing overload while ensuring callers
 * receive the final result.
 */
export class ThrottleCoordinator {
  private readonly entries = new Map<string | symbol, IThrottleEntry<unknown>>();

  /**
   * Schedules a task under the throttle strategy.
   *
   * @param key - Explicit identity key.
   * @param task - Work to execute.
   * @param waitMs - Throttle interval duration in milliseconds.
   * @param options - Scheduling options.
   * @param dispatchFn - Callback invoked to dispatch task execution into the queue.
   * @returns Promise resolving with the leading execution or coalesced trailing result.
   */
  public schedule<T>(
    key: string | symbol,
    task: ITask<T>,
    waitMs: number,
    options: IScheduleOptions | undefined,
    dispatchFn: (task: ITask<T>, options?: IScheduleOptions) => Promise<T>
  ): Promise<T> {
    const existing = this.entries.get(key) as IThrottleEntry<T> | undefined;

    if (!existing) {
      // Leading execution: runs immediately
      const entry: IThrottleEntry<T> = {
        key,
      };

      entry.windowTimerId = setTimeout(() => {
        void this.onWindowExpire(key, waitMs, dispatchFn);
      }, waitMs);

      this.entries.set(key, entry as IThrottleEntry<unknown>);

      return dispatchFn(task, options);
    }

    // Trailing call within active window: coalesce with latest work
    existing.trailingTask = task;
    existing.trailingOptions = options;

    if (existing.trailingPromise) {
      return existing.trailingPromise;
    }

    let resolvePromise!: (value: T) => void;
    let rejectPromise!: (reason: unknown) => void;

    existing.trailingPromise = new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    existing.trailingResolve = resolvePromise;
    existing.trailingReject = rejectPromise;

    if (options?.signal) {
      const listener = () => {
        if (existing.trailingReject) {
          existing.trailingReject(
            new AhkoCancellationError("Throttled trailing task was cancelled", {
              cause: options.signal?.reason instanceof Error ? options.signal.reason : undefined,
            })
          );
          existing.trailingTask = undefined;
          existing.trailingOptions = undefined;
          existing.trailingPromise = undefined;
          existing.trailingResolve = undefined;
          existing.trailingReject = undefined;
        }
      };
      existing.abortListener = listener;
      options.signal.addEventListener("abort", listener, { once: true });
    }

    return existing.trailingPromise;
  }

  /**
   * Invoked when the throttle interval window timer expires.
   */
  private async onWindowExpire<T>(
    key: string | symbol,
    waitMs: number,
    dispatchFn: (task: ITask<T>, options?: IScheduleOptions) => Promise<T>
  ): Promise<void> {
    const entry = this.entries.get(key) as IThrottleEntry<T> | undefined;
    if (!entry) {
      return;
    }

    if (entry.trailingTask) {
      const task = entry.trailingTask;
      const options = entry.trailingOptions;
      const resolve = entry.trailingResolve;
      const reject = entry.trailingReject;

      // Reset trailing slots for subsequent calls
      entry.trailingTask = undefined;
      entry.trailingOptions = undefined;
      entry.trailingPromise = undefined;
      entry.trailingResolve = undefined;
      entry.trailingReject = undefined;

      // Re-arm window timer for the trailing run
      entry.windowTimerId = setTimeout(() => {
        void this.onWindowExpire(key, waitMs, dispatchFn);
      }, waitMs);

      try {
        const result = await dispatchFn(task, options);
        resolve?.(result);
      } catch (error) {
        reject?.(error);
      }
      return;
    }

    // No trailing task arrived during the window: settle and delete key
    this.entries.delete(key);
  }

  /**
   * Cancels any pending trailing throttled task for a given key.
   *
   * @param key - Identity key to cancel.
   * @param reason - Optional cancellation reason.
   */
  public cancel(key: string | symbol, reason?: unknown): void {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }

    if (entry.windowTimerId !== undefined) {
      clearTimeout(entry.windowTimerId);
    }
    this.entries.delete(key);

    if (entry.trailingReject) {
      const cancelError = new AhkoCancellationError(
        typeof reason === "string" ? reason : "Throttled task was cancelled",
        { cause: reason instanceof Error ? reason : undefined }
      );
      entry.trailingReject(cancelError);
    }
  }

  /**
   * Number of keys currently actively throttled.
   */
  public get size(): number {
    return this.entries.size;
  }

  /**
   * Clears all throttled entries and timers.
   */
  public clear(): void {
    for (const entry of this.entries.values()) {
      if (entry.windowTimerId !== undefined) {
        clearTimeout(entry.windowTimerId);
      }
      if (entry.trailingReject) {
        entry.trailingReject(new AhkoCancellationError("Throttled tasks cleared"));
      }
    }
    this.entries.clear();
  }
}
