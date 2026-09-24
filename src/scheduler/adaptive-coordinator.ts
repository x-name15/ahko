import { AhkoConfigurationError } from "../errors/configuration.error.js";
import type {
  IAdaptiveConcurrencyOptions,
  IAdaptiveStats,
} from "../models/adaptive.model.js";

/**
 * Controller implementing Additive Increase / Multiplicative Decrease (AIMD)
 * dynamic concurrency adjustment based on real-time task latency metrics.
 */
export class AdaptiveCoordinator {
  private _currentConcurrency: number;
  public readonly minConcurrency: number;
  public readonly maxConcurrency: number;
  public readonly targetLatencyMs: number;
  public readonly sampleWindowSize: number;
  public readonly backoffFactor: number;

  private recentDurations: number[] = [];
  private lastAverageLatencyMs = 0;
  private readonly onConcurrencyChange: (
    previous: number,
    current: number,
    reason: string
  ) => void;

  /**
   * Initializes a new AdaptiveCoordinator instance.
   *
   * @param options - Adaptive concurrency configuration options.
   * @param initialConcurrency - Starting scheduler concurrency limit.
   * @param onConcurrencyChange - Callback invoked when concurrency changes.
   * @throws {AhkoConfigurationError} If options are invalid.
   */
  constructor(
    options: IAdaptiveConcurrencyOptions,
    initialConcurrency: number,
    onConcurrencyChange: (previous: number, current: number, reason: string) => void
  ) {
    if (
      typeof options.targetLatencyMs !== "number" ||
      Number.isNaN(options.targetLatencyMs) ||
      !Number.isFinite(options.targetLatencyMs) ||
      options.targetLatencyMs <= 0
    ) {
      throw new AhkoConfigurationError(
        `Invalid targetLatencyMs "${options.targetLatencyMs}". targetLatencyMs must be a positive number greater than 0.`
      );
    }

    const min = options.minConcurrency ?? 1;
    if (typeof min !== "number" || Number.isNaN(min) || min < 1 || !Number.isInteger(min)) {
      throw new AhkoConfigurationError(
        `Invalid minConcurrency "${min}". minConcurrency must be an integer greater than or equal to 1.`
      );
    }

    const defaultMax = Number.isFinite(initialConcurrency)
      ? Math.max(min, initialConcurrency * 2)
      : Math.max(min, 10);
    const max = options.maxConcurrency ?? defaultMax;
    if (typeof max !== "number" || Number.isNaN(max) || max < min || !Number.isInteger(max)) {
      throw new AhkoConfigurationError(
        `Invalid maxConcurrency "${max}". maxConcurrency must be an integer greater than or equal to minConcurrency (${min}).`
      );
    }

    const windowSize = options.sampleWindowSize ?? 5;
    if (typeof windowSize !== "number" || Number.isNaN(windowSize) || windowSize < 1 || !Number.isInteger(windowSize)) {
      throw new AhkoConfigurationError(
        `Invalid sampleWindowSize "${windowSize}". sampleWindowSize must be an integer greater than or equal to 1.`
      );
    }

    const factor = options.backoffFactor ?? 0.7;
    if (typeof factor !== "number" || Number.isNaN(factor) || factor <= 0.1 || factor >= 0.99) {
      throw new AhkoConfigurationError(
        `Invalid backoffFactor "${factor}". backoffFactor must be a number between 0.1 and 0.99.`
      );
    }

    this.minConcurrency = min;
    this.maxConcurrency = max;
    this.targetLatencyMs = options.targetLatencyMs;
    this.sampleWindowSize = windowSize;
    this.backoffFactor = factor;
    this.onConcurrencyChange = onConcurrencyChange;

    const clampedInitial = Number.isFinite(initialConcurrency)
      ? Math.min(Math.max(initialConcurrency, min), max)
      : min;
    this._currentConcurrency = clampedInitial;
  }

  /**
   * Current effective concurrency limit dictated by the adaptive controller.
   */
  public get currentConcurrency(): number {
    return this._currentConcurrency;
  }

  /**
   * Manually overrides the current concurrency within [minConcurrency, maxConcurrency].
   *
   * @param concurrency - New concurrency limit to set.
   */
  public setConcurrency(concurrency: number): void {
    const clamped = Math.min(Math.max(concurrency, this.minConcurrency), this.maxConcurrency);
    if (clamped !== this._currentConcurrency) {
      const prev = this._currentConcurrency;
      this._currentConcurrency = clamped;
      this.onConcurrencyChange(prev, clamped, "Manual concurrency override");
    }
  }

  /**
   * Records a task execution duration sample and triggers AIMD adjustment if window is filled.
   *
   * @param durationMs - Execution duration in milliseconds of the completed task.
   */
  public recordDuration(durationMs: number): void {
    this.recentDurations.push(durationMs);

    if (this.recentDurations.length < this.sampleWindowSize) {
      return;
    }

    const total = this.recentDurations.reduce((sum, val) => sum + val, 0);
    const average = total / this.recentDurations.length;
    this.lastAverageLatencyMs = average;
    this.recentDurations = [];

    if (average > this.targetLatencyMs) {
      // Multiplicative Decrease (back off)
      const decreased = Math.max(
        this.minConcurrency,
        Math.floor(this._currentConcurrency * this.backoffFactor)
      );

      if (decreased !== this._currentConcurrency) {
        const prev = this._currentConcurrency;
        this._currentConcurrency = decreased;
        this.onConcurrencyChange(
          prev,
          decreased,
          `Average latency (${Math.round(average)}ms) exceeded target (${this.targetLatencyMs}ms). Scaled down.`
        );
      }
    } else if (average < this.targetLatencyMs * 0.75) {
      // Additive Increase (scale up)
      const increased = Math.min(this.maxConcurrency, this._currentConcurrency + 1);

      if (increased !== this._currentConcurrency) {
        const prev = this._currentConcurrency;
        this._currentConcurrency = increased;
        this.onConcurrencyChange(
          prev,
          increased,
          `Average latency (${Math.round(average)}ms) below target threshold. Scaled up.`
        );
      }
    }
  }

  /**
   * Returns a snapshot of adaptive telemetry metrics.
   */
  public getStats(): IAdaptiveStats {
    return {
      currentConcurrency: this._currentConcurrency,
      averageLatencyMs: this.lastAverageLatencyMs,
      samplesRecorded: this.recentDurations.length,
    };
  }
}
