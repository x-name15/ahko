/**
 * Configuration options for Additive Increase / Multiplicative Decrease (AIMD) Adaptive Concurrency.
 */
export interface IAdaptiveConcurrencyOptions {
  /**
   * Target average task execution latency in milliseconds.
   * When measured latency exceeds this threshold, concurrency decreases multiplicatively.
   * When latency remains comfortably below, concurrency increases additively.
   * Must be a positive finite number greater than 0.
   */
  targetLatencyMs: number;

  /**
   * Minimum concurrency floor allowed during backoff / chill mode.
   * Must be an integer greater than or equal to 1.
   * @default 1
   */
  minConcurrency?: number;

  /**
   * Maximum concurrency ceiling allowed during scaling.
   * Must be greater than or equal to `minConcurrency`.
   * Defaults to twice the initial scheduler concurrency, or 10 if initial is Infinity.
   */
  maxConcurrency?: number;

  /**
   * Number of task execution samples to accumulate before calculating moving average and adjusting capacity.
   * Must be an integer greater than or equal to 1.
   * @default 5
   */
  sampleWindowSize?: number;

  /**
   * Multiplicative factor applied to reduce concurrency when latency threshold is violated.
   * Must be a number between 0.1 and 0.95.
   * @default 0.7
   */
  backoffFactor?: number;
}

/**
 * Real-time telemetry snapshot of the adaptive concurrency controller.
 */
export interface IAdaptiveStats {
  /** Current effective concurrency limit */
  currentConcurrency: number;

  /** Moving average execution latency in milliseconds across the latest sample window */
  averageLatencyMs: number;

  /** Total duration samples recorded in the current evaluation window */
  samplesRecorded: number;
}
