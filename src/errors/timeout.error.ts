import { AhkoError } from "./ahko.error.js";

/**
 * Thrown when a task exceeds its allotted timeout duration.
 */
export class AhkoTimeoutError extends AhkoError {
  /**
   * Creates a new AhkoTimeoutError.
   *
   * @param message - Explanation of timeout expiry.
   * @param options - Standard Error options including cause.
   */
  constructor(message = "Task execution timed out", options?: ErrorOptions) {
    super(message, options);
    this.name = "AhkoTimeoutError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
