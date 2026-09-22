import { AhkoError } from "./ahko.error.js";

/**
 * Options for constructing an AhkoTimeoutError.
 */
export interface IAhkoTimeoutErrorOptions extends ErrorOptions {
  /**
   * The timeout threshold in milliseconds that was exceeded.
   */
  timeoutMs?: number;
}

/**
 * Thrown when a task exceeds its allotted timeout duration.
 */
export class AhkoTimeoutError extends AhkoError {
  /**
   * The timeout threshold in milliseconds that was exceeded, if configured.
   */
  public readonly timeoutMs?: number;

  /**
   * Creates a new AhkoTimeoutError.
   *
   * @param message - Explanation of timeout expiry.
   * @param options - Standard Error options including optional timeoutMs and cause.
   */
  constructor(
    message = "Task execution timed out",
    options?: IAhkoTimeoutErrorOptions
  ) {
    super(message, options);
    this.name = "AhkoTimeoutError";
    this.timeoutMs = options?.timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
