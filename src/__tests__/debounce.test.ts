import { describe, expect, it } from "vitest";
import { Ahko } from "../ahko.js";
import { AhkoCancellationError } from "../errors/cancellation.error.js";
import { AhkoConfigurationError } from "../errors/configuration.error.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("Milestone 0.5.0 — Debounce & Promise Coalescing", () => {
  it("coalesces multiple rapid calls with the same key into a single execution", async () => {
    const ahko = new Ahko();
    let executionCount = 0;

    const task = async () => {
      executionCount++;
      return `result_${executionCount}`;
    };

    // Dispatch 5 rapid calls under the same key
    const p1 = ahko.schedule(task, { strategy: "debounce", key: "search_input", waitMs: 50 });
    const p2 = ahko.schedule(task, { strategy: "debounce", key: "search_input", waitMs: 50 });
    const p3 = ahko.schedule(task, { strategy: "debounce", key: "search_input", waitMs: 50 });
    const p4 = ahko.schedule(task, { strategy: "debounce", key: "search_input", waitMs: 50 });
    const p5 = ahko.schedule(task, { strategy: "debounce", key: "search_input", waitMs: 50 });

    // Promise coalescing: all 5 return the exact same promise reference
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
    expect(p3).toBe(p4);
    expect(p4).toBe(p5);

    const [r1, r2, r3, r4, r5] = await Promise.all([p1, p2, p3, p4, p5]);

    expect(executionCount).toBe(1);
    expect(r1).toBe("result_1");
    expect(r2).toBe("result_1");
    expect(r3).toBe("result_1");
    expect(r4).toBe("result_1");
    expect(r5).toBe("result_1");

    // Memory safety: pendingTasks should be 0 once settled
    const stats = ahko.stats();
    expect(stats.pendingTasks).toBe(0);
    expect(stats.completedTasks).toBe(1);
  });

  it("resets the quiet window timer when subsequent calls arrive", async () => {
    const ahko = new Ahko();
    let executedAt = 0;
    const startTime = Date.now();

    const task = async () => {
      executedAt = Date.now();
      return "done";
    };

    // First call at 0ms (window: 60ms)
    const p1 = ahko.schedule(task, { strategy: "debounce", key: "typing", waitMs: 60 });

    // Second call at 35ms (extends window by another 60ms)
    await sleep(35);
    const p2 = ahko.schedule(task, { strategy: "debounce", key: "typing", waitMs: 60 });

    expect(p1).toBe(p2);
    await p2;

    const totalElapsed = executedAt - startTime;
    // Should execute at >= 35 + 60 = 95ms
    expect(totalElapsed).toBeGreaterThanOrEqual(85);
  });

  it("handles distinct keys independently without interference", async () => {
    const ahko = new Ahko();

    const pA = ahko.debounce("key_A", async () => "A", 30);
    const pB = ahko.debounce("key_B", async () => "B", 30);

    // Different keys have distinct promises
    expect(pA).not.toBe(pB);

    const [resA, resB] = await Promise.all([pA, pB]);
    expect(resA).toBe("A");
    expect(resB).toBe("B");
    expect(ahko.stats().completedTasks).toBe(2);
  });

  it("rejects with AhkoCancellationError when cancelled before quiet window expires", async () => {
    const ahko = new Ahko();
    const controller = new AbortController();

    const taskPromise = ahko.debounce(
      "cancel_key",
      async () => "never",
      60,
      { signal: controller.signal }
    );

    setTimeout(() => controller.abort("user_cancelled_debounce"), 20);

    await expect(taskPromise).rejects.toThrow(AhkoCancellationError);
    expect(ahko.stats().pendingTasks).toBe(0);
  });

  it("throws AhkoConfigurationError on invalid key or waitMs", () => {
    const ahko = new Ahko();
    const dummy = () => 1;

    // Missing key
    expect(() =>
      ahko.schedule(dummy, { strategy: "debounce", waitMs: 50 })
    ).toThrow(AhkoConfigurationError);

    // Invalid key type
    expect(() =>
      ahko.schedule(dummy, { strategy: "debounce", key: 123 as unknown as string, waitMs: 50 })
    ).toThrow(AhkoConfigurationError);

    // Negative waitMs
    expect(() =>
      ahko.schedule(dummy, { strategy: "debounce", key: "k", waitMs: -10 })
    ).toThrow(AhkoConfigurationError);

    // NaN waitMs
    expect(() =>
      ahko.schedule(dummy, { strategy: "debounce", key: "k", waitMs: Number.NaN })
    ).toThrow(AhkoConfigurationError);
  });
});
