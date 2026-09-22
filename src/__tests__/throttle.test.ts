import { describe, expect, it } from "vitest";
import { Ahko } from "../ahko.js";
import { AhkoCancellationError } from "../errors/cancellation.error.js";
import { AhkoConfigurationError } from "../errors/configuration.error.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("Milestone 0.5.0 — Throttle & Promise Coalescing", () => {
  it("executes leading call immediately and coalesces subsequent calls into a trailing run", async () => {
    const ahko = new Ahko();
    const runs: string[] = [];

    const task = async (val: string) => {
      runs.push(val);
      return val;
    };

    // Leading call: runs immediately
    const p1 = ahko.throttle("scroll_key", () => task("call_1"), 60);

    // Trailing calls within the 60ms throttle window
    const p2 = ahko.throttle("scroll_key", () => task("call_2"), 60);
    const p3 = ahko.throttle("scroll_key", () => task("call_3"), 60);

    // p2 and p3 coalesce into the trailing run
    expect(p2).toBe(p3);
    expect(p1).not.toBe(p2);

    const r1 = await p1;
    expect(r1).toBe("call_1");
    expect(runs).toEqual(["call_1"]);

    const [r2, r3] = await Promise.all([p2, p3]);
    // The trailing execution ran with the latest task ("call_3")
    expect(r2).toBe("call_3");
    expect(r3).toBe("call_3");
    expect(runs).toEqual(["call_1", "call_3"]);

    // Memory safety: all entries cleaned up after trailing run settles
    await sleep(70);
    expect(ahko.stats().pendingTasks).toBe(0);
    expect(ahko.stats().completedTasks).toBe(2);
  });

  it("handles distinct keys independently without throttle interference", async () => {
    const ahko = new Ahko();

    const pA = ahko.throttle("key_1", async () => "A", 40);
    const pB = ahko.throttle("key_2", async () => "B", 40);

    expect(pA).not.toBe(pB);
    const [resA, resB] = await Promise.all([pA, pB]);
    expect(resA).toBe("A");
    expect(resB).toBe("B");
    expect(ahko.stats().completedTasks).toBe(2);
  });

  it("supports cancellation on trailing throttled execution", async () => {
    const ahko = new Ahko();
    const controller = new AbortController();

    // Leading call
    const p1 = ahko.throttle("cancel_throttle", async () => "leading", 60);
    await p1;

    // Trailing call with signal
    const p2 = ahko.throttle(
      "cancel_throttle",
      async () => "trailing",
      60,
      { signal: controller.signal }
    );

    // Abort trailing call before window timer expires
    controller.abort("stop_trailing");

    await expect(p2).rejects.toThrow(AhkoCancellationError);
  });

  it("throws AhkoConfigurationError on invalid key or waitMs", () => {
    const ahko = new Ahko();
    const dummy = () => 1;

    expect(() =>
      ahko.schedule(dummy, { strategy: "throttle", waitMs: 40 })
    ).toThrow(AhkoConfigurationError);

    expect(() =>
      ahko.schedule(dummy, { strategy: "throttle", key: "", waitMs: 40 })
    ).toThrow(AhkoConfigurationError);

    expect(() =>
      ahko.schedule(dummy, { strategy: "throttle", key: "k", waitMs: -5 })
    ).toThrow(AhkoConfigurationError);

    expect(() =>
      ahko.schedule(dummy, { strategy: "throttle", key: "k", waitMs: Number.NaN })
    ).toThrow(AhkoConfigurationError);
  });
});
