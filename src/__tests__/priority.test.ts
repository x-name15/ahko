import { describe, expect, it } from "vitest";
import { Ahko } from "../ahko.js";
import { resolvePriorityWeight, TASK_PRIORITY_WEIGHTS } from "../models/priority.model.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Task Priority Queue", () => {
  it("should resolve correct numerical weights for named and custom priorities", () => {
    expect(resolvePriorityWeight("high")).toBe(TASK_PRIORITY_WEIGHTS.high);
    expect(resolvePriorityWeight("normal")).toBe(TASK_PRIORITY_WEIGHTS.normal);
    expect(resolvePriorityWeight("low")).toBe(TASK_PRIORITY_WEIGHTS.low);
    expect(resolvePriorityWeight(undefined)).toBe(TASK_PRIORITY_WEIGHTS.normal);
    expect(resolvePriorityWeight(50)).toBe(50);
    expect(resolvePriorityWeight(-5)).toBe(-5);
  });

  it("should dispatch high priority tasks ahead of normal and low priority tasks", async () => {
    // Concurrency 1 ensures tasks must wait in queue
    const ahko = new Ahko({ concurrency: 1 });
    const executionOrder: string[] = [];

    // Occupy the single slot
    const blocker = ahko.schedule(async () => {
      await sleep(60);
      executionOrder.push("blocker");
    });

    // Enqueue tasks while slot is occupied
    const lowTask = ahko.schedule(
      async () => {
        executionOrder.push("low");
      },
      { priority: "low" }
    );

    const normalTask = ahko.schedule(
      async () => {
        executionOrder.push("normal");
      },
      { priority: "normal" }
    );

    const highTask = ahko.schedule(
      async () => {
        executionOrder.push("high");
      },
      { priority: "high" }
    );

    const criticalTask = ahko.schedule(
      async () => {
        executionOrder.push("critical-100");
      },
      { priority: 100 }
    );

    await Promise.all([blocker, lowTask, normalTask, highTask, criticalTask]);

    expect(executionOrder).toEqual([
      "blocker",
      "critical-100",
      "high",
      "normal",
      "low",
    ]);
  });

  it("should maintain strict FIFO ordering among tasks with the identical priority", async () => {
    const ahko = new Ahko({ concurrency: 1 });
    const executionOrder: number[] = [];

    const blocker = ahko.schedule(async () => {
      await sleep(50);
    });

    const tasks: Promise<void>[] = [];
    for (let i = 1; i <= 5; i++) {
      const id = i;
      tasks.push(
        ahko.schedule(
          async () => {
            executionOrder.push(id);
          },
          { priority: "high" }
        )
      );
    }

    await Promise.all([blocker, ...tasks]);
    expect(executionOrder).toEqual([1, 2, 3, 4, 5]);
  });
});
