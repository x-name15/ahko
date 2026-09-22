import { AhkoError } from "./ahko.error.js";

/**
 * Thrown when an internal queue invariant is violated or queue limits are breached.
 */
export class AhkoQueueError extends AhkoError {
  /**
   * Creates a new AhkoQueueError.
   *
   * @param message - Explanation of the queue failure.
   * @param options - Standard Error options including cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AhkoQueueError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
