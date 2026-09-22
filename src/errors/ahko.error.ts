/**
 * Base error class for all errors originating from the Ahko scheduler.
 */
export class AhkoError extends Error {
  /**
   * Creates a new AhkoError instance.
   *
   * @param message - Descriptive error message.
   * @param options - Standard Error options including cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AhkoError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
