import { describe, expect, it } from "vitest";
import {
  Ahko,
  AhkoCancellationError,
  AhkoConfigurationError,
  calculateBackoff,
  DEFAULT_BASE_DELAY,
  DEFAULT_MAX_DELAY,
} from "../index.js";

describe("Ahko Retry & Backoff", () => {
  describe("calculateBackoff unit calculations", () => {
    it("should compute exponential backoff accurately", () => {
      const baseDelay = 100;
      const maxDelay = 1000;

      // attempt 1 (after 1st failure): 100 * 2^0 = 100
      expect(
        calculateBackoff(1, { attempts: 3, backoff: "exponential", baseDelay, maxDelay })
      ).toBe(100);

      // attempt 2 (after 2nd failure): 100 * 2^1 = 200
      expect(
        calculateBackoff(2, { attempts: 3, backoff: "exponential", baseDelay, maxDelay })
      ).toBe(200);

      // attempt 3: 100 * 2^2 = 400
      expect(
        calculateBackoff(3, { attempts: 4, backoff: "exponential", baseDelay, maxDelay })
      ).toBe(400);

      // attempt 5: 100 * 2^4 = 1600 -> capped at maxDelay 1000
      expect(
        calculateBackoff(5, { attempts: 6, backoff: "exponential", baseDelay, maxDelay })
      ).toBe(1000);
    });

    it("should compute linear backoff accurately", () => {
      const baseDelay = 150;
      const maxDelay = 1000;

      expect(calculateBackoff(1, { attempts: 3, backoff: "linear", baseDelay, maxDelay })).toBe(150);
      expect(calculateBackoff(2, { attempts: 3, backoff: "linear", baseDelay, maxDelay })).toBe(300);
      expect(calculateBackoff(3, { attempts: 3, backoff: "linear", baseDelay, maxDelay })).toBe(450);
    });

    it("should return 0 when backoff is none", () => {
      expect(calculateBackoff(2, { attempts: 3, backoff: "none" })).toBe(0);
    });

    it("should apply full jitter when enabled using injectable random function", () => {
      const mockRandom = () => 0.5;
      const delay = calculateBackoff(
        2,
        { attempts: 3, backoff: "linear", baseDelay: 200, jitter: true },
        mockRandom
      );
      // calculatedDelay = 200 * 2 = 400. floor(0.5 * 401) = 200
      expect(delay).toBe(200);
    });

    it("should use defaults when baseDelay or maxDelay are omitted", () => {
      expect(DEFAULT_BASE_DELAY).toBe(250);
      expect(DEFAULT_MAX_DELAY).toBe(10_000);
      const delay = calculateBackoff(1, { attempts: 2 });
      expect(delay).toBe(DEFAULT_BASE_DELAY);
    });
  });

  describe("Ahko retry integration", () => {
    it("should validate retry options and reject invalid configuration", () => {
      const ahko = new Ahko();

      expect(() =>
        ahko.schedule(async () => 1, {
          // @ts-expect-error Testing invalid attempts
          retry: { attempts: 0 },
        })
      ).toThrow(AhkoConfigurationError);

      expect(() =>
        ahko.schedule(async () => 1, {
          retry: { attempts: -2 },
        })
      ).toThrow(AhkoConfigurationError);

      expect(() =>
        ahko.schedule(async () => 1, {
          retry: { attempts: 2.5 },
        })
      ).toThrow(AhkoConfigurationError);

      expect(() =>
        ahko.schedule(async () => 1, {
          retry: { attempts: 2, baseDelay: -10 },
        })
      ).toThrow(AhkoConfigurationError);
    });

    it("should retry transient failures and succeed when an attempt succeeds", async () => {
      const ahko = new Ahko();
      let callCount = 0;
      const expectedResult = { status: "recovered", payload: 99 };

      const result = await ahko.schedule(
        async () => {
          callCount++;
          if (callCount < 3) {
            throw new Error(`Transient failure on attempt ${callCount}`);
          }
          return expectedResult;
        },
        {
          retry: {
            attempts: 3,
            backoff: "none",
          },
        }
      );

      expect(callCount).toBe(3);
      expect(result).toEqual(expectedResult);

      const stats = ahko.stats();
      expect(stats.completedTasks).toBe(1);
      expect(stats.failedTasks).toBe(0);
      expect(stats.activeTasks).toBe(0);
      expect(stats.pendingTasks).toBe(0);
    });

    it("should fail and reject with the last error when all retry attempts are exhausted", async () => {
      const ahko = new Ahko();
      let executionAttempts = 0;
      const finalError = new Error("Permanent database failure");

      const promise = ahko.schedule(
        async () => {
          executionAttempts++;
          throw finalError;
        },
        {
          retry: {
            attempts: 3,
            backoff: "none",
          },
        }
      );

      await expect(promise).rejects.toThrow("Permanent database failure");
      expect(executionAttempts).toBe(3);

      const stats = ahko.stats();
      expect(stats.failedTasks).toBe(1);
      expect(stats.completedTasks).toBe(0);
      expect(stats.activeTasks).toBe(0);
    });

    it("should respect shouldRetry predicate to filter non-retryable errors", async () => {
      class UnrecoverableError extends Error {}
      class RecoverableError extends Error {}

      const ahko = new Ahko();
      let attempts = 0;

      const promise = ahko.schedule(
        async () => {
          attempts++;
          throw new UnrecoverableError("Invalid user credentials");
        },
        {
          retry: {
            attempts: 5,
            backoff: "none",
            shouldRetry: (error) => error instanceof RecoverableError,
          },
        }
      );

      await expect(promise).rejects.toThrow(UnrecoverableError);
      // Stopped immediately after attempt 1 because error is not recoverable
      expect(attempts).toBe(1);

      const stats = ahko.stats();
      expect(stats.failedTasks).toBe(1);
      expect(stats.completedTasks).toBe(0);
    });

    it("should release concurrency slot during backoff delay and not block other tasks", async () => {
      // Concurrency of 1: if retrying task held its slot, second task would be blocked!
      const ahko = new Ahko({ concurrency: 1 });
      let firstTaskAttempts = 0;
      const executionTimeline: string[] = [];

      const firstTask = ahko.schedule(
        async () => {
          firstTaskAttempts++;
          if (firstTaskAttempts === 1) {
            executionTimeline.push("task1-attempt1-fail");
            throw new Error("Task 1 temporary glitch");
          }
          executionTimeline.push("task1-attempt2-success");
          return "task1-done";
        },
        {
          retry: {
            attempts: 2,
            backoff: "linear",
            baseDelay: 40, // 40ms backoff delay
          },
        }
      );

      // Task 2 scheduled immediately behind task 1
      const secondTask = ahko.schedule(async () => {
        executionTimeline.push("task2-executed");
        return "task2-done";
      });

      const [res1, res2] = await Promise.all([firstTask, secondTask]);

      expect(res1).toBe("task1-done");
      expect(res2).toBe("task2-done");

      // Verify task 2 ran during task 1's backoff window!
      expect(executionTimeline).toEqual([
        "task1-attempt1-fail",
        "task2-executed",
        "task1-attempt2-success",
      ]);
    });

    it("should cancel task during backoff delay when external signal aborts", async () => {
      const ahko = new Ahko();
      const controller = new AbortController();
      let attempts = 0;

      const promise = ahko.schedule(
        async () => {
          attempts++;
          throw new Error("Failure triggering backoff");
        },
        {
          signal: controller.signal,
          retry: {
            attempts: 4,
            backoff: "linear",
            baseDelay: 2000, // long delay
          },
        }
      );

      // Wait a tick for attempt 1 to fail and enter backoff timer
      await new Promise((resolve) => setTimeout(resolve, 15));

      expect(attempts).toBe(1);
      expect(ahko.stats().pendingTasks).toBe(1);

      // Abort during backoff delay
      controller.abort("User cancelled while in backoff");

      await expect(promise).rejects.toThrow(AhkoCancellationError);
      expect(attempts).toBe(1); // Never ran attempt 2!

      const stats = ahko.stats();
      expect(stats.cancelledTasks).toBe(1);
      expect(stats.failedTasks).toBe(0);
      expect(stats.pendingTasks).toBe(0);
    });
  });
});
