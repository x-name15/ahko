import { describe, expect, it } from "vitest";
import {
  AhkoCancellationError,
  AhkoConfigurationError,
  AhkoError,
  AhkoQueueError,
  AhkoTimeoutError,
} from "../index.js";

describe("Ahko Error Hierarchy", () => {
  it("should inherit from AhkoError and standard Error", () => {
    const customMessage = "Something went wrong";
    const baseError = new AhkoError(customMessage);

    expect(baseError).toBeInstanceOf(Error);
    expect(baseError).toBeInstanceOf(AhkoError);
    expect(baseError.name).toBe("AhkoError");
    expect(baseError.message).toBe(customMessage);
  });

  it("should create AhkoCancellationError with default and custom messages", () => {
    const defaultCancel = new AhkoCancellationError();
    expect(defaultCancel).toBeInstanceOf(AhkoError);
    expect(defaultCancel.name).toBe("AhkoCancellationError");
    expect(defaultCancel.message).toBe("Task was cancelled");

    const customReason = "User requested cancellation";
    const customCancel = new AhkoCancellationError(customReason);
    expect(customCancel.message).toBe(customReason);
  });

  it("should create AhkoConfigurationError", () => {
    const configError = new AhkoConfigurationError("Invalid concurrency parameter");
    expect(configError).toBeInstanceOf(AhkoError);
    expect(configError.name).toBe("AhkoConfigurationError");
  });

  it("should create AhkoQueueError", () => {
    const queueError = new AhkoQueueError("Queue overflow limit reached");
    expect(queueError).toBeInstanceOf(AhkoError);
    expect(queueError.name).toBe("AhkoQueueError");
  });

  it("should create AhkoTimeoutError", () => {
    const timeoutError = new AhkoTimeoutError();
    expect(timeoutError).toBeInstanceOf(AhkoError);
    expect(timeoutError.name).toBe("AhkoTimeoutError");
    expect(timeoutError.message).toBe("Task execution timed out");
  });
});
