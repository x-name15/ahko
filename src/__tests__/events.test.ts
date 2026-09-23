import { describe, expect, it } from "vitest";
import { Ahko } from "../index.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("Ahko Telemetry & Lifecycle Events", () => {
  describe("task:start and task:complete", () => {
    it("should emit task:start and task:complete with timing and results", async () => {
      const ahko = new Ahko();
      const starts: Array<{ taskId: string; attempt: number }> = [];
      const completions: Array<{ taskId: string; attempt: number; durationMs: number; result: unknown }> = [];

      ahko.on("task:start", (payload) => starts.push(payload));
      ahko.on("task:complete", (payload) => completions.push(payload));

      const result = await ahko.schedule(async () => {
        await sleep(10);
        return "chill";
      });

      expect(result).toBe("chill");
      expect(starts).toHaveLength(1);
      expect(starts[0].attempt).toBe(1);
      expect(typeof starts[0].taskId).toBe("string");

      expect(completions).toHaveLength(1);
      expect(completions[0].taskId).toBe(starts[0].taskId);
      expect(completions[0].attempt).toBe(1);
      expect(completions[0].result).toBe("chill");
      expect(completions[0].durationMs).toBeGreaterThanOrEqual(5);
    });
  });

  describe("task:fail", () => {
    it("should emit task:fail with willRetry: false when no retry is configured", async () => {
      const ahko = new Ahko();
      const failures: Array<{ taskId: string; attempt: number; error: unknown; willRetry: boolean }> = [];

      ahko.on("task:fail", (payload) => failures.push(payload));

      const error = new Error("Boom");
      await expect(
        ahko.schedule(async () => {
          throw error;
        })
      ).rejects.toThrow("Boom");

      expect(failures).toHaveLength(1);
      expect(failures[0].attempt).toBe(1);
      expect(failures[0].error).toBe(error);
      expect(failures[0].willRetry).toBe(false);
    });

    it("should emit task:fail with willRetry: true on intermediate attempts, then willRetry: false on final failure", async () => {
      const ahko = new Ahko();
      const failures: Array<{ taskId: string; attempt: number; error: unknown; willRetry: boolean }> = [];

      ahko.on("task:fail", (payload) => failures.push(payload));

      await expect(
        ahko.schedule(
          async () => {
            throw new Error("Flaky network");
          },
          {
            retry: {
              attempts: 3,
              baseDelay: 10,
            },
          }
        )
      ).rejects.toThrow("Flaky network");

      expect(failures).toHaveLength(3);
      expect(failures[0].attempt).toBe(1);
      expect(failures[0].willRetry).toBe(true);

      expect(failures[1].attempt).toBe(2);
      expect(failures[1].willRetry).toBe(true);

      expect(failures[2].attempt).toBe(3);
      expect(failures[2].willRetry).toBe(false);
    });
  });

  describe("task:timeout", () => {
    it("should emit task:timeout when a task exceeds its configured deadline", async () => {
      const ahko = new Ahko();
      const timeouts: Array<{ taskId: string; timeoutMs: number }> = [];

      ahko.on("task:timeout", (payload) => timeouts.push(payload));

      await expect(
        ahko.schedule(
          async () => {
            await sleep(80);
          },
          { timeoutMs: 20 }
        )
      ).rejects.toThrow(/timed out/);

      expect(timeouts).toHaveLength(1);
      expect(timeouts[0].timeoutMs).toBe(20);
      expect(typeof timeouts[0].taskId).toBe("string");
    });
  });

  describe("task:cancel", () => {
    it("should emit task:cancel when a queued task is cancelled via signal", async () => {
      const ahko = new Ahko({ concurrency: 1 });
      const controller = new AbortController();
      const cancellations: Array<{ taskId: string; reason: unknown }> = [];

      ahko.on("task:cancel", (payload) => cancellations.push(payload));

      // Occupy slot
      const p1 = ahko.schedule(async () => {
        await sleep(40);
      });

      // Queued task with signal
      const p2 = ahko.schedule(
        async () => 42,
        { signal: controller.signal }
      );
      const rejectionPromise = expect(p2).rejects.toThrow();

      controller.abort("User cancelled");

      await p1;
      await rejectionPromise;

      expect(cancellations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("idle event", () => {
    it("should emit idle event with timestamp when all tasks finish", async () => {
      const ahko = new Ahko();
      const idles: Array<{ timestamp: number }> = [];

      ahko.on("idle", (payload) => idles.push(payload));

      const p1 = ahko.schedule(async () => {
        await sleep(10);
        return "a";
      });
      const p2 = ahko.schedule(async () => {
        await sleep(15);
        return "b";
      });

      await Promise.all([p1, p2]);
      await sleep(10);

      expect(idles.length).toBeGreaterThanOrEqual(1);
      expect(typeof idles[0].timestamp).toBe("number");
    });
  });

  describe("Subscription management & error containment", () => {
    it("should allow unsubscribing via returned function", async () => {
      const ahko = new Ahko();
      let callCount = 0;

      const unsubscribe = ahko.on("task:start", () => {
        callCount++;
      });

      await ahko.schedule(async () => 1);
      expect(callCount).toBe(1);

      unsubscribe();

      await ahko.schedule(async () => 2);
      expect(callCount).toBe(1);
    });

    it("should allow unsubscribing via ahko.off", async () => {
      const ahko = new Ahko();
      let callCount = 0;
      const handler = () => {
        callCount++;
      };

      ahko.on("task:start", handler);
      await ahko.schedule(async () => 1);
      expect(callCount).toBe(1);

      ahko.off("task:start", handler);
      await ahko.schedule(async () => 2);
      expect(callCount).toBe(1);
    });

    it("should isolate listener errors without crashing scheduler or other listeners", async () => {
      const ahko = new Ahko();
      let secondListenerCalled = false;

      ahko.on("task:start", () => {
        throw new Error("Bad listener");
      });

      ahko.on("task:start", () => {
        secondListenerCalled = true;
      });

      const result = await ahko.schedule(async () => "ok");

      expect(result).toBe("ok");
      expect(secondListenerCalled).toBe(true);
    });
  });
});
