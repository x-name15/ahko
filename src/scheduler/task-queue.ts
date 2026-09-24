import { AhkoCircuitBreakerOpenError } from "../errors/circuit-breaker.error.js";
import { AhkoConfigurationError } from "../errors/configuration.error.js";
import { AhkoTimeoutError } from "../errors/timeout.error.js";
import type { IAdaptiveConcurrencyOptions } from "../models/adaptive.model.js";
import type { ICircuitBreakerOptions } from "../models/circuit-breaker.model.js";
import type { IScheduleOptions } from "../models/options.model.js";
import { resolvePriorityWeight } from "../models/priority.model.js";
import type { IAhkoStats } from "../models/stats.model.js";
import { ETaskState } from "../models/state.model.js";
import { EScheduleStrategy } from "../models/strategy.model.js";
import { calculateBackoff } from "../retry/backoff.js";
import { AdaptiveCoordinator } from "./adaptive-coordinator.js";
import { CircuitBreakerCoordinator } from "./circuit-breaker.js";
import { DebounceCoordinator } from "./debounce-coordinator.js";
import { IdleScheduler, type IIdleHandle } from "./idle-scheduler.js";
import { TaskRunner } from "./task-runner.js";
import { ThrottleCoordinator } from "./throttle-coordinator.js";
import { AhkoEventEmitter } from "../events/event-emitter.js";

/**
 * Entry tracking delayed task timers for deterministic cancellation and memory cleanup.
 */
interface IDelayedEntry {
  runner: TaskRunner<unknown>;
  timerId: ReturnType<typeof setTimeout>;
}

/**
 * Entry tracking idle callback handles for deterministic cancellation and cleanup.
 */
interface IIdleEntry {
  runner: TaskRunner<unknown>;
  handle: IIdleHandle;
}

/**
 * Entry tracking backoff delay timers for retry attempts.
 */
interface IRetryEntry {
  runner: TaskRunner<unknown>;
  timerId: ReturnType<typeof setTimeout>;
}

/**
 * Memory-safe priority-aware task queue managing concurrency allocation,
 * rate limiting, circuit breaker protection, dynamic & adaptive concurrency,
 * tags, flow control (pause/resume), and task lifecycle counters.
 */
export class TaskQueue {
  /** Maximum concurrent active tasks */
  private _concurrency: number;

  /** Minimum interval in milliseconds between consecutive task starts */
  public readonly minIntervalMs: number;

  /** Timestamp of the most recent task start */
  private lastTaskStartTime = 0;

  /** Active rate limit timer for pacing consecutive tasks */
  private rateLimitTimer?: ReturnType<typeof setTimeout>;

  /** Queue of pending task runners waiting for a concurrency slot */
  private readonly queue: TaskRunner<unknown>[] = [];

  /** Set of task runners currently executing */
  private readonly activeRunners = new Set<TaskRunner<unknown>>();

  /** Set of tasks currently in delay phase */
  private readonly delayedEntries = new Set<IDelayedEntry>();

  /** Set of tasks currently awaiting an idle opportunity */
  private readonly idleEntries = new Set<IIdleEntry>();

  /** Set of tasks currently awaiting a retry backoff timer */
  private readonly retryEntries = new Set<IRetryEntry>();

  /** Tag index for selective cancellation and task classification */
  private readonly tagIndex = new Map<string, Set<TaskRunner<unknown>>>();

  /** Coordinator for debounced tasks with key coalescing */
  public readonly debounceCoordinator = new DebounceCoordinator();

  /** Coordinator for throttled tasks with leading/trailing coalescing */
  public readonly throttleCoordinator = new ThrottleCoordinator();

  /** Lifecycle event emitter for task and scheduler events */
  public readonly emitter = new AhkoEventEmitter();

  /** Circuit breaker coordinator if configured */
  public readonly circuitBreakerCoordinator?: CircuitBreakerCoordinator;

  /** Adaptive concurrency coordinator if configured */
  public readonly adaptiveCoordinator?: AdaptiveCoordinator;

  /** Pause state flag */
  private _isPaused = false;

  /** Set of pending resolvers awaiting scheduler idle transition */
  private readonly idleResolvers = new Set<() => void>();

  /** WeakMap associating task runners with their scheduling options */
  private readonly runnerOptions = new WeakMap<TaskRunner<unknown>, IScheduleOptions>();

  /** Cumulative completed tasks counter */
  private completedTasks = 0;

  /** Cumulative failed tasks counter */
  private failedTasks = 0;

  /** Cumulative cancelled tasks counter */
  private cancelledTasks = 0;

  /** Cumulative timed out tasks counter */
  private timedOutTasks = 0;

  /** Cumulative count of retry attempts triggered */
  private retriedTasks = 0;

  /** Cumulative count of tasks dispatched to concurrency slots */
  private totalDispatched = 0;

  /**
   * Creates a new TaskQueue.
   *
   * @param concurrency - Maximum concurrent tasks (defaults to Infinity).
   * @param minIntervalMs - Minimum interval in milliseconds between task dispatches.
   * @param circuitBreakerOptions - Optional circuit breaker policy configuration.
   * @param adaptiveOptions - Optional adaptive concurrency policy configuration.
   * @throws {AhkoConfigurationError} If concurrency is less than 1 or minIntervalMs is invalid.
   */
  constructor(
    concurrency = Infinity,
    minIntervalMs = 0,
    circuitBreakerOptions?: ICircuitBreakerOptions,
    adaptiveOptions?: IAdaptiveConcurrencyOptions
  ) {
    if (Number.isNaN(concurrency) || concurrency < 1) {
      throw new AhkoConfigurationError(
        `Invalid concurrency "${concurrency}". Must be a number greater than or equal to 1.`
      );
    }
    if (
      typeof minIntervalMs !== "number" ||
      Number.isNaN(minIntervalMs) ||
      !Number.isFinite(minIntervalMs) ||
      minIntervalMs < 0
    ) {
      throw new AhkoConfigurationError(
        `Invalid minIntervalMs "${minIntervalMs}". minIntervalMs must be a non-negative finite number.`
      );
    }
    this._concurrency = concurrency;
    this.minIntervalMs = minIntervalMs;

    if (circuitBreakerOptions) {
      this.circuitBreakerCoordinator = new CircuitBreakerCoordinator(circuitBreakerOptions);
    }

    if (adaptiveOptions) {
      this.adaptiveCoordinator = new AdaptiveCoordinator(
        adaptiveOptions,
        this._concurrency,
        (previous, current, reason) => {
          this._concurrency = current;
          this.emitter.emit("concurrency:change", {
            previousConcurrency: previous,
            currentConcurrency: current,
            reason,
          });
          this.pump();
        }
      );
      this._concurrency = this.adaptiveCoordinator.currentConcurrency;
    }

    this.debounceCoordinator.onSettled = () => this.checkIdle();
    this.throttleCoordinator.onSettled = () => this.checkIdle();
  }

  /**
   * Current concurrency capacity limit.
   */
  public get concurrency(): number {
    return this._concurrency;
  }

  /**
   * Dynamically adjusts the concurrency limit at runtime.
   *
   * @param newConcurrency - New maximum concurrency (must be >= 1).
   * @throws {AhkoConfigurationError} If newConcurrency is less than 1.
   */
  public setConcurrency(newConcurrency: number): void {
    if (Number.isNaN(newConcurrency) || newConcurrency < 1) {
      throw new AhkoConfigurationError(
        `Invalid concurrency "${newConcurrency}". Must be a number greater than or equal to 1.`
      );
    }

    const previous = this._concurrency;
    this._concurrency = newConcurrency;

    if (this.adaptiveCoordinator) {
      this.adaptiveCoordinator.setConcurrency(newConcurrency);
    }

    if (newConcurrency !== previous) {
      this.emitter.emit("concurrency:change", {
        previousConcurrency: previous,
        currentConcurrency: newConcurrency,
        reason: "Manual concurrency update",
      });
    }

    this.pump();
  }

  /**
   * Pauses queue execution. Running tasks will complete normally, but no new pending tasks will be dispatched.
   */
  public pause(): void {
    this._isPaused = true;
  }

  /**
   * Resumes queue execution, immediately dispatching waiting tasks up to available concurrency.
   */
  public resume(): void {
    if (this._isPaused) {
      this._isPaused = false;
      this.pump();
    }
  }

  /**
   * Checks whether the task queue is currently paused.
   */
  public isPaused(): boolean {
    return this._isPaused;
  }

  /**
   * Cancels all pending, delayed, and active tasks marked with the specified tag.
   *
   * @param tag - Tag identifier to match.
   * @param reason - Optional cancellation reason.
   * @returns Total count of tasks cancelled.
   */
  public cancelByTag(tag: string, reason?: unknown): number {
    const runners = this.tagIndex.get(tag);
    if (!runners || runners.size === 0) {
      return 0;
    }

    const list = Array.from(runners);
    let count = 0;
    for (const runner of list) {
      if (
        runner.state === ETaskState.PENDING ||
        runner.state === ETaskState.RUNNING
      ) {
        runner.cancel(reason ?? `Task cancelled by tag "${tag}"`);
        count++;
      }
    }
    return count;
  }

  /**
   * Returns active and pending task counts for a given tag.
   *
   * @param tag - Tag identifier.
   */
  public getStatsByTag(tag: string): { activeTasks: number; pendingTasks: number } {
    const runners = this.tagIndex.get(tag);
    if (!runners) {
      return { activeTasks: 0, pendingTasks: 0 };
    }
    let active = 0;
    let pending = 0;
    for (const runner of runners) {
      if (runner.state === ETaskState.RUNNING) {
        active++;
      } else if (runner.state === ETaskState.PENDING) {
        pending++;
      }
    }
    return { activeTasks: active, pendingTasks: pending };
  }

  /**
   * Indexes a runner under all its associated tags.
   */
  private indexTaskTags(runner: TaskRunner<unknown>): void {
    for (const tag of runner.tags) {
      let set = this.tagIndex.get(tag);
      if (!set) {
        set = new Set();
        this.tagIndex.set(tag, set);
      }
      set.add(runner);
    }
  }

  /**
   * Removes a runner from the tag index upon settlement.
   */
  private cleanupTaskTags(runner: TaskRunner<unknown>): void {
    for (const tag of runner.tags) {
      const set = this.tagIndex.get(tag);
      if (set) {
        set.delete(runner);
        if (set.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }

  /**
   * Inserts a task runner into the queue based on priority weight (descending).
   * Preserves FIFO ordering among tasks with identical priority.
   */
  private insertIntoQueue(runner: TaskRunner<unknown>): void {
    const options = this.runnerOptions.get(runner);
    const targetWeight = resolvePriorityWeight(options?.priority);

    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      const existingOptions = this.runnerOptions.get(this.queue[i]);
      const existingWeight = resolvePriorityWeight(existingOptions?.priority);
      if (existingWeight < targetWeight) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, runner);
  }

  /**
   * Enqueues a task runner according to the specified schedule options.
   *
   * @template T - The return type produced by the task.
   * @param runner - The task runner instance.
   * @param options - Scheduling options.
   * @returns The deferred promise associated with the task runner.
   * @throws {AhkoConfigurationError} If scheduling options are invalid.
   */
  public enqueue<T>(runner: TaskRunner<T>, options?: IScheduleOptions): Promise<T> {
    const strategy = options?.strategy ?? EScheduleStrategy.IMMEDIATE;

    if (
      strategy !== EScheduleStrategy.IMMEDIATE &&
      strategy !== EScheduleStrategy.DELAY &&
      strategy !== EScheduleStrategy.IDLE &&
      strategy !== EScheduleStrategy.THROTTLE &&
      strategy !== EScheduleStrategy.DEBOUNCE
    ) {
      throw new AhkoConfigurationError(
        `Unsupported schedule strategy "${String(strategy)}". Supported strategies: "immediate", "delay", "idle", "throttle", "debounce".`
      );
    }

    if (strategy === EScheduleStrategy.THROTTLE || strategy === EScheduleStrategy.DEBOUNCE) {
      if (!options?.key || (typeof options.key !== "string" && typeof options.key !== "symbol")) {
        throw new AhkoConfigurationError(
          `Strategy "${strategy}" requires a valid "key" of type string or symbol.`
        );
      }
      const waitMs = options.waitMs ?? options.delay;
      if (typeof waitMs !== "number" || Number.isNaN(waitMs) || !Number.isFinite(waitMs) || waitMs < 0) {
        throw new AhkoConfigurationError(
          `Strategy "${strategy}" requires a non-negative finite "waitMs" or "delay" in milliseconds.`
        );
      }
    }

    if (options?.retry) {
      if (
        typeof options.retry.attempts !== "number" ||
        Number.isNaN(options.retry.attempts) ||
        options.retry.attempts < 1 ||
        !Number.isInteger(options.retry.attempts)
      ) {
        throw new AhkoConfigurationError(
          `Invalid retry attempts "${options.retry.attempts}". attempts must be an integer greater than or equal to 1.`
        );
      }

      if (
        options.retry.baseDelay !== undefined &&
        (typeof options.retry.baseDelay !== "number" ||
          Number.isNaN(options.retry.baseDelay) ||
          options.retry.baseDelay < 0)
      ) {
        throw new AhkoConfigurationError(
          `Invalid retry baseDelay "${options.retry.baseDelay}". baseDelay must be a non-negative number in milliseconds.`
        );
      }

      if (
        options.retry.maxDelay !== undefined &&
        (typeof options.retry.maxDelay !== "number" ||
          Number.isNaN(options.retry.maxDelay) ||
          options.retry.maxDelay < 0)
      ) {
        throw new AhkoConfigurationError(
          `Invalid retry maxDelay "${options.retry.maxDelay}". maxDelay must be a non-negative number in milliseconds.`
        );
      }
    }

    if (options?.timeoutMs !== undefined) {
      if (
        typeof options.timeoutMs !== "number" ||
        Number.isNaN(options.timeoutMs) ||
        !Number.isFinite(options.timeoutMs) ||
        options.timeoutMs <= 0
      ) {
        throw new AhkoConfigurationError(
          `Invalid timeoutMs "${options.timeoutMs}". timeoutMs must be a positive finite number greater than 0.`
        );
      }
    }

    if (options?.totalTimeoutMs !== undefined) {
      if (
        typeof options.totalTimeoutMs !== "number" ||
        Number.isNaN(options.totalTimeoutMs) ||
        !Number.isFinite(options.totalTimeoutMs) ||
        options.totalTimeoutMs <= 0
      ) {
        throw new AhkoConfigurationError(
          `Invalid totalTimeoutMs "${options.totalTimeoutMs}". totalTimeoutMs must be a positive finite number greater than 0.`
        );
      }
    }

    if (options) {
      this.runnerOptions.set(runner as TaskRunner<unknown>, options);
    }

    // Index runner by tags
    this.indexTaskTags(runner as TaskRunner<unknown>);

    // Clean up tag index as soon as runner settles
    runner.promise
      .finally(() => {
        this.cleanupTaskTags(runner as TaskRunner<unknown>);
      })
      .catch(() => {});

    if (runner.state === ETaskState.CANCELLED) {
      this.cancelledTasks++;
      return runner.promise;
    }

    // Attach totalTimeoutMs overall execution budget if configured
    if (options?.totalTimeoutMs !== undefined) {
      const budgetMs = options.totalTimeoutMs;
      const totalTimerId = setTimeout(() => {
        runner.timeout(budgetMs, `Task total execution deadline exceeded after ${budgetMs}ms`);
      }, budgetMs);

      runner.promise
        .finally(() => {
          clearTimeout(totalTimerId);
        })
        .catch(() => {});
    }

    if (strategy === EScheduleStrategy.DELAY) {
      const delayMs = options?.delay ?? 0;
      if (typeof delayMs !== "number" || Number.isNaN(delayMs) || delayMs < 0) {
        throw new AhkoConfigurationError(
          `Invalid delay "${delayMs}". Delay must be a non-negative number in milliseconds.`
        );
      }

      this.scheduleDelayed(runner as TaskRunner<unknown>, delayMs);
      return runner.promise;
    }

    if (strategy === EScheduleStrategy.IDLE) {
      if (
        options?.idleTimeout !== undefined &&
        (typeof options.idleTimeout !== "number" ||
          Number.isNaN(options.idleTimeout) ||
          options.idleTimeout < 0)
      ) {
        throw new AhkoConfigurationError(
          `Invalid idleTimeout "${options.idleTimeout}". idleTimeout must be a non-negative number in milliseconds.`
        );
      }

      this.scheduleIdle(runner as TaskRunner<unknown>, options?.idleTimeout);
      return runner.promise;
    }

    // Attach immediate onCancel handler to dequeue without consuming concurrency
    runner.onCancel = () => {
      const index = this.queue.indexOf(runner as TaskRunner<unknown>);
      if (index !== -1) {
        this.queue.splice(index, 1);
        if (runner.totalTimedOut || runner.state === ETaskState.TIMED_OUT) {
          this.timedOutTasks++;
          this.emitter.emit("task:timeout", {
            taskId: runner.taskId,
            timeoutMs: options?.totalTimeoutMs ?? runner.timeoutMs,
          });
        } else {
          this.cancelledTasks++;
          this.emitter.emit("task:cancel", {
            taskId: runner.taskId,
            reason: "Task cancelled while queued",
          });
        }
        this.checkIdle();
      }
    };

    // Immediate strategy: add to pending queue and pump
    this.insertIntoQueue(runner as TaskRunner<unknown>);
    this.pump();

    return runner.promise;
  }

  /**
   * Schedules a task to be placed into the queue after a delay,
   * handling early cancellation safely.
   */
  private scheduleDelayed(runner: TaskRunner<unknown>, delayMs: number): void {
    const delayedEntry: IDelayedEntry = {
      runner,
      timerId: setTimeout(() => {
        this.delayedEntries.delete(delayedEntry);
        if (runner.state === ETaskState.CANCELLED || runner.state === ETaskState.TIMED_OUT) {
          return;
        }

        runner.onCancel = () => {
          const index = this.queue.indexOf(runner);
          if (index !== -1) {
            this.queue.splice(index, 1);
            if (runner.totalTimedOut || runner.state === ETaskState.TIMED_OUT) {
              this.timedOutTasks++;
              this.emitter.emit("task:timeout", {
                taskId: runner.taskId,
                timeoutMs: this.runnerOptions.get(runner)?.totalTimeoutMs ?? runner.timeoutMs,
              });
            } else {
              this.cancelledTasks++;
              this.emitter.emit("task:cancel", {
                taskId: runner.taskId,
                reason: "Task cancelled while queued",
              });
            }
            this.checkIdle();
          }
        };

        this.insertIntoQueue(runner);
        this.pump();
      }, delayMs),
    };

    this.delayedEntries.add(delayedEntry);

    runner.onCancel = () => {
      if (this.delayedEntries.has(delayedEntry)) {
        clearTimeout(delayedEntry.timerId);
        this.delayedEntries.delete(delayedEntry);
        if (runner.totalTimedOut || runner.state === ETaskState.TIMED_OUT) {
          this.timedOutTasks++;
          this.emitter.emit("task:timeout", {
            taskId: runner.taskId,
            timeoutMs: this.runnerOptions.get(runner)?.totalTimeoutMs ?? runner.timeoutMs,
          });
        } else {
          this.cancelledTasks++;
          this.emitter.emit("task:cancel", {
            taskId: runner.taskId,
            reason: "Task cancelled while waiting in delay",
          });
        }
        this.checkIdle();
      }
    };
  }

  /**
   * Schedules a task to be placed into the queue during an idle opportunity,
   * handling early cancellation safely.
   */
  private scheduleIdle(runner: TaskRunner<unknown>, idleTimeout?: number): void {
    let idleEntry!: IIdleEntry;

    const handle = IdleScheduler.schedule(() => {
      this.idleEntries.delete(idleEntry);
      if (runner.state === ETaskState.CANCELLED || runner.state === ETaskState.TIMED_OUT) {
        return;
      }

      runner.onCancel = () => {
        const index = this.queue.indexOf(runner);
        if (index !== -1) {
          this.queue.splice(index, 1);
          if (runner.totalTimedOut || runner.state === ETaskState.TIMED_OUT) {
            this.timedOutTasks++;
            this.emitter.emit("task:timeout", {
              taskId: runner.taskId,
              timeoutMs: this.runnerOptions.get(runner)?.totalTimeoutMs ?? runner.timeoutMs,
            });
          } else {
            this.cancelledTasks++;
            this.emitter.emit("task:cancel", {
              taskId: runner.taskId,
              reason: "Task cancelled while queued",
            });
          }
          this.checkIdle();
        }
      };

      this.insertIntoQueue(runner);
      this.pump();
    }, idleTimeout);

    idleEntry = { runner, handle };
    this.idleEntries.add(idleEntry);

    runner.onCancel = () => {
      if (this.idleEntries.has(idleEntry)) {
        handle.cancel();
        this.idleEntries.delete(idleEntry);
        if (runner.totalTimedOut || runner.state === ETaskState.TIMED_OUT) {
          this.timedOutTasks++;
          this.emitter.emit("task:timeout", {
            taskId: runner.taskId,
            timeoutMs: this.runnerOptions.get(runner)?.totalTimeoutMs ?? runner.timeoutMs,
          });
        } else {
          this.cancelledTasks++;
          this.emitter.emit("task:cancel", {
            taskId: runner.taskId,
            reason: "Task cancelled while waiting for idle",
          });
        }
        this.checkIdle();
      }
    };
  }

  /**
   * Pumps the queue by picking pending tasks and executing them
   * as long as concurrency capacity is available, minIntervalMs is respected,
   * and queue is not paused.
   */
  private pump(): void {
    if (this._isPaused || this.queue.length === 0 || this.activeRunners.size >= this._concurrency) {
      return;
    }

    if (this.minIntervalMs > 0 && this.lastTaskStartTime > 0) {
      const now = Date.now();
      const elapsed = now - this.lastTaskStartTime;
      if (elapsed < this.minIntervalMs) {
        if (this.rateLimitTimer === undefined) {
          const delay = this.minIntervalMs - elapsed;
          this.rateLimitTimer = setTimeout(() => {
            this.rateLimitTimer = undefined;
            this.pump();
          }, delay);
        }
        return;
      }
    }

    while (!this._isPaused && this.activeRunners.size < this._concurrency && this.queue.length > 0) {
      if (this.minIntervalMs > 0 && this.lastTaskStartTime > 0) {
        const now = Date.now();
        const elapsed = now - this.lastTaskStartTime;
        if (elapsed < this.minIntervalMs) {
          if (this.rateLimitTimer === undefined) {
            const delay = this.minIntervalMs - elapsed;
            this.rateLimitTimer = setTimeout(() => {
              this.rateLimitTimer = undefined;
              this.pump();
            }, delay);
          }
          break;
        }
      }

      const runner = this.queue.shift();
      if (!runner) {
        break;
      }

      if (runner.state === ETaskState.CANCELLED || runner.state === ETaskState.TIMED_OUT) {
        continue;
      }

      // Fast-fail check with circuit breaker coordinator
      if (this.circuitBreakerCoordinator) {
        try {
          this.circuitBreakerCoordinator.checkAllowed();
        } catch (cbError) {
          this.failedTasks++;
          this.runnerOptions.delete(runner);
          this.emitter.emit("task:fail", {
            taskId: runner.taskId,
            attempt: runner.attempt,
            error: cbError,
            willRetry: false,
          });
          runner.reject(cbError);
          continue;
        }
      }

      this.activeRunners.add(runner);
      this.lastTaskStartTime = Date.now();

      // Execute runner without unhandled rejection risk
      void this.executeRunner(runner);

      if (this.minIntervalMs > 0) {
        if (this.queue.length > 0 && this.activeRunners.size < this._concurrency) {
          if (this.rateLimitTimer === undefined) {
            this.rateLimitTimer = setTimeout(() => {
              this.rateLimitTimer = undefined;
              this.pump();
            }, this.minIntervalMs);
          }
        }
        break;
      }
    }
  }

  /**
   * Internal execution of an active task runner.
   */
  private async executeRunner(runner: TaskRunner<unknown>): Promise<void> {
    const options = this.runnerOptions.get(runner);

    this.totalDispatched++;
    this.emitter.emit("task:start", {
      taskId: runner.taskId,
      attempt: runner.attempt,
    });

    try {
      const result = await runner.run();
      this.circuitBreakerCoordinator?.recordSuccess();
      this.adaptiveCoordinator?.recordDuration(runner.lastDurationMs);
      this.completedTasks++;
      this.activeRunners.delete(runner);
      this.runnerOptions.delete(runner);
      this.emitter.emit("task:complete", {
        taskId: runner.taskId,
        attempt: runner.attempt,
        durationMs: runner.lastDurationMs,
        result,
      });
      runner.resolve(result);
    } catch (error) {
      if (runner.state === ETaskState.CANCELLED) {
        this.cancelledTasks++;
        this.activeRunners.delete(runner);
        this.runnerOptions.delete(runner);
        this.emitter.emit("task:cancel", {
          taskId: runner.taskId,
          reason: error,
        });
        runner.reject(error);
        return;
      }

      const shouldRetry = await runner.canRetry(error, options?.retry);
      if (shouldRetry) {
        this.retriedTasks++;
        // Free concurrency slot immediately during backoff
        this.activeRunners.delete(runner);
        this.emitter.emit("task:fail", {
          taskId: runner.taskId,
          attempt: runner.attempt - 1,
          error,
          willRetry: true,
        });
        this.scheduleRetry(runner, options);
        return;
      }

      // Record permanent failure in circuit breaker
      if (this.circuitBreakerCoordinator && !(error instanceof AhkoCircuitBreakerOpenError)) {
        this.circuitBreakerCoordinator.recordFailure(error);
      }

      // Record duration in adaptive coordinator
      this.adaptiveCoordinator?.recordDuration(runner.lastDurationMs);

      if (runner.state === ETaskState.TIMED_OUT || error instanceof AhkoTimeoutError) {
        this.timedOutTasks++;
        this.emitter.emit("task:timeout", {
          taskId: runner.taskId,
          timeoutMs: options?.totalTimeoutMs ?? runner.timeoutMs,
        });
      } else {
        this.failedTasks++;
      }
      this.activeRunners.delete(runner);
      this.runnerOptions.delete(runner);
      this.emitter.emit("task:fail", {
        taskId: runner.taskId,
        attempt: runner.attempt,
        error,
        willRetry: false,
      });
      runner.reject(error);
    } finally {
      this.pump();
      this.checkIdle();
    }
  }

  /**
   * Schedules a retry attempt following backoff delay,
   * without holding a concurrency slot.
   */
  private scheduleRetry(runner: TaskRunner<unknown>, options?: IScheduleOptions): void {
    const backoffDelay = calculateBackoff(runner.attempt - 1, options?.retry);

    if (backoffDelay === 0) {
      runner.onCancel = () => {
        const index = this.queue.indexOf(runner);
        if (index !== -1) {
          this.queue.splice(index, 1);
          if (runner.totalTimedOut || runner.state === ETaskState.TIMED_OUT) {
            this.timedOutTasks++;
            this.emitter.emit("task:timeout", {
              taskId: runner.taskId,
              timeoutMs: options?.totalTimeoutMs ?? runner.timeoutMs,
            });
          } else {
            this.cancelledTasks++;
            this.emitter.emit("task:cancel", {
              taskId: runner.taskId,
              reason: "Task cancelled while queued",
            });
          }
          this.checkIdle();
        }
      };
      this.insertIntoQueue(runner);
      this.pump();
      return;
    }

    const retryEntry: IRetryEntry = {
      runner,
      timerId: setTimeout(() => {
        this.retryEntries.delete(retryEntry);
        if (runner.state === ETaskState.CANCELLED || runner.state === ETaskState.TIMED_OUT) {
          return;
        }

        runner.onCancel = () => {
          const index = this.queue.indexOf(runner);
          if (index !== -1) {
            this.queue.splice(index, 1);
            if (runner.totalTimedOut || runner.state === ETaskState.TIMED_OUT) {
              this.timedOutTasks++;
              this.emitter.emit("task:timeout", {
                taskId: runner.taskId,
                timeoutMs: options?.totalTimeoutMs ?? runner.timeoutMs,
              });
            } else {
              this.cancelledTasks++;
              this.emitter.emit("task:cancel", {
                taskId: runner.taskId,
                reason: "Task cancelled while queued",
              });
            }
            this.checkIdle();
          }
        };

        this.insertIntoQueue(runner);
        this.pump();
      }, backoffDelay),
    };

    this.retryEntries.add(retryEntry);

    runner.onCancel = () => {
      if (this.retryEntries.has(retryEntry)) {
        clearTimeout(retryEntry.timerId);
        this.retryEntries.delete(retryEntry);
        if (runner.totalTimedOut || runner.state === ETaskState.TIMED_OUT) {
          this.timedOutTasks++;
          this.emitter.emit("task:timeout", {
            taskId: runner.taskId,
            timeoutMs: options?.totalTimeoutMs ?? runner.timeoutMs,
          });
        } else {
          this.cancelledTasks++;
          this.emitter.emit("task:cancel", {
            taskId: runner.taskId,
            reason: "Task cancelled during retry backoff",
          });
        }
        this.checkIdle();
      }
    };
  }

  /**
   * Checks whether the scheduler has transitioned to idle and notifies listeners/resolvers.
   */
  public checkIdle(): void {
    if (this.isIdle()) {
      if (this.idleResolvers.size > 0) {
        for (const resolve of this.idleResolvers) {
          resolve();
        }
        this.idleResolvers.clear();
      }
      this.emitter.emit("idle", { timestamp: Date.now() });
    }
  }

  /**
   * Checks whether the scheduler is currently idle (no active runners and no pending tasks).
   *
   * @returns True if completely idle, false otherwise.
   */
  public isIdle(): boolean {
    return (
      this.activeRunners.size === 0 &&
      this.queue.length === 0 &&
      this.delayedEntries.size === 0 &&
      this.idleEntries.size === 0 &&
      this.retryEntries.size === 0 &&
      this.debounceCoordinator.size === 0 &&
      this.throttleCoordinator.size === 0
    );
  }

  /**
   * Returns a promise that resolves once the scheduler has processed all tasks and is idle.
   *
   * @returns Promise resolving when idle.
   */
  public onIdle(): Promise<void> {
    if (this.isIdle()) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.idleResolvers.add(resolve);
    });
  }

  /**
   * Clears all pending and waiting tasks from the scheduler, cancelling their runners.
   * Active tasks currently in flight will continue to run to completion or abort via signal.
   */
  public clear(): void {
    while (this.queue.length > 0) {
      const runner = this.queue.shift();
      if (runner && runner.state !== ETaskState.CANCELLED && runner.state !== ETaskState.TIMED_OUT) {
        runner.cancel("Scheduler cleared");
        this.cancelledTasks++;
        this.emitter.emit("task:cancel", { taskId: runner.taskId, reason: "Scheduler cleared" });
      }
    }

    for (const entry of this.delayedEntries.values()) {
      clearTimeout(entry.timerId);
      entry.runner.cancel("Scheduler cleared");
      this.cancelledTasks++;
      this.emitter.emit("task:cancel", { taskId: entry.runner.taskId, reason: "Scheduler cleared" });
    }
    this.delayedEntries.clear();

    for (const entry of this.idleEntries.values()) {
      entry.handle.cancel();
      entry.runner.cancel("Scheduler cleared");
      this.cancelledTasks++;
      this.emitter.emit("task:cancel", { taskId: entry.runner.taskId, reason: "Scheduler cleared" });
    }
    this.idleEntries.clear();

    for (const entry of this.retryEntries.values()) {
      clearTimeout(entry.timerId);
      entry.runner.cancel("Scheduler cleared");
      this.cancelledTasks++;
      this.emitter.emit("task:cancel", { taskId: entry.runner.taskId, reason: "Scheduler cleared" });
    }
    this.retryEntries.clear();

    this.debounceCoordinator.clear();
    this.throttleCoordinator.clear();

    if (this.rateLimitTimer !== undefined) {
      clearTimeout(this.rateLimitTimer);
      this.rateLimitTimer = undefined;
    }

    this.checkIdle();
  }

  /**
   * Returns telemetry snapshot for the scheduler.
   *
   * @returns Frozen snapshot of current task metrics.
   */
  public getStats(): IAhkoStats {
    return Object.freeze({
      activeTasks: this.activeRunners.size,
      pendingTasks:
        this.queue.length +
        this.delayedEntries.size +
        this.idleEntries.size +
        this.retryEntries.size +
        this.debounceCoordinator.size +
        this.throttleCoordinator.size,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      cancelledTasks: this.cancelledTasks,
      timedOutTasks: this.timedOutTasks,
      retriedTasks: this.retriedTasks,
      totalDispatched: this.totalDispatched,
      capacity: this._concurrency,
      isPaused: this._isPaused,
      circuitState: this.circuitBreakerCoordinator?.state,
      adaptive: this.adaptiveCoordinator?.getStats(),
    });
  }
}
