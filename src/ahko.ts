import { AhkoCancellationError } from "./errors/cancellation.error.js";
import { AhkoConfigurationError } from "./errors/configuration.error.js";
import {
  getActiveConfig,
  getProfileConfig,
  loadConfig,
  loadConfigFile,
  resetConfig,
} from "./config/config-loader.js";
import type { IBatchOptions, IBatchMapOptions } from "./models/batch.model.js";
import type { ECircuitState } from "./models/circuit-breaker.model.js";
import type { IAhkoFileConfig, IAhkoProfileConfig } from "./models/config.model.js";
import type { ITaskContext } from "./models/context.model.js";
import type { TAhkoEventName, TAhkoEventHandler, TAhkoUnsubscribe } from "./models/events.model.js";
import type { IAhkoOptions, IScheduleOptions } from "./models/options.model.js";
import type { IAhkoStats } from "./models/stats.model.js";
import { EScheduleStrategy } from "./models/strategy.model.js";
import type { ITask } from "./models/task.model.js";
import type { CircuitBreakerCoordinator } from "./scheduler/circuit-breaker.js";
import { TaskQueue } from "./scheduler/task-queue.js";
import { TaskRunner } from "./scheduler/task-runner.js";

/**
 * Ahko — Low-energy asynchronous task scheduler.
 *
 * Coordinates execution timing, enforces concurrency limits, manages priorities,
 * provides circuit-breaker stability, supports pause/resume flow control,
 * and cooperates natively with AbortSignal cancellation.
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

  /** Default schedule options inherited from profile if configured */
  private readonly defaultScheduleOptions?: Partial<IScheduleOptions>;

  /**
   * Programmatically loads a declarative configuration into memory.
   * Works universally across Node.js, browsers, and edge runtimes.
   *
   * @param config - File configuration object containing default and named profiles.
   */
  public static loadConfig(config: IAhkoFileConfig): void {
    loadConfig(config);
  }

  /**
   * Asynchronously loads a configuration file from disk (Node.js).
   *
   * @param filePath - Path to configuration file (default: "config.ahko.json").
   */
  public static async loadConfigFile(filePath?: string): Promise<IAhkoFileConfig | undefined> {
    return loadConfigFile(filePath);
  }

  /**
   * Resets the active declarative configuration.
   */
  public static resetConfig(): void {
    resetConfig();
  }

  /**
   * Retrieves the currently active declarative configuration.
   */
  public static getActiveConfig(): IAhkoFileConfig | undefined {
    return getActiveConfig();
  }

  /**
   * Instantiates an Ahko scheduler initialized with settings from a declarative profile.
   *
   * @param profileName - Optional name of the profile (e.g. "api", "background").
   * @param overrides - Optional scheduler options overriding profile values.
   * @returns A new configured Ahko instance.
   */
  public static fromProfile(profileName?: string, overrides?: IAhkoOptions): Ahko {
    const profile = getProfileConfig(profileName);
    return new Ahko({
      ...profile,
      ...overrides,
      circuitBreaker: overrides?.circuitBreaker ?? profile?.circuitBreaker,
      adaptive: overrides?.adaptive ?? profile?.adaptive,
    });
  }

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
    const profile = options?.profile ? getProfileConfig(options.profile) : getProfileConfig();

    const mergedOptions: IAhkoOptions = {
      ...profile,
      ...options,
      circuitBreaker: options?.circuitBreaker ?? profile?.circuitBreaker,
      adaptive: options?.adaptive ?? profile?.adaptive,
    };

    if (profile) {
      this.defaultScheduleOptions = {
        priority: profile.priority,
        retry: profile.retry,
        timeoutMs: profile.timeoutMs,
        totalTimeoutMs: profile.totalTimeoutMs,
        tags: profile.tags,
      };
    }

    this.queue = new TaskQueue(
      mergedOptions.concurrency,
      mergedOptions.minIntervalMs,
      mergedOptions.circuitBreaker,
      mergedOptions.adaptive
    );
  }

  /**
   * Current concurrency limit.
   */
  public get concurrency(): number {
    return this.queue.concurrency;
  }

  /**
   * Dynamically updates the concurrency limit of the scheduler.
   *
   * @param concurrency - New maximum concurrency (must be >= 1).
   * @throws {AhkoConfigurationError} If concurrency is invalid.
   */
  public setConcurrency(concurrency: number): void {
    this.queue.setConcurrency(concurrency);
  }

  /**
   * Pauses scheduler dispatch. In-flight tasks run to completion, but pending tasks remain queued.
   */
  public pause(): void {
    this.queue.pause();
  }

  /**
   * Resumes scheduler dispatch, immediately executing waiting tasks up to available concurrency.
   */
  public resume(): void {
    this.queue.resume();
  }

  /**
   * Checks whether the scheduler is currently paused.
   */
  public isPaused(): boolean {
    return this.queue.isPaused();
  }

  /**
   * Current circuit breaker state if circuit breaker protection is configured.
   */
  public get circuitState(): ECircuitState | undefined {
    return this.queue.circuitBreakerCoordinator?.state;
  }

  /**
   * Access to the underlying circuit breaker coordinator instance if configured.
   */
  public get circuitBreaker(): CircuitBreakerCoordinator | undefined {
    return this.queue.circuitBreakerCoordinator;
  }

  /**
   * Wraps an async function so every execution is automatically routed through this Ahko scheduler.
   *
   * @template TArgs - Parameter types of the wrapped function.
   * @template TReturn - Return type of the wrapped function.
   * @param fn - The function to wrap.
   * @param options - Optional scheduling options applied to every wrapped call.
   * @returns A wrapped function returning a Promise.
   *
   * @example
   * ```typescript
   * const fetchUser = ahko.wrap(async (id: string) => api.getUser(id), { priority: "high" });
   * const user = await fetchUser("usr_123");
   * ```
   */
  public wrap<TArgs extends unknown[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn> | TReturn,
    options?: IScheduleOptions
  ): (...args: TArgs) => Promise<TReturn> {
    if (typeof fn !== "function") {
      throw new AhkoConfigurationError("Target to wrap must be a valid function.");
    }
    return (...args: TArgs) => {
      return this.schedule(() => fn(...args), options);
    };
  }

  /**
   * Schedules a task for execution with full return type inference.
   *
   * @template T - Inferred return type of the task.
   * @param task - Asynchronous or synchronous task function accepting an {@link ITaskContext}.
   * @param options - Task-specific scheduling options such as strategy, priority, delay, and cancellation signal.
   * @returns A promise that resolves with the task's return value.
   *
   * @throws {AhkoConfigurationError} If the task is not a function or options are invalid.
   * @throws {AhkoCancellationError} If the task is cancelled prior to or during execution.
   * @throws {AhkoTimeoutError} If task execution exceeds timeoutMs or totalTimeoutMs.
   * @throws {AhkoCircuitBreakerOpenError} If the circuit breaker is OPEN and rejects the execution.
   *
   * @example
   * ```typescript
   * // Immediate execution (subject to concurrency)
   * const count = await ahko.schedule(async () => 42);
   *
   * // High priority task
   * await ahko.schedule(doUrgentWork, { priority: "high" });
   * ```
   */
  public schedule<T>(task: ITask<T>, options?: IScheduleOptions): Promise<T> {
    if (typeof task !== "function") {
      throw new AhkoConfigurationError("Task must be a valid function.");
    }

    const mergedTags = options?.tags ?? this.defaultScheduleOptions?.tags;
    const mergedOptions: IScheduleOptions = {
      ...this.defaultScheduleOptions,
      ...options,
      tags: mergedTags,
    };

    const strategy = mergedOptions.strategy ?? EScheduleStrategy.IMMEDIATE;

    if (strategy === EScheduleStrategy.DEBOUNCE) {
      if (!mergedOptions.key || (typeof mergedOptions.key !== "string" && typeof mergedOptions.key !== "symbol")) {
        throw new AhkoConfigurationError(
          `Strategy "debounce" requires a valid "key" of type string or symbol.`
        );
      }
      const waitMs = mergedOptions.waitMs ?? mergedOptions.delay;
      if (typeof waitMs !== "number" || Number.isNaN(waitMs) || !Number.isFinite(waitMs) || waitMs < 0) {
        throw new AhkoConfigurationError(
          `Strategy "debounce" requires a non-negative finite "waitMs" or "delay" in milliseconds.`
        );
      }
      return this.queue.debounceCoordinator.schedule(
        mergedOptions.key,
        task,
        waitMs,
        mergedOptions,
        (t, opts) => this.schedule(t, { ...opts, strategy: EScheduleStrategy.IMMEDIATE })
      );
    }

    if (strategy === EScheduleStrategy.THROTTLE) {
      if (!mergedOptions.key || (typeof mergedOptions.key !== "string" && typeof mergedOptions.key !== "symbol")) {
        throw new AhkoConfigurationError(
          `Strategy "throttle" requires a valid "key" of type string or symbol.`
        );
      }
      const waitMs = mergedOptions.waitMs ?? mergedOptions.delay;
      if (typeof waitMs !== "number" || Number.isNaN(waitMs) || !Number.isFinite(waitMs) || waitMs < 0) {
        throw new AhkoConfigurationError(
          `Strategy "throttle" requires a non-negative finite "waitMs" or "delay" in milliseconds.`
        );
      }
      return this.queue.throttleCoordinator.schedule(
        mergedOptions.key,
        task,
        waitMs,
        mergedOptions,
        (t, opts) => this.schedule(t, { ...opts, strategy: EScheduleStrategy.IMMEDIATE })
      );
    }

    const runner = new TaskRunner<T>(
      task,
      mergedOptions.signal,
      mergedOptions.timeoutMs,
      mergedOptions.tags
    );
    return this.queue.enqueue(runner, mergedOptions);
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
   * Convenience method to schedule a debounced task with key-based Promise coalescing.
   *
   * @template T - Inferred return type of the task.
   * @param key - Explicit identity key.
   * @param task - Work to execute once calls stop arriving.
   * @param waitMs - Quiet window duration in milliseconds.
   * @param options - Additional schedule options.
   * @returns Shared promise resolving with the final execution outcome.
   */
  public debounce<T>(
    key: string | symbol,
    task: ITask<T>,
    waitMs: number,
    options?: Omit<IScheduleOptions, "strategy" | "key" | "waitMs">
  ): Promise<T> {
    return this.schedule(task, {
      ...options,
      strategy: EScheduleStrategy.DEBOUNCE,
      key,
      waitMs,
    });
  }

  /**
   * Convenience method to schedule a throttled task with leading execution and coalesced trailing run.
   *
   * @template T - Inferred return type of the task.
   * @param key - Explicit identity key.
   * @param task - Work to execute.
   * @param waitMs - Throttle interval duration in milliseconds.
   * @param options - Additional schedule options.
   * @returns Promise resolving with the leading or coalesced trailing result.
   */
  public throttle<T>(
    key: string | symbol,
    task: ITask<T>,
    waitMs: number,
    options?: Omit<IScheduleOptions, "strategy" | "key" | "waitMs">
  ): Promise<T> {
    return this.schedule(task, {
      ...options,
      strategy: EScheduleStrategy.THROTTLE,
      key,
      waitMs,
    });
  }

  /**
   * Transforms an iterable of items concurrently using an asynchronous mapping function.
   *
   * Results are guaranteed to be returned in the original index order.
   * Concurrency can be capped per-batch or fall back to the scheduler's global limit.
   *
   * @template TItem - Type of input elements.
   * @template TResult - Type of mapped elements.
   * @param items - Iterable sequence of items to process.
   * @param fn - Mapper callback receiving item, index, and task context.
   * @param options - Batch execution options (concurrency, stopOnError, retry, signal, tags, etc.).
   * @returns Array of transformed results in index order.
   *
   * @throws {AhkoConfigurationError} If fn is not a function or concurrency is invalid.
   * @throws {AhkoCancellationError} If batch or item is cancelled.
   *
   * @example
   * ```typescript
   * const urls = ["/api/1", "/api/2", "/api/3"];
   * const data = await ahko.map(urls, async (url, i, { signal }) => {
   *   const res = await fetch(url, { signal });
   *   return res.json();
   * }, { concurrency: 2 });
   * ```
   */
  public async map<TItem, TResult>(
    items: Iterable<TItem>,
    fn: (item: TItem, index: number, context: ITaskContext) => Promise<TResult> | TResult,
    options?: IBatchMapOptions<TItem, TResult>
  ): Promise<TResult[]> {
    if (typeof fn !== "function") {
      throw new AhkoConfigurationError("Mapper function must be a valid function.");
    }

    if (
      options?.concurrency !== undefined &&
      (typeof options.concurrency !== "number" ||
        Number.isNaN(options.concurrency) ||
        options.concurrency < 1)
    ) {
      throw new AhkoConfigurationError(
        `Invalid concurrency "${options.concurrency}". Must be a number greater than or equal to 1.`
      );
    }

    const list = Array.from(items);
    if (list.length === 0) {
      return [];
    }

    const { concurrency, stopOnError = false, signal: externalSignal, ...scheduleOpts } =
      options ?? {};

    if (externalSignal?.aborted) {
      throw new AhkoCancellationError(
        externalSignal.reason ? `Batch cancelled: ${String(externalSignal.reason)}` : "Batch cancelled"
      );
    }

    const abortController = new AbortController();

    const results = new Array<TResult>(list.length);
    let firstError: unknown = undefined;
    let hasAborted = false;

    const localizedLimit =
      concurrency !== undefined
        ? Math.floor(concurrency)
        : Number.isFinite(this.concurrency)
        ? this.concurrency
        : Infinity;

    return new Promise<TResult[]>((resolve, reject) => {
      let currentIndex = 0;
      let activeCount = 0;
      let settledCount = 0;

      const onExternalAbort = () => {
        const reason = externalSignal?.reason ?? "Batch cancelled by external signal";
        const err = new AhkoCancellationError(
          typeof reason === "string" ? reason : "Batch cancelled by external signal"
        );
        cleanupAndReject(err);
      };

      if (externalSignal) {
        externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      }

      const cleanupAndReject = (err: unknown) => {
        if (!hasAborted) {
          hasAborted = true;
          abortController.abort(err);
        }
        if (externalSignal) {
          externalSignal.removeEventListener("abort", onExternalAbort);
        }
        reject(err);
      };

      const checkCompletion = () => {
        if (settledCount === list.length) {
          if (externalSignal) {
            externalSignal.removeEventListener("abort", onExternalAbort);
          }
          if (firstError !== undefined) {
            reject(firstError);
          } else {
            resolve(results);
          }
        }
      };

      const launchNext = () => {
        if (hasAborted && stopOnError) {
          return;
        }

        while (
          currentIndex < list.length &&
          activeCount < localizedLimit &&
          !(hasAborted && stopOnError)
        ) {
          const index = currentIndex++;
          const item = list[index];
          activeCount++;

          const taskPromise = this.schedule(
            (context) => fn(item, index, context),
            {
              ...scheduleOpts,
              signal: abortController.signal,
            }
          );

          taskPromise
            .then((result) => {
              results[index] = result;
            })
            .catch((err) => {
              if (firstError === undefined) {
                firstError = err;
              }
              if (stopOnError && !hasAborted) {
                cleanupAndReject(err);
                return;
              }
            })
            .finally(() => {
              activeCount--;
              settledCount++;
              if (hasAborted && stopOnError) {
                return;
              }
              if (currentIndex < list.length) {
                launchNext();
              } else {
                checkCompletion();
              }
            });
        }
      };

      if (abortController.signal.aborted) {
        cleanupAndReject(abortController.signal.reason);
        return;
      }

      launchNext();
    });
  }

  /**
   * Iterates sequentially or concurrently over an iterable sequence of items,
   * executing the callback function for each element.
   *
   * @template TItem - Type of input elements.
   * @param items - Iterable sequence of items to process.
   * @param fn - Callback receiving item, index, and task context.
   * @param options - Batch execution options.
   * @returns Promise resolving once all items have finished executing.
   *
   * @example
   * ```typescript
   * await ahko.each(userQueue, async (user, index, { signal }) => {
   *   await sendWelcomeEmail(user, { signal });
   * }, { concurrency: 5 });
   * ```
   */
  public async each<TItem>(
    items: Iterable<TItem>,
    fn: (item: TItem, index: number, context: ITaskContext) => Promise<void> | void,
    options?: IBatchOptions
  ): Promise<void> {
    await this.map(items, fn, options);
  }

  /**
   * Cancels all pending, delayed, and active tasks tagged with the given tag.
   *
   * @param tag - Tag identifier.
   * @param reason - Optional cancellation reason.
   * @returns Total number of tasks cancelled.
   */
  public cancelByTag(tag: string, reason?: unknown): number {
    return this.queue.cancelByTag(tag, reason);
  }

  /**
   * Retrieves active and pending task counts for a given tag.
   *
   * @param tag - Tag identifier.
   * @returns Object with activeTasks and pendingTasks counts.
   */
  public statsByTag(tag: string): { activeTasks: number; pendingTasks: number } {
    return this.queue.getStatsByTag(tag);
  }

  /**
   * Retrieves real-time telemetry metrics from the scheduler.
   *
   * @returns An {@link IAhkoStats} snapshot of active, pending, completed, failed, cancelled, timed out tasks, pause status, and circuit state.
   *
   * @example
   * ```typescript
   * const stats = ahko.stats();
   * console.log(`Active: ${stats.activeTasks}, Pending: ${stats.pendingTasks}, Paused: ${stats.isPaused}`);
   * ```
   */
  public stats(): IAhkoStats {
    return this.queue.getStats();
  }

  /**
   * Subscribes to a scheduler lifecycle event.
   *
   * @param event - Event name to listen for.
   * @param handler - Callback function invoked when the event is emitted.
   * @returns Unsubscribe function to remove the listener.
   *
   * @example
   * ```typescript
   * const unsubscribe = ahko.on("task:start", ({ taskId, attempt }) => {
   *   console.log(`Task ${taskId} started attempt ${attempt}`);
   * });
   * ```
   */
  public on<K extends TAhkoEventName>(event: K, handler: TAhkoEventHandler<K>): TAhkoUnsubscribe {
    return this.queue.emitter.on(event, handler);
  }

  /**
   * Unsubscribes an event listener from a scheduler lifecycle event.
   *
   * @param event - Event name.
   * @param handler - The exact listener callback to remove.
   */
  public off<K extends TAhkoEventName>(event: K, handler: TAhkoEventHandler<K>): void {
    this.queue.emitter.off(event, handler);
  }

  /**
   * Checks whether the scheduler is currently idle (no active runners and no pending tasks).
   *
   * @returns True if completely idle, false otherwise.
   */
  public isIdle(): boolean {
    return this.queue.isIdle();
  }

  /**
   * Returns a promise that resolves once the scheduler has completed all tasks and is idle.
   *
   * @returns Promise resolving when the scheduler is idle.
   *
   * @example
   * ```typescript
   * ahko.schedule(doWork);
   * await ahko.onIdle();
   * console.log("All work finished!");
   * ```
   */
  public onIdle(): Promise<void> {
    return this.queue.onIdle();
  }

  /**
   * Clears all pending, delayed, and throttled/debounced tasks from the scheduler.
   * In-flight active tasks will continue executing to completion or abort via signal.
   */
  public clear(): void {
    this.queue.clear();
  }

  /**
   * Returns the delightful Ahko mascot battery telemetry status.
   *
   * Low energy, completely chill.
   */
  public battery(): { level: number; chill: boolean; status: string; quote: string } {
    return {
      level: 3,
      chill: true,
      status: "low-energy",
      quote: "Mwee... my battery is low, but all your tasks are handled completely chill.",
    };
  }

  /**
   * Delightful alias for `onIdle()`: wait for all tasks to settle chill and relaxed.
   *
   * @returns Promise resolving when all tasks have finished.
   */
  public chill(): Promise<void> {
    return this.onIdle();
  }
}
