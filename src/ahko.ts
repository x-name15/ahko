import { AhkoConfigurationError } from "./errors/configuration.error.js";
import type { IAhkoOptions, IScheduleOptions } from "./models/options.model.js";
import type { IAhkoStats } from "./models/stats.model.js";
import { EScheduleStrategy } from "./models/strategy.model.js";
import type { ITask } from "./models/task.model.js";
import { TaskQueue } from "./scheduler/task-queue.js";
import { TaskRunner } from "./scheduler/task-runner.js";

/**
 * Ahko — Low-energy asynchronous task scheduler.
 *
 * Coordinates execution timing, enforces concurrency limits, and cooperates
 * natively with AbortSignal cancellation.
 *
 * @example
 * ```typescript
 * import { Ahko } from "@mrjacket/ahko";
 *
 * const ahko = new Ahko({ concurrency: 2 });
 *
 * const result = await ahko.schedule(async ({ signal, taskId }) => {
 *   const res = await fetch("https://api.example.com", { signal });
 *   return res.json();
 * });
 * ```
 */
export class Ahko {
  /** Internal queue and concurrency manager */
  private readonly queue: TaskQueue;

  /**
   * Initializes a new Ahko scheduler instance.
   *
   * @param options - Optional scheduler configuration.
   * @throws {AhkoConfigurationError} If concurrency is invalid (less than 1 or NaN).
   *
   * @example
   * ```typescript
   * const ahko = new Ahko({ concurrency: 4 });
   * ```
   */
  constructor(options?: IAhkoOptions) {
    this.queue = new TaskQueue(options?.concurrency);
  }

  /**
   * Schedules a task for execution with full return type inference.
   *
   * @template T - Inferred return type of the task.
   * @param task - Asynchronous or synchronous task function accepting an {@link ITaskContext}.
   * @param options - Task-specific scheduling options such as strategy, delay, and cancellation signal.
   * @returns A promise that resolves with the task's return value.
   *
   * @throws {AhkoConfigurationError} If the task is not a function or options are invalid.
   * @throws {AhkoCancellationError} If the task is cancelled prior to or during execution.
   *
   * @example
   * ```typescript
   * // Immediate execution (subject to concurrency)
   * const count = await ahko.schedule(async () => 42);
   *
   * // Delayed execution
   * await ahko.schedule(
   *   async ({ signal }) => doWork({ signal }),
   *   { strategy: "delay", delay: 1000 }
   * );
   * ```
   */
  public schedule<T>(task: ITask<T>, options?: IScheduleOptions): Promise<T> {
    if (typeof task !== "function") {
      throw new AhkoConfigurationError("Task must be a valid function.");
    }

    const runner = new TaskRunner<T>(task, options?.signal, options?.timeoutMs);
    return this.queue.enqueue(runner, options);
  }

  /**
   * Convenience method to schedule a task during platform idle opportunities.
   *
   * Equivalent to calling `schedule(task, { ...options, strategy: "idle" })`.
   * In browsers, uses `requestIdleCallback` when available.
   * In Node.js, uses `setImmediate`.
   * Falls back to `setTimeout(..., 0)` if neither is available.
   *
   * @template T - Inferred return type of the task.
   * @param task - Task function to run when idle.
   * @param options - Scheduling options (excluding strategy).
   * @returns A promise resolving to the task's return value.
   *
   * @throws {AhkoConfigurationError} If the task is not a function or options are invalid.
   * @throws {AhkoCancellationError} If the task is cancelled prior to or during execution.
   *
   * @example
   * ```typescript
   * const result = await ahko.idle(async ({ signal }) => {
   *   return computeAnalytics();
   * });
   * ```
   */
  public idle<T>(
    task: ITask<T>,
    options?: Omit<IScheduleOptions, "strategy">
  ): Promise<T> {
    return this.schedule(task, {
      ...options,
      strategy: EScheduleStrategy.IDLE,
    });
  }

  /**
   * Retrieves real-time telemetry metrics from the scheduler.
   *
   * @returns An {@link IAhkoStats} snapshot of active, pending, completed, failed, cancelled, and timed out tasks.
   *
   * @example
   * ```typescript
   * const stats = ahko.stats();
   * console.log(`Active: ${stats.activeTasks}, Pending: ${stats.pendingTasks}`);
   * ```
   */
  public stats(): IAhkoStats {
    return this.queue.getStats();
  }
}
