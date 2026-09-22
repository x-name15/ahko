import { AhkoCancellationError } from "../errors/cancellation.error.js";
import type { IScheduleOptions } from "../models/options.model.js";
import type { ITask } from "../models/task.model.js";

/**
 * Internal tracking entry for a coalesced debounced task.
 */
interface IDebounceEntry<T = unknown> {
  readonly key: string | symbol;
  task: ITask<T>;
  options?: IScheduleOptions;
  timerId: ReturnType<typeof setTimeout>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  readonly promise: Promise<T>;
  abortListener?: () => void;
}

/**
 * Coordinates debounce execution with Promise coalescing by explicit key.
 *
 * Incoming calls with the same key extend the quiet window and share the
 * eventual execution Promise, guaranteeing that all callers receive the final result.
 */
export class DebounceCoordinator {
  private readonly entries = new Map<string | symbol, IDebounceEntry<unknown>>();

  /**
   * Schedules a task under the debounce strategy.
   *
   * @param key - Explicit identity key.
   * @param task - Work to execute once calls stop arriving.
   * @param waitMs - Quiet window duration in milliseconds.
   * @param options - Scheduling options.
   * @param dispatchFn - Callback invoked when the debounce window expires to dispatch the task to the queue.
   * @returns Shared promise that resolves/rejects with the final execution outcome.
   */
  public schedule<T>(
    key: string | symbol,
    task: ITask<T>,
    waitMs: number,
    options: IScheduleOptions | undefined,
    dispatchFn: (task: ITask<T>, options?: IScheduleOptions) => Promise<T>
  ): Promise<T> {
    const existing = this.entries.get(key) as IDebounceEntry<T> | undefined;

    if (existing) {
      clearTimeout(existing.timerId);
      if (existing.options?.signal && existing.abortListener) {
        existing.options.signal.removeEventListener("abort", existing.abortListener);
      }

      existing.task = task;
      existing.options = options;

      if (options?.signal?.aborted) {
        this.entries.delete(key);
        const err = new AhkoCancellationError(
          typeof options.signal.reason === "string"
            ? options.signal.reason
            : "Debounced task was cancelled prior to execution",
          { cause: options.signal.reason instanceof Error ? options.signal.reason : undefined }
        );
        existing.reject(err);
        return existing.promise;
      }

      if (options?.signal) {
        const listener = () => {
          this.cancel(key, options.signal?.reason);
        };
        existing.abortListener = listener;
        options.signal.addEventListener("abort", listener, { once: true });
      }

      existing.timerId = setTimeout(() => {
        void this.flush(key, dispatchFn);
      }, waitMs);

      return existing.promise;
    }

    let resolvePromise!: (value: T) => void;
    let rejectPromise!: (reason: unknown) => void;

    const promise = new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    if (options?.signal?.aborted) {
      const err = new AhkoCancellationError(
        typeof options.signal.reason === "string"
          ? options.signal.reason
          : "Debounced task was cancelled prior to execution",
        { cause: options.signal.reason instanceof Error ? options.signal.reason : undefined }
      );
      rejectPromise(err);
      return promise;
    }

    let abortListener: (() => void) | undefined;
    if (options?.signal) {
      abortListener = () => {
        this.cancel(key, options.signal?.reason);
      };
      options.signal.addEventListener("abort", abortListener, { once: true });
    }

    const timerId = setTimeout(() => {
      void this.flush(key, dispatchFn);
    }, waitMs);

    const entry: IDebounceEntry<T> = {
      key,
      task,
      options,
      timerId,
      resolve: resolvePromise,
      reject: rejectPromise,
      promise,
      abortListener,
    };

    this.entries.set(key, entry as IDebounceEntry<unknown>);
    return promise;
  }

  /**
   * Dispatches the coalesced task when the quiet window expires.
   */
  private async flush<T>(
    key: string | symbol,
    dispatchFn: (task: ITask<T>, options?: IScheduleOptions) => Promise<T>
  ): Promise<void> {
    const entry = this.entries.get(key) as IDebounceEntry<T> | undefined;
    if (!entry) {
      return;
    }

    this.entries.delete(key);
    if (entry.options?.signal && entry.abortListener) {
      entry.options.signal.removeEventListener("abort", entry.abortListener);
    }

    try {
      const result = await dispatchFn(entry.task, entry.options);
      entry.resolve(result);
    } catch (error) {
      entry.reject(error);
    }
  }

  /**
   * Cancels a pending debounced task by key.
   *
   * @param key - Identity key to cancel.
   * @param reason - Optional cancellation reason.
   */
  public cancel(key: string | symbol, reason?: unknown): void {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }

    clearTimeout(entry.timerId);
    this.entries.delete(key);

    if (entry.options?.signal && entry.abortListener) {
      entry.options.signal.removeEventListener("abort", entry.abortListener);
    }

    const cancelError = new AhkoCancellationError(
      typeof reason === "string" ? reason : "Debounced task was cancelled prior to execution",
      { cause: reason instanceof Error ? reason : undefined }
    );
    entry.reject(cancelError);
  }

  /**
   * Number of pending debounced tasks waiting for quiet window expiry.
   */
  public get size(): number {
    return this.entries.size;
  }

  /**
   * Cancels all pending debounced entries and clears the map.
   */
  public clear(): void {
    for (const [key, entry] of this.entries) {
      clearTimeout(entry.timerId);
      if (entry.options?.signal && entry.abortListener) {
        entry.options.signal.removeEventListener("abort", entry.abortListener);
      }
      entry.reject(new AhkoCancellationError("Debounced tasks cleared"));
    }
    this.entries.clear();
  }
}
