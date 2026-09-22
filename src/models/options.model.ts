import type { IRetryOptions } from "./retry.model.js";
import type { TScheduleStrategy } from "./strategy.model.js";

/**
 * Options to configure a specific scheduled task.
 */
export interface IScheduleOptions {
  /**
   * Scheduling strategy to use.
   * @default "immediate"
   */
  strategy?: TScheduleStrategy;

  /**
   * Delay in milliseconds before queuing or executing the task.
   * Applicable when strategy is "delay".
   */
  delay?: number;

  /**
   * Maximum time in milliseconds to wait for an idle opportunity before
   * forcing execution into the queue. Applicable when strategy is "idle".
   * Forwards to requestIdleCallback({ timeout }) when running in browser runtimes.
   */
  idleTimeout?: number;

  /**
   * Automatic retry options for transient failure handling.
   */
  retry?: IRetryOptions;

  /**
   * Maximum execution time in milliseconds allowed per attempt.
   * If the task does not complete within this duration, execution
   * is aborted and the task rejects with an AhkoTimeoutError.
   * Must be a positive finite number greater than 0 if provided.
   */
  timeoutMs?: number;

  /**
   * External cancellation signal.
   * If aborted before start, the task is removed from the queue without execution.
   * If aborted while running, the abort event is propagated to the task context signal.
   */
  signal?: AbortSignal;
}

/**
 * Global configuration options for the Ahko scheduler instance.
 */
export interface IAhkoOptions {
  /**
   * Maximum number of tasks allowed to execute concurrently.
   * Must be an integer greater than or equal to 1, or Infinity.
   * @default Infinity
   */
  concurrency?: number;
}
