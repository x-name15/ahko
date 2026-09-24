import { describe, it, expect, vi } from "vitest";
import { Ahko } from "../ahko.js";
import { AhkoConfigurationError } from "../errors/configuration.error.js";

describe("Dynamic Concurrency API (ahko.setConcurrency)", () => {
  it("should report initial concurrency via getter", () => {
    const ahko = new Ahko({ concurrency: 5 });
    expect(ahko.concurrency).toBe(5);
  });

  it("should throw AhkoConfigurationError for invalid concurrency", () => {
    const ahko = new Ahko({ concurrency: 2 });
    expect(() => ahko.setConcurrency(0)).toThrow(AhkoConfigurationError);
    expect(() => ahko.setConcurrency(-3)).toThrow(AhkoConfigurationError);
    expect(() => ahko.setConcurrency(NaN)).toThrow(AhkoConfigurationError);
  });

  it("should emit concurrency:change event when setConcurrency is called with a new value", () => {
    const ahko = new Ahko({ concurrency: 2 });
    const listener = vi.fn();
    ahko.on("concurrency:change", listener);

    ahko.setConcurrency(4);
    expect(ahko.concurrency).toBe(4);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        previousConcurrency: 2,
        currentConcurrency: 4,
        reason: "Manual concurrency update",
      })
    );

    // Setting same value should not emit event
    ahko.setConcurrency(4);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("should scale up concurrency in-flight and immediately dispatch queued tasks", async () => {
    const ahko = new Ahko({ concurrency: 1 });
    let activeCount = 0;
    let maxObservedActive = 0;

    const createTask = () =>
      ahko.schedule(async () => {
        activeCount++;
        if (activeCount > maxObservedActive) {
          maxObservedActive = activeCount;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        activeCount--;
      });

    // Enqueue 4 tasks with initial concurrency 1
    const p1 = createTask();
    const p2 = createTask();
    const p3 = createTask();
    const p4 = createTask();

    // Verify initially only 1 is active
    expect(ahko.stats().activeTasks).toBe(1);
    expect(ahko.stats().pendingTasks).toBe(3);

    // Dynamically expand concurrency to 3
    ahko.setConcurrency(3);
    expect(ahko.stats().activeTasks).toBe(3);
    expect(ahko.stats().pendingTasks).toBe(1);

    await Promise.all([p1, p2, p3, p4]);
    expect(maxObservedActive).toBe(3);
  });

  it("should scale down concurrency gracefully without killing in-flight tasks", async () => {
    const ahko = new Ahko({ concurrency: 4 });
    let activeCount = 0;

    const createTask = (delayMs: number) =>
      ahko.schedule(async () => {
        activeCount++;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        activeCount--;
      });

    // Launch 4 active tasks
    const p1 = createTask(60);
    const p2 = createTask(60);
    const p3 = createTask(60);
    const p4 = createTask(60);
    const p5 = createTask(20);

    expect(ahko.stats().activeTasks).toBe(4);
    expect(ahko.stats().pendingTasks).toBe(1);

    // Scale down to 1
    ahko.setConcurrency(1);

    // In-flight tasks (4) continue to run to completion
    expect(ahko.stats().activeTasks).toBe(4);

    await Promise.all([p1, p2, p3, p4]);
    // After the 4 complete, p5 runs respecting the new concurrency limit of 1
    await p5;
    expect(activeCount).toBe(0);
  });
});
