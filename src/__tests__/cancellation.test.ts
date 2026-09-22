import { describe, expect, it } from "vitest";
import { Ahko, AhkoCancellationError, EScheduleStrategy } from "../index.js";

describe("Ahko Cancellation & Memory Safety", () => {
  it("should immediately reject and not run if signal is pre-aborted", async () => {
    const ahko = new Ahko({ concurrency: 2 });
    const controller = new AbortController();
    controller.abort(new Error("Pre-aborted reason"));

    let ran = false;
    const promise = ahko.schedule(
      async () => {
        ran = true;
        return "not-run";
      },
      { signal: controller.signal }
    );

    await expect(promise).rejects.toThrow(AhkoCancellationError);
    expect(ran).toBe(false);

    const stats = ahko.stats();
    expect(stats.cancelledTasks).toBe(1);
    expect(stats.activeTasks).toBe(0);
    expect(stats.pendingTasks).toBe(0);
  });

  it("should dequeue and reject when cancelled while pending in queue", async () => {
    const ahko = new Ahko({ concurrency: 1 });

    // Saturate the single concurrency slot
    let releaseFirstTask!: () => void;
    const firstTask = ahko.schedule(
      () =>
        new Promise<string>((resolve) => {
          releaseFirstTask = () => resolve("first-done");
        })
    );

    // Queue a second task with an AbortController
    const controller = new AbortController();
    let secondTaskRan = false;
    const secondTask = ahko.schedule(
      async () => {
        secondTaskRan = true;
        return "second-done";
      },
      { signal: controller.signal }
    );

    expect(ahko.stats().activeTasks).toBe(1);
    expect(ahko.stats().pendingTasks).toBe(1);

    // Cancel the second task while it is still waiting in queue
    controller.abort("User cancelled while in queue");

    await expect(secondTask).rejects.toThrow(AhkoCancellationError);
    expect(secondTaskRan).toBe(false);

    // Release first task and verify queue drains cleanly
    releaseFirstTask();
    await expect(firstTask).resolves.toBe("first-done");

    const stats = ahko.stats();
    expect(stats.completedTasks).toBe(1);
    expect(stats.cancelledTasks).toBe(1);
    expect(stats.activeTasks).toBe(0);
    expect(stats.pendingTasks).toBe(0);
  });

  it("should clear timer and cancel when aborted during delay phase", async () => {
    const ahko = new Ahko();
    const controller = new AbortController();

    let ran = false;
    const promise = ahko.schedule(
      async () => {
        ran = true;
      },
      {
        strategy: EScheduleStrategy.DELAY,
        delay: 5000,
        signal: controller.signal,
      }
    );

    expect(ahko.stats().pendingTasks).toBe(1);

    // Abort during delay
    controller.abort("Aborted during delay");

    await expect(promise).rejects.toThrow(AhkoCancellationError);
    expect(ran).toBe(false);

    // Allow promise tick to clear delayed tracking
    await new Promise((resolve) => setTimeout(resolve, 10));

    const stats = ahko.stats();
    expect(stats.cancelledTasks).toBe(1);
    expect(stats.pendingTasks).toBe(0);
  });

  it("should propagate cancellation signal to running task", async () => {
    const ahko = new Ahko();
    const controller = new AbortController();

    let observedSignalAbort = false;

    const promise = ahko.schedule(
      async ({ signal }) => {
        return new Promise<void>((_, reject) => {
          signal.addEventListener("abort", () => {
            observedSignalAbort = true;
            reject(new Error("Operation aborted inside task"));
          });
        });
      },
      { signal: controller.signal }
    );

    expect(ahko.stats().activeTasks).toBe(1);

    // Trigger abort while running
    controller.abort();

    await expect(promise).rejects.toThrow(AhkoCancellationError);
    expect(observedSignalAbort).toBe(true);

    const stats = ahko.stats();
    expect(stats.cancelledTasks).toBe(1);
    expect(stats.activeTasks).toBe(0);
  });

  it("should remove abort listener from external signal upon completion (Memory Safety)", async () => {
    const ahko = new Ahko();
    const controller = new AbortController();

    // Verify task completes and listener is removed
    await ahko.schedule(async () => "done", { signal: controller.signal });

    // Verify calling abort now does not cause secondary side effects or leaks
    expect(() => controller.abort()).not.toThrow();
    expect(ahko.stats().completedTasks).toBe(1);
    expect(ahko.stats().cancelledTasks).toBe(0);
  });
});
