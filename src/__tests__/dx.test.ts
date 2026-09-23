import { describe, expect, it } from "vitest";
import { Ahko } from "../index.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("Ahko Developer Experience (DX) & Idle State", () => {
  describe("isIdle and onIdle / chill", () => {
    it("should report isIdle() as true initially", () => {
      const ahko = new Ahko();
      expect(ahko.isIdle()).toBe(true);
    });

    it("should resolve onIdle() immediately if scheduler is already idle", async () => {
      const ahko = new Ahko();
      let resolved = false;

      await ahko.onIdle().then(() => {
        resolved = true;
      });

      expect(resolved).toBe(true);
    });

    it("should resolve onIdle() once all pending and active tasks complete", async () => {
      const ahko = new Ahko({ concurrency: 1 });
      let idleResolved = false;

      void ahko.schedule(async () => {
        await sleep(40);
      });

      void ahko.schedule(async () => {
        await sleep(40);
      });

      expect(ahko.isIdle()).toBe(false);

      void ahko.onIdle().then(() => {
        idleResolved = true;
      });

      expect(idleResolved).toBe(false);

      await sleep(50);
      expect(idleResolved).toBe(false);

      await sleep(60);
      expect(idleResolved).toBe(true);
      expect(ahko.isIdle()).toBe(true);
    });

    it("chill() should be a working alias for onIdle()", async () => {
      const ahko = new Ahko();
      let chilled = false;

      void ahko.schedule(async () => {
        await sleep(30);
      });

      void ahko.chill().then(() => {
        chilled = true;
      });

      expect(chilled).toBe(false);
      await sleep(50);
      expect(chilled).toBe(true);
    });
  });

  describe("clear()", () => {
    it("should cancel all pending and delayed tasks when clear() is called", async () => {
      const ahko = new Ahko({ concurrency: 1 });
      const completed: number[] = [];
      const errors: unknown[] = [];

      // Active task
      void ahko.schedule(async () => {
        await sleep(50);
        completed.push(1);
      });

      // Queued task
      void ahko.schedule(async () => {
        completed.push(2);
      }).catch((err) => errors.push(err));

      // Delayed task
      void ahko.schedule(
        async () => {
          completed.push(3);
        },
        { strategy: "delay", delay: 100 }
      ).catch((err) => errors.push(err));

      expect(ahko.stats().pendingTasks).toBe(2);

      ahko.clear();

      expect(ahko.stats().pendingTasks).toBe(0);

      await sleep(70);

      // Active task completed, queued and delayed were cancelled
      expect(completed).toEqual([1]);
      expect(errors).toHaveLength(2);
      expect(ahko.isIdle()).toBe(true);
    });
  });

  describe("battery()", () => {
    it("should return the low-energy chill mascot telemetry", () => {
      const ahko = new Ahko();
      const mascot = ahko.battery();

      expect(mascot.level).toBe(3);
      expect(mascot.chill).toBe(true);
      expect(mascot.status).toBe("low-energy");
      expect(typeof mascot.quote).toBe("string");
      expect(mascot.quote).toContain("chill");
    });
  });

  describe("Extended telemetry stats", () => {
    it("should track totalDispatched and retriedTasks in stats()", async () => {
      const ahko = new Ahko();

      expect(ahko.stats().totalDispatched).toBe(0);
      expect(ahko.stats().retriedTasks).toBe(0);

      let attempts = 0;
      await ahko.schedule(
        async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error("retry me");
          }
          return "success";
        },
        {
          retry: {
            attempts: 2,
            baseDelay: 10,
          },
        }
      );

      const stats = ahko.stats();
      expect(stats.completedTasks).toBe(1);
      expect(stats.retriedTasks).toBe(1);
      expect(stats.totalDispatched).toBe(2);
    });
  });
});
