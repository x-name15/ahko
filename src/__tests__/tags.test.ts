import { describe, it, expect } from "vitest";
import { Ahko } from "../ahko.js";
import { AhkoCancellationError } from "../errors/cancellation.error.js";

describe("Task Tags and Selective Cancellation (ahko.cancelByTag & ahko.statsByTag)", () => {
  it("should classify tasks by tags and report statsByTag accurately", async () => {
    const ahko = new Ahko({ concurrency: 1 });

    const p1 = ahko.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 40)),
      { tags: ["billing", "vip"] }
    );
    const p2 = ahko.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 40)),
      { tags: ["billing"] }
    );
    const p3 = ahko.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 40)),
      { tags: ["analytics"] }
    );

    // p1 is running (concurrency: 1), p2 and p3 are pending
    const billingStats = ahko.statsByTag("billing");
    expect(billingStats.activeTasks).toBe(1);
    expect(billingStats.pendingTasks).toBe(1);

    const vipStats = ahko.statsByTag("vip");
    expect(vipStats.activeTasks).toBe(1);
    expect(vipStats.pendingTasks).toBe(0);

    const analyticsStats = ahko.statsByTag("analytics");
    expect(analyticsStats.activeTasks).toBe(0);
    expect(analyticsStats.pendingTasks).toBe(1);

    const unknownStats = ahko.statsByTag("unknown");
    expect(unknownStats.activeTasks).toBe(0);
    expect(unknownStats.pendingTasks).toBe(0);

    await Promise.all([p1, p2, p3]);
  });

  it("should selectively cancel tasks by tag without impacting unrelated tasks", async () => {
    const ahko = new Ahko({ concurrency: 1 });

    // p1 starts immediately
    const p1 = ahko.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
      { tags: ["user-session"] }
    );

    // p2 is queued with "user-session"
    const p2 = ahko.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
      { tags: ["user-session"] }
    );

    // p3 is queued with "system-health"
    const p3 = ahko.schedule(
      () => "healthy",
      { tags: ["system-health"] }
    );

    // Cancel all tasks associated with "user-session"
    const cancelledCount = ahko.cancelByTag("user-session", "Session logged out");
    expect(cancelledCount).toBe(2);

    // Both p1 and p2 should reject with AhkoCancellationError
    await expect(p1).rejects.toThrow(AhkoCancellationError);
    await expect(p2).rejects.toThrow(AhkoCancellationError);

    // p3 should proceed normally and resolve
    const result3 = await p3;
    expect(result3).toBe("healthy");
  });

  it("should return 0 when cancelling non-existent or settled tags", async () => {
    const ahko = new Ahko({ concurrency: 2 });
    const count = ahko.cancelByTag("non-existent");
    expect(count).toBe(0);
  });

  it("should remove settled tasks from tag index ensuring zero memory leakage", async () => {
    const ahko = new Ahko({ concurrency: 2 });

    const p = ahko.schedule(async () => "done", { tags: ["ephemeral"] });
    expect(ahko.statsByTag("ephemeral").activeTasks + ahko.statsByTag("ephemeral").pendingTasks).toBe(1);

    await p;

    // After settlement, tag entry must be cleared
    const stats = ahko.statsByTag("ephemeral");
    expect(stats.activeTasks).toBe(0);
    expect(stats.pendingTasks).toBe(0);
  });
});
