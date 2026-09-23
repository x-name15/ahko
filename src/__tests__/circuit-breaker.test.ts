import { describe, expect, it } from "vitest";
import { Ahko } from "../ahko.js";
import { AhkoCircuitBreakerOpenError } from "../errors/circuit-breaker.error.js";
import { ECircuitState } from "../models/circuit-breaker.model.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Circuit Breaker Protection", () => {
  it("should initialize in CLOSED state and record failures towards failureThreshold", async () => {
    const ahko = new Ahko({
      concurrency: 1,
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeoutMs: 100,
      },
    });

    expect(ahko.circuitState).toBe(ECircuitState.CLOSED);

    // Fail task 1
    await expect(
      ahko.schedule(async () => {
        throw new Error("Downstream service unreachable");
      })
    ).rejects.toThrow("Downstream service unreachable");

    expect(ahko.circuitState).toBe(ECircuitState.CLOSED);

    // Fail task 2
    await expect(
      ahko.schedule(async () => {
        throw new Error("Downstream service timeout");
      })
    ).rejects.toThrow("Downstream service timeout");

    expect(ahko.circuitState).toBe(ECircuitState.CLOSED);

    // Fail task 3 -> trips the breaker to OPEN
    await expect(
      ahko.schedule(async () => {
        throw new Error("Downstream service 503");
      })
    ).rejects.toThrow("Downstream service 503");

    expect(ahko.circuitState).toBe(ECircuitState.OPEN);
    expect(ahko.stats().circuitState).toBe(ECircuitState.OPEN);
  });

  it("should fast-fail tasks immediately with AhkoCircuitBreakerOpenError while OPEN", async () => {
    const ahko = new Ahko({
      concurrency: 1,
      circuitBreaker: {
        failureThreshold: 2,
        resetTimeoutMs: 150,
      },
    });

    // Trip the circuit with 2 failures
    await expect(ahko.schedule(async () => { throw new Error("err1"); })).rejects.toThrow("err1");
    await expect(ahko.schedule(async () => { throw new Error("err2"); })).rejects.toThrow("err2");
    expect(ahko.circuitState).toBe(ECircuitState.OPEN);

    let executed = false;
    // Task scheduled while OPEN must fast-fail without running
    const promise = ahko.schedule(async () => {
      executed = true;
      return "never reached";
    });

    await expect(promise).rejects.toThrow(AhkoCircuitBreakerOpenError);
    expect(executed).toBe(false);
  });

  it("should transition to HALF_OPEN after resetTimeoutMs, recover on success, and re-trip on failure", async () => {
    const resetTimeoutMs = 80;
    const ahko = new Ahko({
      concurrency: 1,
      circuitBreaker: {
        failureThreshold: 2,
        resetTimeoutMs,
      },
    });

    // Trip to OPEN
    await expect(ahko.schedule(async () => { throw new Error("fail 1"); })).rejects.toThrow();
    await expect(ahko.schedule(async () => { throw new Error("fail 2"); })).rejects.toThrow();
    expect(ahko.circuitState).toBe(ECircuitState.OPEN);

    // Wait for resetTimeoutMs cool-down window
    await sleep(resetTimeoutMs + 20);

    // State should now be HALF_OPEN
    expect(ahko.circuitState).toBe(ECircuitState.HALF_OPEN);

    // Trial task succeeds -> heals to CLOSED
    const successResult = await ahko.schedule(async () => "recovered!");
    expect(successResult).toBe("recovered!");
    expect(ahko.circuitState).toBe(ECircuitState.CLOSED);

    // Trip again to test re-trip from HALF_OPEN
    await expect(ahko.schedule(async () => { throw new Error("fail again 1"); })).rejects.toThrow();
    await expect(ahko.schedule(async () => { throw new Error("fail again 2"); })).rejects.toThrow();
    expect(ahko.circuitState).toBe(ECircuitState.OPEN);

    await sleep(resetTimeoutMs + 20);
    expect(ahko.circuitState).toBe(ECircuitState.HALF_OPEN);

    // Trial task fails -> immediately re-trips back to OPEN
    await expect(ahko.schedule(async () => { throw new Error("trial failure"); })).rejects.toThrow("trial failure");
    expect(ahko.circuitState).toBe(ECircuitState.OPEN);
  });
});
