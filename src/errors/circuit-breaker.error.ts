import { AhkoError } from "./ahko.error.js";

/**
 * Options describing the circuit breaker open state.
 */
export interface IAhkoCircuitBreakerErrorOptions {
  /** Time remaining in milliseconds before the circuit attempts half-open trial */
  resetTimeoutMs?: number;
  /** Timestamp when the circuit tripped open */
  trippedAt?: number;
  /** Consecutive failures that caused the trip */
  consecutiveFailures?: number;
}

/**
 * Thrown when attempting to execute a task while the scheduler's circuit breaker is in OPEN state.
 */
export class AhkoCircuitBreakerOpenError extends AhkoError {
  /** Time remaining in milliseconds before trial execution is allowed */
  public readonly resetTimeoutMs?: number;

  /** Timestamp when the circuit tripped open */
  public readonly trippedAt?: number;

  /** Total consecutive failures that caused the trip */
  public readonly consecutiveFailures?: number;

  constructor(
    message = "Circuit breaker is open. Fast-failing task execution to protect downstream resources.",
    options?: IAhkoCircuitBreakerErrorOptions
  ) {
    super(message);
    this.name = "AhkoCircuitBreakerOpenError";
    this.resetTimeoutMs = options?.resetTimeoutMs;
    this.trippedAt = options?.trippedAt;
    this.consecutiveFailures = options?.consecutiveFailures;
  }
}
