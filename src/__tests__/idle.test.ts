import { describe, expect, it, vi } from "vitest";
import {
  Ahko,
  AhkoCancellationError,
  AhkoConfigurationError,
  EScheduleStrategy,
} from "../index.js";
import { IdleScheduler } from "../scheduler/idle-scheduler.js";

describe("Ahko Idle Scheduling & IdleScheduler", () => {
  describe("IdleScheduler Platform Abstraction Unit Tests", () => {
    it("should use requestIdleCallback when available in browser runtime", () => {
      let registeredCb!: (deadline?: unknown) => void;
      let capturedTimeout: number | undefined;
      let cancelledId: number | undefined;

      const mockRuntime = {
        requestIdleCallback: vi.fn((cb, opts) => {
          registeredCb = cb;
          capturedTimeout = opts?.timeout;
          return 999;
        }),
        cancelIdleCallback: vi.fn((id) => {
          cancelledId = id;
        }),
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
      } as unknown as typeof globalThis;

      let executed = false;
      const expectedTimeout = 250;
      const handle = IdleScheduler.schedule(
        () => {
          executed = true;
        },
        expectedTimeout,
        mockRuntime
      );

      expect(mockRuntime.requestIdleCallback).toHaveBeenCalledTimes(1);
      expect(capturedTimeout).toBe(expectedTimeout);
      expect(executed).toBe(false);

      // Trigger callback
      registeredCb();
      expect(executed).toBe(true);

      // Cancel handle
      handle.cancel();
      expect(mockRuntime.cancelIdleCallback).toHaveBeenCalledWith(999);
      expect(cancelledId).toBe(999);
    });

    it("should use setImmediate when running in Node.js runtime without requestIdleCallback", () => {
      let registeredCb!: () => void;
      let cancelledHandle: unknown;

      const mockRuntime = {
        setImmediate: vi.fn((cb) => {
          registeredCb = cb;
          return { _id: "imm_123" };
        }),
        clearImmediate: vi.fn((handle) => {
          cancelledHandle = handle;
        }),
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
      } as unknown as typeof globalThis;

      let executed = false;
      const handle = IdleScheduler.schedule(
        () => {
          executed = true;
        },
        undefined,
        mockRuntime
      );

      expect(mockRuntime.setImmediate).toHaveBeenCalledTimes(1);
      expect(executed).toBe(false);

      registeredCb();
      expect(executed).toBe(true);

      handle.cancel();
      expect(mockRuntime.clearImmediate).toHaveBeenCalledTimes(1);
      expect(cancelledHandle).toEqual({ _id: "imm_123" });
    });

    it("should fallback to setTimeout(..., 0) when neither requestIdleCallback nor setImmediate exists", () => {
      let registeredCb!: () => void;
      let capturedDelay: number | undefined;
      let cancelledTimerId: unknown;

      const mockRuntime = {
        setTimeout: vi.fn((cb, delay) => {
          registeredCb = cb;
          capturedDelay = delay;
          return 777;
        }),
        clearTimeout: vi.fn((id) => {
          cancelledTimerId = id;
        }),
      } as unknown as typeof globalThis;

      let executed = false;
      const handle = IdleScheduler.schedule(
        () => {
          executed = true;
        },
        undefined,
        mockRuntime
      );

      expect(mockRuntime.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
      expect(capturedDelay).toBe(0);
      expect(executed).toBe(false);

      registeredCb();
      expect(executed).toBe(true);

      handle.cancel();
      expect(mockRuntime.clearTimeout).toHaveBeenCalledWith(777);
      expect(cancelledTimerId).toBe(777);
    });
  });

  describe("Ahko Idle Scheduling Strategy Integration", () => {
    it("should execute task via strategy: 'idle' with type inference", async () => {
      const ahko = new Ahko();
      const testData = { key: "idle-result", timestamp: Date.now() };

      const promise = ahko.schedule(async () => testData, {
        strategy: EScheduleStrategy.IDLE,
      });

      const result = await promise;
      expect(result).toEqual(testData);
      expect(result.key).toBe("idle-result");
      expect(ahko.stats().completedTasks).toBe(1);
      expect(ahko.stats().activeTasks).toBe(0);
      expect(ahko.stats().pendingTasks).toBe(0);
    });

    it("should execute task via convenience method ahko.idle()", async () => {
      const ahko = new Ahko();
      const numberToDouble = 21;

      const result = await ahko.idle(async ({ taskId }) => {
        expect(taskId).toMatch(/^task_/);
        return numberToDouble * 2;
      });

      expect(result).toBe(42);
      expect(ahko.stats().completedTasks).toBe(1);
    });

    it("should reject invalid idleTimeout option", () => {
      const ahko = new Ahko();

      expect(() =>
        ahko.schedule(async () => "test", {
          strategy: EScheduleStrategy.IDLE,
          idleTimeout: -50,
        })
      ).toThrow(AhkoConfigurationError);

      expect(() =>
        ahko.schedule(async () => "test", {
          strategy: EScheduleStrategy.IDLE,
          idleTimeout: NaN,
        })
      ).toThrow(AhkoConfigurationError);
    });

    it("should cancel task during idle wait without consuming concurrency", async () => {
      const ahko = new Ahko({ concurrency: 1 });
      const controller = new AbortController();

      let executed = false;
      const promise = ahko.idle(
        async () => {
          executed = true;
          return "should-not-run";
        },
        { signal: controller.signal }
      );

      expect(ahko.stats().pendingTasks).toBe(1);
      expect(ahko.stats().activeTasks).toBe(0);

      // Abort immediately while waiting for idle callback
      controller.abort("Aborted before idle fired");

      await expect(promise).rejects.toThrow(AhkoCancellationError);
      expect(executed).toBe(false);

      const stats = ahko.stats();
      expect(stats.cancelledTasks).toBe(1);
      expect(stats.completedTasks).toBe(0);
      expect(stats.activeTasks).toBe(0);
      expect(stats.pendingTasks).toBe(0);
    });

    it("should respect concurrency limits when multiple idle tasks resolve", async () => {
      const maxConcurrency = 2;
      const totalTasks = 6;
      const ahko = new Ahko({ concurrency: maxConcurrency });

      let currentActive = 0;
      let peakActive = 0;

      const tasks = Array.from({ length: totalTasks }, (_, index) =>
        ahko.idle(async () => {
          currentActive++;
          peakActive = Math.max(peakActive, currentActive);

          await new Promise((resolve) => setTimeout(resolve, 15));

          currentActive--;
          return index;
        })
      );

      const results = await Promise.all(tasks);

      expect(results).toHaveLength(totalTasks);
      expect(peakActive).toBe(maxConcurrency);
      expect(ahko.stats().completedTasks).toBe(totalTasks);
      expect(ahko.stats().activeTasks).toBe(0);
      expect(ahko.stats().pendingTasks).toBe(0);
    });
  });
});
