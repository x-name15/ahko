import { describe, it, expect } from "vitest";
import { Ahko } from "../ahko.js";
import { AhkoCancellationError } from "../errors/cancellation.error.js";
import { AhkoConfigurationError } from "../errors/configuration.error.js";

describe("Batch Collections API (ahko.map and ahko.each)", () => {
  it("should preserve strict index order even when items resolve out of order", async () => {
    const ahko = new Ahko({ concurrency: 4 });
    const items = [50, 10, 30, 5];

    const results = await ahko.map(items, async (delayMs) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return delayMs * 2;
    });

    expect(results).toEqual([100, 20, 60, 10]);
  });

  it("should cap concurrent items according to localized batch concurrency option", async () => {
    const ahko = new Ahko({ concurrency: 10 });
    let activeRunning = 0;
    let maxObservedActive = 0;

    const items = [1, 2, 3, 4, 5, 6];
    await ahko.map(
      items,
      async () => {
        activeRunning++;
        if (activeRunning > maxObservedActive) {
          maxObservedActive = activeRunning;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeRunning--;
      },
      { concurrency: 2 }
    );

    expect(maxObservedActive).toBe(2);
  });

  it("should fall back to scheduler concurrency when localized concurrency is omitted", async () => {
    const ahko = new Ahko({ concurrency: 3 });
    let activeRunning = 0;
    let maxObservedActive = 0;

    const items = [1, 2, 3, 4, 5, 6, 7];
    await ahko.map(items, async () => {
      activeRunning++;
      if (activeRunning > maxObservedActive) {
        maxObservedActive = activeRunning;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeRunning--;
    });

    expect(maxObservedActive).toBe(3);
  });

  it("should handle empty iterable without scheduling any tasks", async () => {
    const ahko = new Ahko({ concurrency: 2 });
    const results = await ahko.map([], async () => "never");
    expect(results).toEqual([]);
    expect(ahko.stats().totalDispatched).toBe(0);
  });

  it("should support non-array iterables like Set", async () => {
    const ahko = new Ahko({ concurrency: 2 });
    const set = new Set(["alpha", "beta", "gamma"]);

    const results = await ahko.map(set, (item, index) => `${index}:${item.toUpperCase()}`);
    expect(results).toEqual(["0:ALPHA", "1:BETA", "2:GAMMA"]);
  });

  it("should pass index and task context into mapper callback", async () => {
    const ahko = new Ahko({ concurrency: 2 });
    const items = ["a", "b"];
    const contexts: Array<{ index: number; taskId: string; hasSignal: boolean }> = [];

    await ahko.map(items, async (item, index, context) => {
      contexts.push({ index, taskId: context.taskId, hasSignal: context.signal instanceof AbortSignal });
      return item;
    });

    expect(contexts).toHaveLength(2);
    expect(contexts[0].index).toBe(0);
    expect(contexts[0].taskId).toMatch(/^task_/);
    expect(contexts[0].hasSignal).toBe(true);
    expect(contexts[1].index).toBe(1);
  });

  it("should stop immediately on error when stopOnError: true", async () => {
    const ahko = new Ahko({ concurrency: 1 });
    const executed: number[] = [];

    const promise = ahko.map(
      [1, 2, 3, 4],
      async (item) => {
        executed.push(item);
        if (item === 2) {
          throw new Error("Item 2 failed");
        }
        await new Promise((resolve) => setTimeout(resolve, 15));
        return item * 10;
      },
      { stopOnError: true }
    );

    await expect(promise).rejects.toThrow("Item 2 failed");
    // Items 3 and 4 should never have been dispatched because item 2 threw
    expect(executed).toEqual([1, 2]);
  });

  it("should settle all items before rejecting when stopOnError: false", async () => {
    const ahko = new Ahko({ concurrency: 2 });
    const executed: number[] = [];

    const promise = ahko.map(
      [1, 2, 3, 4],
      async (item) => {
        executed.push(item);
        await new Promise((resolve) => setTimeout(resolve, 15));
        if (item === 2) {
          throw new Error("Item 2 failed");
        }
        return item;
      },
      { stopOnError: false }
    );

    await expect(promise).rejects.toThrow("Item 2 failed");
    // All items ran
    expect(executed.sort()).toEqual([1, 2, 3, 4]);
  });

  it("should reject immediately if external signal is already aborted", async () => {
    const ahko = new Ahko({ concurrency: 2 });
    const controller = new AbortController();
    controller.abort(new Error("Pre-aborted"));

    await expect(
      ahko.map([1, 2, 3], async (x) => x, { signal: controller.signal })
    ).rejects.toThrow(AhkoCancellationError);
  });

  it("should cancel pending items when external signal aborts mid-flight", async () => {
    const ahko = new Ahko({ concurrency: 1 });
    const controller = new AbortController();

    const promise = ahko.map(
      [1, 2, 3, 4],
      async (item, _index, { signal }) => {
        if (item === 2) {
          controller.abort("User cancelled batch");
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        signal.throwIfAborted?.();
        return item;
      },
      { signal: controller.signal }
    );

    await expect(promise).rejects.toThrow(AhkoCancellationError);
  });

  it("should throw AhkoConfigurationError for invalid mapper or invalid concurrency", async () => {
    const ahko = new Ahko({ concurrency: 2 });
    // @ts-expect-error Testing invalid fn runtime guard
    await expect(ahko.map([1], "not-a-fn")).rejects.toThrow(AhkoConfigurationError);

    await expect(
      // @ts-expect-error Testing invalid concurrency runtime guard
      ahko.map([1], async (x) => x, { concurrency: -1 })
    ).rejects.toThrow(AhkoConfigurationError);
  });

  it("ahko.each should iterate through all elements and return void", async () => {
    const ahko = new Ahko({ concurrency: 2 });
    const processed: number[] = [];

    const res = await ahko.each([10, 20, 30], async (item) => {
      processed.push(item * 2);
    });

    expect(res).toBeUndefined();
    expect(processed).toEqual([20, 40, 60]);
  });
});
