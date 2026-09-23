import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Ahko } from "../ahko.js";
import { AhkoConfigurationError } from "../errors/configuration.error.js";
import type { IAhkoFileConfig } from "../models/config.model.js";

describe("Function Wrapping (ahko.wrap) and Declarative Config", () => {
  beforeEach(() => {
    Ahko.resetConfig();
  });

  afterEach(() => {
    Ahko.resetConfig();
  });

  describe("ahko.wrap()", () => {
    it("should return a wrapped function that schedules execution through Ahko", async () => {
      const ahko = new Ahko({ concurrency: 2 });

      const multiply = ahko.wrap(async (a: number, b: number) => a * b);
      const result = await multiply(6, 7);

      expect(result).toBe(42);
      expect(ahko.stats().completedTasks).toBe(1);
    });

    it("should apply scheduler options (like priority) to wrapped calls", async () => {
      const ahko = new Ahko({ concurrency: 1 });
      const order: string[] = [];

      // Block slot
      const blocker = ahko.schedule(async () => {
        await new Promise((r) => setTimeout(r, 40));
        order.push("blocker");
      });

      const lowCall = ahko.wrap(async (name: string) => {
        order.push(name);
      }, { priority: "low" });

      const highCall = ahko.wrap(async (name: string) => {
        order.push(name);
      }, { priority: "high" });

      const p1 = lowCall("low-item");
      const p2 = highCall("high-item");

      await Promise.all([blocker, p1, p2]);
      expect(order).toEqual(["blocker", "high-item", "low-item"]);
    });

    it("should throw AhkoConfigurationError when wrapping non-function", () => {
      const ahko = new Ahko();
      expect(() => ahko.wrap(null as unknown as () => void)).toThrow(AhkoConfigurationError);
    });
  });

  describe("Declarative Configuration (config.ahko.json)", () => {
    it("should load configuration programmatically and initialize scheduler from default profile", () => {
      const testConfig: IAhkoFileConfig = {
        default: {
          concurrency: 3,
          minIntervalMs: 50,
          priority: "high",
        },
        profiles: {
          crawler: {
            concurrency: 5,
            minIntervalMs: 200,
          },
          critical: {
            concurrency: 1,
            priority: 100,
            circuitBreaker: {
              failureThreshold: 2,
              resetTimeoutMs: 500,
            },
          },
        },
      };

      Ahko.loadConfig(testConfig);
      expect(Ahko.getActiveConfig()).toEqual(testConfig);

      // Default instance inherits default profile
      const defaultAhko = new Ahko();
      expect(defaultAhko.stats().capacity).toBe(3);

      // Instantiating named profile via Ahko.fromProfile
      const crawler = Ahko.fromProfile("crawler");
      expect(crawler.stats().capacity).toBe(5);

      // Named profile with circuit breaker
      const critical = Ahko.fromProfile("critical");
      expect(critical.stats().capacity).toBe(1);
      expect(critical.circuitBreaker).toBeDefined();
    });

    it("should allow overrides over profile settings", () => {
      Ahko.loadConfig({
        profiles: {
          standard: {
            concurrency: 4,
          },
        },
      });

      const custom = Ahko.fromProfile("standard", { concurrency: 8 });
      expect(custom.stats().capacity).toBe(8);
    });

    it("should fall back gracefully to standard defaults when no config file or profile exists", () => {
      Ahko.resetConfig();
      const instance = new Ahko();
      expect(instance.stats().capacity).toBe(Infinity);
      expect(instance.circuitState).toBeUndefined();
      expect(instance.isPaused()).toBe(false);
    });
  });
});
