import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Ahko, AhkoConfigurationError, EScheduleStrategy } from "../index.js";

describe("Ahko Core Scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Initialization & Validation", () => {
    it("should instantiate with default options (Infinity capacity)", () => {
      const ahko = new Ahko();
      const stats = ahko.stats();

      expect(stats.capacity).toBe(Infinity);
      expect(stats.activeTasks).toBe(0);
      expect(stats.pendingTasks).toBe(0);
      expect(stats.completedTasks).toBe(0);
    });

    it("should reject invalid concurrency configuration", () => {
      const invalidValues = [0, -5, NaN];

      for (const val of invalidValues) {
        expect(() => new Ahko({ concurrency: val })).toThrow(AhkoConfigurationError);
      }
    });

    it("should reject scheduling non-function tasks", () => {
      const ahko = new Ahko();
      // @ts-expect-error Testing runtime validation
      expect(() => ahko.schedule("not-a-function")).toThrow(AhkoConfigurationError);
    });

    it("should reject unsupported scheduling strategies", () => {
      const ahko = new Ahko();
      // @ts-expect-error Testing invalid runtime strategy
      expect(() => ahko.schedule(async () => 1, { strategy: "unsupported" })).toThrow(
        AhkoConfigurationError
      );
    });
  });

  describe("Immediate Execution & Type Inference", () => {
    it("should resolve task with correct return value and inferred type", async () => {
      const ahko = new Ahko();
      const expectedData = { name: "Ahko", chilled: true, count: 42 };

      const promise = ahko.schedule(async () => expectedData);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(expectedData);
      expect(result.name).toBe("Ahko");
      expect(result.count).toBe(42);
    });

    it("should provide unique taskId in context to each task", async () => {
      const ahko = new Ahko();
      const taskIds: string[] = [];

      const p1 = ahko.schedule(async ({ taskId }) => {
        taskIds.push(taskId);
        return taskId;
      });
      const p2 = ahko.schedule(async ({ taskId }) => {
        taskIds.push(taskId);
        return taskId;
      });

      await vi.runAllTimersAsync();
      await Promise.all([p1, p2]);

      expect(taskIds).toHaveLength(2);
      expect(taskIds[0]).toMatch(/^task_/);
      expect(taskIds[1]).toMatch(/^task_/);
      expect(taskIds[0]).not.toBe(taskIds[1]);
    });

    it("should update completed and failed counters accurately", async () => {
      const ahko = new Ahko();
      const expectedError = new Error("Task failed deliberately");

      const successTask = ahko.schedule(async () => "ok");
      const failTask = ahko.schedule(async () => {
        throw expectedError;
      });
      const failAssertion = expect(failTask).rejects.toThrow(expectedError);

      await vi.runAllTimersAsync();
      await expect(successTask).resolves.toBe("ok");
      await failAssertion;

      const stats = ahko.stats();
      expect(stats.completedTasks).toBe(1);
      expect(stats.failedTasks).toBe(1);
      expect(stats.activeTasks).toBe(0);
      expect(stats.pendingTasks).toBe(0);
    });
  });

  describe("Delay Strategy", () => {
    it("should reject negative or NaN delay", () => {
      const ahko = new Ahko();
      expect(() =>
        ahko.schedule(async () => 1, {
          strategy: EScheduleStrategy.DELAY,
          delay: -100,
        })
      ).toThrow(AhkoConfigurationError);

      expect(() =>
        ahko.schedule(async () => 1, {
          strategy: EScheduleStrategy.DELAY,
          delay: NaN,
        })
      ).toThrow(AhkoConfigurationError);
    });

    it("should execute task only after delay duration elapses", async () => {
      const ahko = new Ahko();
      let executed = false;
      const delayMs = 2000;

      const promise = ahko.schedule(
        async () => {
          executed = true;
          return "chilled";
        },
        {
          strategy: EScheduleStrategy.DELAY,
          delay: delayMs,
        }
      );

      expect(ahko.stats().pendingTasks).toBe(1);
      expect(executed).toBe(false);

      // Advance halfway
      await vi.advanceTimersByTimeAsync(delayMs / 2);
      expect(executed).toBe(false);

      // Advance remaining time
      await vi.advanceTimersByTimeAsync(delayMs / 2);
      const result = await promise;

      expect(executed).toBe(true);
      expect(result).toBe("chilled");
      expect(ahko.stats().pendingTasks).toBe(0);
      expect(ahko.stats().completedTasks).toBe(1);
    });
  });
});
