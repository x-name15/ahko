import { AhkoCircuitBreakerOpenError } from "../errors/circuit-breaker.error.js";
import { AhkoConfigurationError } from "../errors/configuration.error.js";
import {
  ECircuitState,
  type ICircuitBreakerOptions,
  type ICircuitBreakerStats,
} from "../models/circuit-breaker.model.js";

/**
 * Manages circuit breaker failure tracking, state transitions, and fast-fail enforcement.
 *
 * Implements standard Martin Fowler Circuit Breaker state machine:
 * - CLOSED: All operations execute normally.
 * - OPEN: All operations fast-fail immediately with AhkoCircuitBreakerOpenError.
 * - HALF_OPEN: Probe execution allowed to verify recovery.
 */
export class CircuitBreakerCoordinator {
  private _state = ECircuitState.CLOSED;
  private _consecutiveFailures = 0;
  private _lastFailureTime: number | undefined;
  public readonly failureThreshold: number;
  public readonly resetTimeoutMs: number;

  /**
   * Initializes a new CircuitBreakerCoordinator.
   *
   * @param options - Configuration options for threshold and cool-down window.
   * @throws {AhkoConfigurationError} If options are invalid.
   */
  constructor(options: ICircuitBreakerOptions) {
    if (
      typeof options.failureThreshold !== "number" ||
      Number.isNaN(options.failureThreshold) ||
      !Number.isInteger(options.failureThreshold) ||
      options.failureThreshold < 1
    ) {
      throw new AhkoConfigurationError(
        `Invalid failureThreshold "${options.failureThreshold}". failureThreshold must be an integer greater than or equal to 1.`
      );
    }

    if (
      typeof options.resetTimeoutMs !== "number" ||
      Number.isNaN(options.resetTimeoutMs) ||
      !Number.isFinite(options.resetTimeoutMs) ||
      options.resetTimeoutMs <= 0
    ) {
      throw new AhkoConfigurationError(
        `Invalid resetTimeoutMs "${options.resetTimeoutMs}". resetTimeoutMs must be a positive finite number greater than 0.`
      );
    }

    this.failureThreshold = options.failureThreshold;
    this.resetTimeoutMs = options.resetTimeoutMs;
  }

  /** Current state of the circuit breaker */
  public get state(): ECircuitState {
    this.refreshState();
    return this._state;
  }

  /**
   * Checks whether an execution is currently allowed.
   * If the circuit is OPEN and cool-down has not elapsed, fast-fails immediately.
   *
   * @throws {AhkoCircuitBreakerOpenError} If the circuit is currently OPEN.
   */
  public checkAllowed(): void {
    this.refreshState();

    if (this._state === ECircuitState.OPEN) {
      const remainingMs = this._lastFailureTime
        ? Math.max(0, this.resetTimeoutMs - (Date.now() - this._lastFailureTime))
        : this.resetTimeoutMs;

      throw new AhkoCircuitBreakerOpenError(
        `Circuit breaker is open. Fast-failing task execution. Remaining cool-down: ${remainingMs}ms.`,
        {
          resetTimeoutMs: remainingMs,
          trippedAt: this._lastFailureTime,
          consecutiveFailures: this._consecutiveFailures,
        }
      );
    }
  }

  /**
   * Records a successful task execution.
   * Heals HALF_OPEN state back to CLOSED and resets consecutive failure counters.
   */
  public recordSuccess(): void {
    this._consecutiveFailures = 0;
    this._state = ECircuitState.CLOSED;
  }

  /**
   * Records a failed task execution.
   * Trips CLOSED to OPEN when threshold is met, or re-trips HALF_OPEN immediately.
   *
   * @param _error - Optional error that caused the failure.
   */
  public recordFailure(_error?: unknown): void {
    this._consecutiveFailures++;
    this._lastFailureTime = Date.now();

    if (this._state === ECircuitState.HALF_OPEN) {
      this._state = ECircuitState.OPEN;
      return;
    }

    if (this._consecutiveFailures >= this.failureThreshold) {
      this._state = ECircuitState.OPEN;
    }
  }

  /**
   * Evaluates if enough time has passed to transition from OPEN to HALF_OPEN.
   */
  private refreshState(): void {
    if (this._state === ECircuitState.OPEN && this._lastFailureTime !== undefined) {
      const elapsed = Date.now() - this._lastFailureTime;
      if (elapsed >= this.resetTimeoutMs) {
        this._state = ECircuitState.HALF_OPEN;
      }
    }
  }

  /**
   * Resets the circuit breaker back to initial CLOSED state.
   */
  public reset(): void {
    this._state = ECircuitState.CLOSED;
    this._consecutiveFailures = 0;
    this._lastFailureTime = undefined;
  }

  /**
   * Returns a snapshot of circuit breaker telemetry.
   */
  public getStats(): ICircuitBreakerStats {
    this.refreshState();
    return {
      state: this._state,
      consecutiveFailures: this._consecutiveFailures,
      lastFailureTime: this._lastFailureTime,
    };
  }
}
