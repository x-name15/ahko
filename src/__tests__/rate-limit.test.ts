import { describe, expect, it } from "vitest";
import { Ahko } from "../ahko.js";
import { AhkoConfigurationError } from "../errors/configuration.error.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("Milestone 0.5.0 — Rate Limiting (minIntervalMs)", () => {
  it("paces consecutive task start times by at least minIntervalMs", async () => {
    const ahko = new Ahko({ concurrency: 5, minIntervalMs: 50 });
    const startTimes: number[] = [];

    const task = async (index: number) => {
      startTimes.push(Date.now());
      await sleep(10);
      return index;
    };

    // Schedule 3 tasks simultaneously
    const p1 = ahko.schedule(() => task(1));
    const p2 = ahko.schedule(() => task(2));
    const p3 = ahko.schedule(() => task(3));

    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual([1, 2, 3]);

    expect(startTimes.length).toBe(3);

    const diff1 = startTimes[1] - startTimes[0];
    const diff2 = startTimes[2] - startTimes[1];

    // Each consecutive task start must be paced by >= 40ms (accounting for timer jitter)
    expect(diff1).toBeGreaterThanOrEqual(40);
    expect(diff2).toBeGreaterThanOrEqual(40);

    const stats = ahko.stats();
    expect(stats.completedTasks).toBe(3);
    expect(stats.activeTasks).toBe(0);
  });

  it("throws AhkoConfigurationError on invalid minIntervalMs", () => {
    expect(() => new Ahko({ minIntervalMs: -10 })).toThrow(AhkoConfigurationError);
    expect(() => new Ahko({ minIntervalMs: Number.NaN })).toThrow(AhkoConfigurationError);
    expect(() => new Ahko({ minIntervalMs: Number.POSITIVE_INFINITY })).toThrow(AhkoConfigurationError);
  });
});
