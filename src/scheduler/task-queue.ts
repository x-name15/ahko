import { AhkoConfigurationError } from "../errors/configuration.error.js";
import type { IScheduleOptions } from "../models/options.model.js";
import type { IAhkoStats } from "../models/stats.model.js";
import { ETaskState } from "../models/state.model.js";
import { EScheduleStrategy } from "../models/strategy.model.js";
import { IdleScheduler, type IIdleHandle } from "./idle-scheduler.js";
import { TaskRunner } from "./task-runner.js";

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
 * Memory-safe FIFO task queue managing concurrency allocation,
 * delayed scheduling, and task lifecycle counters.
 */
export class TaskQueue {
  /** Maximum concurrent active tasks */
  public readonly concurrency: number;

  /** Queue of pending task runners waiting for a concurrency slot */
  private readonly queue: TaskRunner<unknown>[] = [];

  /** Set of task runners currently executing */
  private readonly activeRunners = new Set<TaskRunner<unknown>>();

  /** Set of tasks currently in delay phase */
  private readonly delayedEntries = new Set<IDelayedEntry>();

  /** Set of tasks currently awaiting an idle opportunity */
  private readonly idleEntries = new Set<IIdleEntry>();

  /** Cumulative completed tasks counter */
  private completedTasks = 0;

  /** Cumulative failed tasks counter */
  private failedTasks = 0;

  /** Cumulative cancelled tasks counter */
  private cancelledTasks = 0;

  /** Cumulative timed out tasks counter */
  private timedOutTasks = 0;

  /**
   * Creates a new TaskQueue.
   *
   * @param concurrency - Maximum concurrent tasks (defaults to Infinity).
   * @throws {AhkoConfigurationError} If concurrency is less than 1 or not a valid number.
   */
  constructor(concurrency = Infinity) {
    if (Number.isNaN(concurrency) || concurrency < 1) {
      throw new AhkoConfigurationError(
        `Invalid concurrency "${concurrency}". Must be a number greater than or equal to 1.`
      );
    }
    this.concurrency = concurrency;
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
      strategy !== EScheduleStrategy.IDLE
    ) {
      throw new AhkoConfigurationError(
        `Unsupported schedule strategy "${String(strategy)}". Supported strategies: "immediate", "delay", "idle".`
      );
    }

    if (runner.state === ETaskState.CANCELLED) {
      this.cancelledTasks++;
      return runner.promise;
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
        this.cancelledTasks++;
      }
    };

    // Immediate strategy: add to pending queue and pump
    this.queue.push(runner as TaskRunner<unknown>);
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
        if (runner.state === ETaskState.CANCELLED) {
          return;
        }

        runner.onCancel = () => {
          const index = this.queue.indexOf(runner);
          if (index !== -1) {
            this.queue.splice(index, 1);
            this.cancelledTasks++;
          }
        };

        this.queue.push(runner);
        this.pump();
      }, delayMs),
    };

    this.delayedEntries.add(delayedEntry);

    runner.onCancel = () => {
      if (this.delayedEntries.has(delayedEntry)) {
        clearTimeout(delayedEntry.timerId);
        this.delayedEntries.delete(delayedEntry);
        this.cancelledTasks++;
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
      if (runner.state === ETaskState.CANCELLED) {
        return;
      }

      runner.onCancel = () => {
        const index = this.queue.indexOf(runner);
        if (index !== -1) {
          this.queue.splice(index, 1);
          this.cancelledTasks++;
        }
      };

      this.queue.push(runner);
      this.pump();
    }, idleTimeout);

    idleEntry = { runner, handle };
    this.idleEntries.add(idleEntry);

    runner.onCancel = () => {
      if (this.idleEntries.has(idleEntry)) {
        handle.cancel();
        this.idleEntries.delete(idleEntry);
        this.cancelledTasks++;
      }
    };
  }

  /**
   * Pumps the queue by picking pending tasks and executing them
   * as long as concurrency capacity is available.
   */
  private pump(): void {
    while (this.activeRunners.size < this.concurrency && this.queue.length > 0) {
      const runner = this.queue.shift();
      if (!runner) {
        break;
      }

      if (runner.state === ETaskState.CANCELLED) {
        continue;
      }

      this.activeRunners.add(runner);

      // Execute runner without unhandled rejection risk
      void this.executeRunner(runner);
    }
  }

  /**
   * Internal execution of an active task runner.
   * Settle caller promise strictly after stats and active status are updated.
   */
  private async executeRunner(runner: TaskRunner<unknown>): Promise<void> {
    try {
      const result = await runner.run();
      this.completedTasks++;
      this.activeRunners.delete(runner);
      runner.resolve(result);
    } catch (error) {
      if (runner.state === ETaskState.CANCELLED) {
        this.cancelledTasks++;
      } else if (runner.state === ETaskState.TIMED_OUT) {
        this.timedOutTasks++;
      } else {
        this.failedTasks++;
      }
      this.activeRunners.delete(runner);
      runner.reject(error);
    } finally {
      this.pump();
    }
  }

  /**
   * Returns telemetry snapshot for the scheduler.
   *
   * @returns Frozen snapshot of current task metrics.
   */
  public getStats(): IAhkoStats {
    return Object.freeze({
      activeTasks: this.activeRunners.size,
      pendingTasks: this.queue.length + this.delayedEntries.size + this.idleEntries.size,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      cancelledTasks: this.cancelledTasks,
      timedOutTasks: this.timedOutTasks,
      capacity: this.concurrency,
    });
  }
}
