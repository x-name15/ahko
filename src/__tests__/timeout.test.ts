import { describe, expect, it } from "vitest";
import { Ahko } from "../ahko.js";
import { AhkoCancellationError } from "../errors/cancellation.error.js";
import { AhkoConfigurationError } from "../errors/configuration.error.js";
import { AhkoTimeoutError } from "../errors/timeout.error.js";
import { combineSignals } from "../scheduler/signal.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("Milestone 0.4.0 — Timeout & Robust Cancellation", () => {
  describe("Execution Timeout (timeoutMs)", () => {
    it("rejects with AhkoTimeoutError when execution exceeds timeoutMs", async () => {
      const ahko = new Ahko();

      const taskPromise = ahko.schedule(
        async () => {
          await sleep(150);
          return "too late";
        },
        { timeoutMs: 40 }
      );

      await expect(taskPromise).rejects.toThrow(AhkoTimeoutError);
      await expect(taskPromise).rejects.toMatchObject({
        timeoutMs: 40,
        message: expect.stringContaining("40ms"),
      });

      const stats = ahko.stats();
      expect(stats.timedOutTasks).toBe(1);
      expect(stats.failedTasks).toBe(0);
      expect(stats.completedTasks).toBe(0);
    });

    it("resolves cleanly when execution completes before timeoutMs", async () => {
      const ahko = new Ahko();

      const result = await ahko.schedule(
        async () => {
          await sleep(20);
          return "speedy success";
        },
        { timeoutMs: 200 }
      );

      expect(result).toBe("speedy success");
      const stats = ahko.stats();
      expect(stats.completedTasks).toBe(1);
      expect(stats.timedOutTasks).toBe(0);
    });

    it("propagates timeout abort reason to task context signal", async () => {
      const ahko = new Ahko();
      let capturedSignalAborted = false;
      let capturedReason: unknown;

      await expect(
        ahko.schedule(
          async ({ signal }) => {
            signal.addEventListener("abort", () => {
              capturedSignalAborted = signal.aborted;
              capturedReason = signal.reason;
            });
            await sleep(100);
            return "never";
          },
          { timeoutMs: 30 }
        )
      ).rejects.toThrow(AhkoTimeoutError);

      expect(capturedSignalAborted).toBe(true);
      expect(capturedReason).toBeInstanceOf(AhkoTimeoutError);
    });

    it("immediately rejects uncooperative hanging tasks", async () => {
      const ahko = new Ahko();

      const startTime = Date.now();
      await expect(
        ahko.schedule(
          // Task never resolves and ignores signal
          () => new Promise(() => {}),
          { timeoutMs: 40 }
        )
      ).rejects.toThrow(AhkoTimeoutError);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(30);
      expect(elapsed).toBeLessThan(150);
    });

    it("does not count queued waiting time against active execution timeout", async () => {
      // Concurrency 1: task 2 must wait for task 1 to finish
      const ahko = new Ahko({ concurrency: 1 });

      const task1Promise = ahko.schedule(async () => {
        await sleep(60);
        return "first";
      });

      // Task 2 waits in queue for ~60ms, then runs for 20ms with a 40ms timeout.
      // If queue time counted, 60 + 20 = 80 > 40 (would fail).
      // Since timeoutMs measures execution time, 20ms < 40ms -> should succeed!
      const task2Promise = ahko.schedule(
        async () => {
          await sleep(20);
          return "second";
        },
        { timeoutMs: 40 }
      );

      const [res1, res2] = await Promise.all([task1Promise, task2Promise]);
      expect(res1).toBe("first");
      expect(res2).toBe("second");

      const stats = ahko.stats();
      expect(stats.completedTasks).toBe(2);
      expect(stats.timedOutTasks).toBe(0);
    });
  });

  describe("Cancellation & Timeout Precedence", () => {
    it("prioritizes external cancellation when signal is aborted before timeout", async () => {
      const ahko = new Ahko();
      const controller = new AbortController();

      const taskPromise = ahko.schedule(
        async ({ signal }) => {
          await sleep(150);
          return "never";
        },
        {
          signal: controller.signal,
          timeoutMs: 200,
        }
      );

      setTimeout(() => controller.abort("user_stop"), 30);

      await expect(taskPromise).rejects.toThrow(AhkoCancellationError);
      const stats = ahko.stats();
      expect(stats.cancelledTasks).toBe(1);
      expect(stats.timedOutTasks).toBe(0);
    });

    it("prioritizes timeout when timeout expires before external cancellation", async () => {
      const ahko = new Ahko();
      const controller = new AbortController();

      const taskPromise = ahko.schedule(
        async () => {
          await sleep(200);
          return "never";
        },
        {
          signal: controller.signal,
          timeoutMs: 30,
        }
      );

      setTimeout(() => controller.abort("too_late"), 120);

      await expect(taskPromise).rejects.toThrow(AhkoTimeoutError);
      const stats = ahko.stats();
      expect(stats.timedOutTasks).toBe(1);
      expect(stats.cancelledTasks).toBe(0);
    });
  });

  describe("Retry Synergy with Timeout", () => {
    it("renews a fresh timeout window on retry attempts", async () => {
      const ahko = new Ahko();
      let attempt = 0;

      const result = await ahko.schedule(
        async () => {
          attempt++;
          if (attempt === 1) {
            // Attempt 1 exceeds 30ms timeout
            await sleep(60);
            return "attempt 1 late";
          }
          // Attempt 2 completes in 15ms (< 30ms fresh window)
          await sleep(15);
          return "attempt 2 win";
        },
        {
          timeoutMs: 35,
          retry: {
            attempts: 2,
            backoff: "none",
          },
        }
      );

      expect(result).toBe("attempt 2 win");
      expect(attempt).toBe(2);
      const stats = ahko.stats();
      expect(stats.completedTasks).toBe(1);
      expect(stats.timedOutTasks).toBe(0);
    });

    it("rejects with AhkoTimeoutError when all retry attempts time out", async () => {
      const ahko = new Ahko();
      let attempt = 0;

      await expect(
        ahko.schedule(
          async () => {
            attempt++;
            await sleep(60);
            return "too slow";
          },
          {
            timeoutMs: 25,
            retry: {
              attempts: 2,
              backoff: "none",
            },
          }
        )
      ).rejects.toThrow(AhkoTimeoutError);

      expect(attempt).toBe(2);
      const stats = ahko.stats();
      expect(stats.timedOutTasks).toBe(1);
    });
  });

  describe("Validation", () => {
    it("throws AhkoConfigurationError on invalid timeoutMs values", () => {
      const ahko = new Ahko();
      const dummyTask = () => 1;

      expect(() =>
        ahko.schedule(dummyTask, { timeoutMs: 0 })
      ).toThrow(AhkoConfigurationError);

      expect(() =>
        ahko.schedule(dummyTask, { timeoutMs: -100 })
      ).toThrow(AhkoConfigurationError);

      expect(() =>
        ahko.schedule(dummyTask, { timeoutMs: Number.NaN })
      ).toThrow(AhkoConfigurationError);

      expect(() =>
        ahko.schedule(dummyTask, { timeoutMs: Number.POSITIVE_INFINITY })
      ).toThrow(AhkoConfigurationError);

      expect(() =>
        ahko.schedule(dummyTask, { timeoutMs: "500" as unknown as number })
      ).toThrow(AhkoConfigurationError);
    });
  });

  describe("combineSignals Utility", () => {
    it("creates an un-aborted signal when given active signals", () => {
      const c1 = new AbortController();
      const c2 = new AbortController();

      const combined = combineSignals([c1.signal, c2.signal]);
      expect(combined.signal.aborted).toBe(false);

      combined.cleanup();
    });

    it("aborts when any source signal aborts", () => {
      const c1 = new AbortController();
      const c2 = new AbortController();

      const combined = combineSignals([c1.signal, c2.signal]);
      let abortedFired = false;
      combined.signal.addEventListener("abort", () => {
        abortedFired = true;
      });

      c2.abort("aborted by c2");
      expect(combined.signal.aborted).toBe(true);
      expect(abortedFired).toBe(true);
      expect(combined.signal.reason).toBe("aborted by c2");

      combined.cleanup();
    });

    it("immediately returns aborted signal if an input is already aborted", () => {
      const c1 = new AbortController();
      c1.abort("already dead");

      const combined = combineSignals([c1.signal]);
      expect(combined.signal.aborted).toBe(true);
      expect(combined.signal.reason).toBe("already dead");

      combined.cleanup();
    });

    it("cleanly detaches event listeners on cleanup()", () => {
      const c1 = new AbortController();
      const c2 = new AbortController();

      const combined = combineSignals([c1.signal, c2.signal]);
      combined.cleanup();

      // Triggering source abort after cleanup should not affect composite signal
      c1.abort("late abort");
      expect(combined.signal.aborted).toBe(false);
    });
  });
});
