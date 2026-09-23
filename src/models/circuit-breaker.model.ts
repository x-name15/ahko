/**
 * Discrete lifecycle states of the circuit breaker.
 */
export enum ECircuitState {
  /** Normal operation: calls pass through to execution */
  CLOSED = "closed",
  /** Failure threshold exceeded: calls fast-fail immediately */
  OPEN = "open",
  /** Cool-down timer elapsed: trial call allowed to test recovery */
  HALF_OPEN = "half_open",
}

/** Union type representing circuit breaker states */
export type TCircuitState = `${ECircuitState}`;

/**
 * Configuration options for the circuit breaker policy.
 */
export interface ICircuitBreakerOptions {
  /**
   * Number of consecutive task failures required to trip the circuit to OPEN state.
   * Must be an integer greater than or equal to 1.
   */
  failureThreshold: number;

  /**
   * Time in milliseconds the circuit remains OPEN before transitioning to HALF_OPEN
   * to attempt a recovery trial call. Must be a positive finite number.
   */
  resetTimeoutMs: number;
}

/**
 * Telemetry snapshot of circuit breaker status.
 */
export interface ICircuitBreakerStats {
  /** Current state of the breaker */
  state: ECircuitState;
  /** Number of consecutive errors recorded */
  consecutiveFailures: number;
  /** Timestamp in ms when the breaker tripped to OPEN, if open */
  lastFailureTime?: number;
}
