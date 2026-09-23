import { describe, expect, it } from "vitest";
import { Ahko } from "../ahko.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Pause and Resume Flow Control", () => {
  it("should pause dispatching new tasks while allowing in-flight tasks to finish", async () => {
    const ahko = new Ahko({ concurrency: 1 });
    const executed: string[] = [];

    // First task starts immediately
    const task1 = ahko.schedule(async () => {
      await sleep(50);
      executed.push("task-1");
    });

    // Enqueue task 2
    const task2 = ahko.schedule(async () => {
      executed.push("task-2");
    });

    // Immediately pause
    ahko.pause();
    expect(ahko.isPaused()).toBe(true);
    expect(ahko.stats().isPaused).toBe(true);

    // Wait for task 1 to finish
    await task1;
    expect(executed).toEqual(["task-1"]);

    // Wait a brief moment to confirm task 2 has NOT executed while paused
    await sleep(40);
    expect(executed).toEqual(["task-1"]);
    expect(ahko.stats().pendingTasks).toBe(1);

    // Now resume
    ahko.resume();
    expect(ahko.isPaused()).toBe(false);
    expect(ahko.stats().isPaused).toBe(false);

    // Wait for task 2 to finish
    await task2;
    expect(executed).toEqual(["task-1", "task-2"]);
    expect(ahko.stats().pendingTasks).toBe(0);
  });

  it("should handle multiple pause and resume toggles without duplicate execution", async () => {
    const ahko = new Ahko({ concurrency: 2 });
    let count = 0;

    ahko.pause();
    expect(ahko.isPaused()).toBe(true);

    const promises = [
      ahko.schedule(async () => { count++; }),
      ahko.schedule(async () => { count++; }),
      ahko.schedule(async () => { count++; }),
    ];

    await sleep(30);
    expect(count).toBe(0);

    // Resume execution
    ahko.resume();
    expect(ahko.isPaused()).toBe(false);

    await Promise.all(promises);
    expect(count).toBe(3);
  });
});
