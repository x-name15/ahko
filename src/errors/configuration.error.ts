import { AhkoError } from "./ahko.error.js";

/**
 * Thrown when invalid configuration or scheduling options are provided.
 */
export class AhkoConfigurationError extends AhkoError {
  /**
   * Creates a new AhkoConfigurationError.
   *
   * @param message - Explanation of the invalid configuration parameter.
   * @param options - Standard Error options including cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AhkoConfigurationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
