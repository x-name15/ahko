import { describe, expect, it } from "vitest";
import { Ahko } from "../ahko.js";
import { AhkoTimeoutError } from "../errors/timeout.error.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Total Timeout Budget (totalTimeoutMs)", () => {
  it("should abort a task whose queue wait time exceeds totalTimeoutMs", async () => {
    const ahko = new Ahko({ concurrency: 1 });

    // Occupy slot with a 100ms task
    const blocker = ahko.schedule(async () => {
      await sleep(100);
      return "blocker done";
    });

    // Enqueued task with totalTimeoutMs of 40ms (will expire in queue before slot frees)
    const timedOutTask = ahko.schedule(
      async () => "never runs",
      { totalTimeoutMs: 40 }
    );

    await expect(timedOutTask).rejects.toThrow(AhkoTimeoutError);
    await expect(timedOutTask).rejects.toThrow("Task total execution deadline exceeded after 40ms");

    await blocker;
    expect(ahko.stats().timedOutTasks).toBe(1);
  });

  it("should abort a task spanning retries if total execution exceeds totalTimeoutMs", async () => {
    const ahko = new Ahko({ concurrency: 1 });
    let attempts = 0;

    // Total timeout 80ms, retry policy has 3 attempts with 50ms delay
    const task = ahko.schedule(
      async () => {
        attempts++;
        await sleep(30);
        throw new Error("retryable flakiness");
      },
      {
        totalTimeoutMs: 80,
        retry: {
          attempts: 5,
          baseDelay: 50,
          backoff: "fixed",
        },
      }
    );

    await expect(task).rejects.toThrow(AhkoTimeoutError);
    expect(attempts).toBeLessThan(5); // cut short by total budget
    expect(ahko.stats().timedOutTasks).toBe(1);
  });

  it("should successfully resolve if execution completes within totalTimeoutMs budget", async () => {
    const ahko = new Ahko({ concurrency: 1 });

    const result = await ahko.schedule(
      async () => {
        await sleep(20);
        return "on-time result";
      },
      { totalTimeoutMs: 150 }
    );

    expect(result).toBe("on-time result");
    expect(ahko.stats().timedOutTasks).toBe(0);
    expect(ahko.stats().completedTasks).toBe(1);
  });
});
