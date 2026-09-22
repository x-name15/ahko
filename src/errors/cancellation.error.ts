import { AhkoError } from "./ahko.error.js";

/**
 * Thrown when a task is cancelled before or during execution.
 */
export class AhkoCancellationError extends AhkoError {
  /**
   * Creates a new AhkoCancellationError.
   *
   * @param message - Reason for cancellation.
   * @param options - Standard Error options including cause.
   */
  constructor(message = "Task was cancelled", options?: ErrorOptions) {
    super(message, options);
    this.name = "AhkoCancellationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
