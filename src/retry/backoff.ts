import type { IRetryOptions } from "../models/retry.model.js";

/**
 * Default base delay for backoff calculations in milliseconds.
 */
export const DEFAULT_BASE_DELAY = 250;

/**
 * Default maximum delay ceiling for backoff calculations in milliseconds.
 */
export const DEFAULT_MAX_DELAY = 10_000;

/**
 * Computes backoff delay in milliseconds for a retry attempt based on configured policy.
 *
 * @param attempt - 1-based index of the attempt that failed (1 for first failure, 2 for second, etc.).
 * @param options - Retry configuration options.
 * @param randomFn - Injectable random generator function (defaults to Math.random) for deterministic testing.
 * @returns Delay duration in milliseconds before next attempt.
 */
export function calculateBackoff(
  attempt: number,
  options?: IRetryOptions,
  randomFn: () => number = Math.random
): number {
  const backoff = options?.backoff ?? "exponential";

  if (backoff === "none") {
    return 0;
  }

  const baseDelay =
    typeof options?.baseDelay === "number" && !Number.isNaN(options.baseDelay) && options.baseDelay >= 0
      ? options.baseDelay
      : DEFAULT_BASE_DELAY;

  const maxDelay =
    typeof options?.maxDelay === "number" && !Number.isNaN(options.maxDelay) && options.maxDelay >= baseDelay
      ? options.maxDelay
      : Math.max(DEFAULT_MAX_DELAY, baseDelay);

  let calculatedDelay: number;

  if (backoff === "linear") {
    calculatedDelay = baseDelay * Math.max(1, attempt);
  } else {
    // exponential: baseDelay * 2^(attempt - 1)
    const exponent = Math.max(0, attempt - 1);
    // Prevent 2^exponent overflow
    const factor = exponent > 30 ? 2 ** 30 : 2 ** exponent;
    calculatedDelay = baseDelay * factor;
  }

  const cappedDelay = Math.min(calculatedDelay, maxDelay);

  if (options?.jitter) {
    // Full jitter: uniformly random between 0 and cappedDelay
    return Math.floor(randomFn() * (cappedDelay + 1));
  }

  return Math.floor(cappedDelay);
}
