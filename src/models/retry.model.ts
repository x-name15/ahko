/**
 * Supported backoff algorithms for retry attempts.
 */
export type TRetryBackoff = "exponential" | "linear" | "none";

/**
 * Predicate function determining whether a specific error warrants a retry attempt.
 *
 * @param error - The error thrown by the failed attempt.
 * @param attempt - The 1-based index of the attempt that just failed.
 * @returns Boolean or Promise<boolean> indicating whether to retry.
 */
export type TRetryPredicate = (
  error: unknown,
  attempt: number
) => boolean | Promise<boolean>;

/**
 * Options configuring automatic retry behavior for a scheduled task.
 */
export interface IRetryOptions {
  /**
   * Total number of execution attempts allowed (initial attempt + retries).
   * For example, `attempts: 3` means 1 initial execution plus up to 2 retries.
   * Must be an integer greater than or equal to 1.
   * @default 1
   */
  attempts: number;

  /**
   * Backoff algorithm to apply between failed attempts.
   * @default "exponential"
   */
  backoff?: TRetryBackoff;

  /**
   * Base delay in milliseconds used as the starting multiplier for backoff.
   * Must be a non-negative number.
   * @default 250
   */
  baseDelay?: number;

  /**
   * Maximum backoff delay cap in milliseconds to prevent unbounded growth.
   * Must be a non-negative number greater than or equal to baseDelay.
   * @default 10000
   */
  maxDelay?: number;

  /**
   * Whether to apply full jitter randomization to the calculated delay
   * to distribute retry waves across concurrent tasks.
   * @default false
   */
  jitter?: boolean;

  /**
   * Optional predicate filter to evaluate whether an error is retryable.
   * If not provided, all errors (except cancellations) trigger a retry.
   */
  shouldRetry?: TRetryPredicate;
}
