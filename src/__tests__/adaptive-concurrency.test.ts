import { describe, it, expect, vi } from "vitest";
import { Ahko } from "../ahko.js";
import { AdaptiveCoordinator } from "../scheduler/adaptive-coordinator.js";
import { AhkoConfigurationError } from "../errors/configuration.error.js";

describe("Adaptive Concurrency (AIMD Auto-Chill mode)", () => {
  it("should validate adaptive options and throw AhkoConfigurationError for invalid parameters", () => {
    // @ts-expect-error Testing invalid targetLatencyMs
    expect(() => new AdaptiveCoordinator({ targetLatencyMs: 0 }, 5, vi.fn())).toThrow(
      AhkoConfigurationError
    );
    expect(
      () =>
        new AdaptiveCoordinator(
          // @ts-expect-error Testing invalid backoffFactor
          { targetLatencyMs: 100, backoffFactor: 1.5 },
          5,
          vi.fn()
        )
    ).toThrow(AhkoConfigurationError);
    expect(
      () =>
        new AdaptiveCoordinator(
          { targetLatencyMs: 100, minConcurrency: 10, maxConcurrency: 5 },
          5,
          vi.fn()
        )
    ).toThrow(AhkoConfigurationError);
  });

  it("should multiplicatively decrease concurrency when latency exceeds targetLatencyMs", async () => {
    const changes: Array<{ previous: number; current: number; reason: string }> = [];

    const ahko = new Ahko({
      concurrency: 6,
      adaptive: {
        targetLatencyMs: 30,
        sampleWindowSize: 3,
        backoffFactor: 0.5,
        minConcurrency: 1,
      },
    });

    ahko.on("concurrency:change", (event) => {
      changes.push({
        previous: event.previousConcurrency,
        current: event.currentConcurrency,
        reason: event.reason,
      });
    });

    // Schedule 3 slow tasks (taking 60ms, which is > targetLatencyMs of 30ms)
    await Promise.all([
      ahko.schedule(() => new Promise((resolve) => setTimeout(resolve, 60))),
      ahko.schedule(() => new Promise((resolve) => setTimeout(resolve, 60))),
      ahko.schedule(() => new Promise((resolve) => setTimeout(resolve, 60))),
    ]);

    // After 3 samples, AIMD triggers multiplicative decrease: 6 * 0.5 = 3
    expect(ahko.concurrency).toBe(3);
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes[0].previous).toBe(6);
    expect(changes[0].current).toBe(3);
    expect(changes[0].reason).toContain("Scaled down");

    const stats = ahko.stats();
    expect(stats.adaptive).toBeDefined();
    expect(stats.adaptive?.currentConcurrency).toBe(3);
  });

  it("should additively increase concurrency when latency stays below targetLatencyMs", async () => {
    const changes: Array<{ previous: number; current: number; reason: string }> = [];

    const ahko = new Ahko({
      concurrency: 2,
      adaptive: {
        targetLatencyMs: 100,
        sampleWindowSize: 3,
        maxConcurrency: 5,
      },
    });

    ahko.on("concurrency:change", (event) => {
      changes.push({
        previous: event.previousConcurrency,
        current: event.currentConcurrency,
        reason: event.reason,
      });
    });

    // Schedule 3 fast tasks (< 100ms)
    await Promise.all([
      ahko.schedule(() => new Promise((resolve) => setTimeout(resolve, 10))),
      ahko.schedule(() => new Promise((resolve) => setTimeout(resolve, 10))),
      ahko.schedule(() => new Promise((resolve) => setTimeout(resolve, 10))),
    ]);

    // After 3 fast samples, AIMD triggers additive increase: 2 + 1 = 3
    expect(ahko.concurrency).toBe(3);
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes[0].previous).toBe(2);
    expect(changes[0].current).toBe(3);
    expect(changes[0].reason).toContain("Scaled up");
  });

  it("should strictly respect minConcurrency floor during continuous congestion", async () => {
    const ahko = new Ahko({
      concurrency: 2,
      adaptive: {
        targetLatencyMs: 10,
        sampleWindowSize: 2,
        backoffFactor: 0.5,
        minConcurrency: 1,
      },
    });

    // 4 slow tasks -> 2 windows of congestion
    await Promise.all([
      ahko.schedule(() => new Promise((resolve) => setTimeout(resolve, 30))),
      ahko.schedule(() => new Promise((resolve) => setTimeout(resolve, 30))),
    ]);
    expect(ahko.concurrency).toBe(1);

    await Promise.all([
      ahko.schedule(() => new Promise((resolve) => setTimeout(resolve, 30))),
      ahko.schedule(() => new Promise((resolve) => setTimeout(resolve, 30))),
    ]);
    // Floor is 1, should not drop below 1
    expect(ahko.concurrency).toBe(1);
  });
});
