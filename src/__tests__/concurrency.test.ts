import { describe, expect, it } from "vitest";
import { Ahko } from "../index.js";

describe("Ahko Concurrency & Queueing", () => {
  it("should never exceed configured concurrency limit", async () => {
    const maxConcurrency = 3;
    const totalTasks = 12;
    const ahko = new Ahko({ concurrency: maxConcurrency });

    let activeCount = 0;
    let peakConcurrency = 0;

    const tasks = Array.from({ length: totalTasks }, (_, index) =>
      ahko.schedule(async () => {
        activeCount++;
        peakConcurrency = Math.max(peakConcurrency, activeCount);

        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 20));

        activeCount--;
        return index;
      })
    );

    const results = await Promise.all(tasks);

    expect(results).toHaveLength(totalTasks);
    expect(peakConcurrency).toBe(maxConcurrency);
    expect(ahko.stats().completedTasks).toBe(totalTasks);
    expect(ahko.stats().activeTasks).toBe(0);
    expect(ahko.stats().pendingTasks).toBe(0);
  });

  it("should execute queued tasks in FIFO order", async () => {
    const ahko = new Ahko({ concurrency: 1 });
    const executionOrder: number[] = [];

    const tasks = Array.from({ length: 5 }, (_, i) =>
      ahko.schedule(async () => {
        executionOrder.push(i);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return i;
      })
    );

    await Promise.all(tasks);
    expect(executionOrder).toEqual([0, 1, 2, 3, 4]);
  });

  it("should reclaim concurrency slot when a task fails", async () => {
    const ahko = new Ahko({ concurrency: 1 });

    const failingTask = ahko.schedule(async () => {
      throw new Error("Task intentionally exploded");
    });

    const nextTask = ahko.schedule(async () => {
      return "recovered";
    });

    await expect(failingTask).rejects.toThrow("Task intentionally exploded");
    await expect(nextTask).resolves.toBe("recovered");

    const stats = ahko.stats();
    expect(stats.failedTasks).toBe(1);
    expect(stats.completedTasks).toBe(1);
    expect(stats.activeTasks).toBe(0);
  });
});
