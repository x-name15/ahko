import { describe, expect, it } from "vitest";
import { Ahko, AhkoCancellationError, AhkoTimeoutError } from "../index.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("Milestone 1.0.0 — Comprehensive End-to-End (E2E) Stress Suite", () => {
  describe("Scenario 1: High-Concurrency Burst with Rate Limiting (minIntervalMs) & Jittered Retries", () => {
    it("should process a burst of 25 operations respecting concurrency cap and pacing intervals despite flaky failures", async () => {
      // Concurrency 3, paced at least 20ms apart
      const ahko = new Ahko({ concurrency: 3, minIntervalMs: 20 });
      const taskAttempts = new Map<number, number>();
      const executionStartTimestamps: number[] = [];
      const results: number[] = [];

      const promises = Array.from({ length: 15 }, (_, i) => {
        return ahko.schedule(
          async () => {
            const currentAttempt = (taskAttempts.get(i) ?? 0) + 1;
            taskAttempts.set(i, currentAttempt);
            executionStartTimestamps.push(Date.now());

            // Simulate flaky failure on tasks with even index on first attempt
            if (i % 2 === 0 && currentAttempt === 1) {
              throw new Error(`Transient network glitch on task ${i}`);
            }

            await sleep(15);
            results.push(i);
            return i;
          },
          {
            retry: {
              attempts: 3,
              backoff: "exponential",
              baseDelay: 10,
              jitter: true,
            },
          }
        );
      });

      const settledResults = await Promise.all(promises);

      expect(settledResults).toHaveLength(15);
      expect(results).toHaveLength(15);

      // Verify that all flaky tasks succeeded on retry
      for (let i = 0; i < 15; i++) {
        if (i % 2 === 0) {
          expect(taskAttempts.get(i)).toBe(2);
        } else {
          expect(taskAttempts.get(i)).toBe(1);
        }
      }

      // Check stats: 15 completed, 8 retried, 0 failed, 0 active, 0 pending
      const stats = ahko.stats();
      expect(stats.completedTasks).toBe(15);
      expect(stats.retriedTasks).toBe(8);
      expect(stats.failedTasks).toBe(0);
      expect(stats.activeTasks).toBe(0);
      expect(stats.pendingTasks).toBe(0);
      expect(ahko.isIdle()).toBe(true);
    });
  });

  describe("Scenario 2: Interleaved Debounce & Throttle Streams under Queue Contention (VS Code / CLI)", () => {
    it("should coalesce rapid interactive events cleanly while background batch tasks execute in order", async () => {
      const ahko = new Ahko({ concurrency: 2 });
      const batchCompleted: number[] = [];
      const searchQueriesRun: string[] = [];
      const scrollPositionsRecorded: number[] = [];

      // 1. Enqueue 4 background batch tasks (e.g. file indexing or linting)
      const batchPromises = Array.from({ length: 4 }, (_, i) =>
        ahko.schedule(async () => {
          await sleep(25);
          batchCompleted.push(i);
          return `batch_${i}`;
        })
      );

      // 2. Simulate rapid search typing into VS Code search input (coalesces into last call)
      const searchP1 = ahko.debounce("doc_search", async () => {
        searchQueriesRun.push("a");
        return "res_a";
      }, 50);

      await sleep(10);
      const searchP2 = ahko.debounce("doc_search", async () => {
        searchQueriesRun.push("ab");
        return "res_ab";
      }, 50);

      await sleep(10);
      const searchP3 = ahko.debounce("doc_search", async () => {
        searchQueriesRun.push("abc");
        return "res_abc";
      }, 50);

      // 3. Simulate rapid UI scroll events (leading executes, trailing coalesces)
      const scrollP1 = ahko.throttle("viewport_scroll", async () => {
        scrollPositionsRecorded.push(100);
        return 100;
      }, 60);

      const scrollP2 = ahko.throttle("viewport_scroll", async () => {
        scrollPositionsRecorded.push(200);
        return 200;
      }, 60);

      const scrollP3 = ahko.throttle("viewport_scroll", async () => {
        scrollPositionsRecorded.push(300);
        return 300;
      }, 60);

      // Await all streams
      const [bResults, s1, s2, s3, sc1, sc2, sc3] = await Promise.all([
        Promise.all(batchPromises),
        searchP1,
        searchP2,
        searchP3,
        scrollP1,
        scrollP2,
        scrollP3,
      ]);

      // All batch tasks completed in order
      expect(bResults).toEqual(["batch_0", "batch_1", "batch_2", "batch_3"]);
      expect(batchCompleted).toEqual([0, 1, 2, 3]);

      // Debounce: only the final query ran, but ALL 3 promises received the exact same result
      expect(searchQueriesRun).toEqual(["abc"]);
      expect(s1).toBe("res_abc");
      expect(s2).toBe("res_abc");
      expect(s3).toBe("res_abc");

      // Throttle: leading executed with 100, trailing coalesced and executed with 300
      expect(scrollPositionsRecorded).toEqual([100, 300]);
      expect(sc1).toBe(100);
      expect(sc2).toBe(300);
      expect(sc3).toBe(300);

      await ahko.onIdle();
      expect(ahko.isIdle()).toBe(true);
    });
  });

  describe("Scenario 3: VS Code / CLI Cooperative Cancellation Wave", () => {
    it("should instantly cancel a wave of queued and running tasks when active document changes or user cancels build", async () => {
      const ahko = new Ahko({ concurrency: 2 });
      const controller = new AbortController();
      const completed: number[] = [];
      const errors: unknown[] = [];

      // Schedule 10 tasks sharing the cancellation signal
      const tasks = Array.from({ length: 10 }, (_, i) => {
        return ahko
          .schedule(
            async ({ signal }) => {
              // Simulate cooperative checkpoints
              for (let step = 0; step < 5; step++) {
                if (signal.aborted) {
                  throw new AhkoCancellationError("Aborted mid-step");
                }
                await sleep(20);
              }
              completed.push(i);
              return i;
            },
            { signal: controller.signal }
          )
          .catch((err) => {
            errors.push(err);
            throw err;
          });
      });

      // Let the first 2 tasks enter RUNNING state
      await sleep(15);
      expect(ahko.stats().activeTasks).toBe(2);
      expect(ahko.stats().pendingTasks).toBe(8);

      // User hits Cancel or switches document
      controller.abort("User switched tab");

      const settlement = await Promise.allSettled(tasks);

      // All 10 tasks were rejected due to cancellation
      for (const res of settlement) {
        expect(res.status).toBe("rejected");
      }
      expect(completed).toHaveLength(0);
      expect(errors).toHaveLength(10);
      expect(ahko.stats().cancelledTasks).toBe(10);
      expect(ahko.stats().activeTasks).toBe(0);
      expect(ahko.stats().pendingTasks).toBe(0);
      expect(ahko.isIdle()).toBe(true);
    });
  });

  describe("Scenario 4: Graceful Shutdown with Settlement (SIGINT / SIGTERM Simulation)", () => {
    it("should safely clear pending queue while allowing in-flight work to complete cleanly on shutdown", async () => {
      const ahko = new Ahko({ concurrency: 2 });
      const completed: number[] = [];
      const cancelled: unknown[] = [];

      // 2 in-flight tasks
      const inFlight1 = ahko.schedule(async () => {
        await sleep(35);
        completed.push(1);
        return 1;
      });

      const inFlight2 = ahko.schedule(async () => {
        await sleep(35);
        completed.push(2);
        return 2;
      });

      // 3 queued pending tasks
      const queued1 = ahko
        .schedule(async () => {
          completed.push(3);
        })
        .catch((err) => cancelled.push(err));

      const queued2 = ahko
        .schedule(async () => {
          completed.push(4);
        })
        .catch((err) => cancelled.push(err));

      const delayed = ahko
        .schedule(
          async () => {
            completed.push(5);
          },
          { strategy: "delay", delay: 100 }
        )
        .catch((err) => cancelled.push(err));

      // Shutdown signal arrives immediately
      expect(ahko.stats().activeTasks).toBe(2);
      expect(ahko.stats().pendingTasks).toBe(3);

      // 1. Clear unstarted work
      ahko.clear();
      expect(ahko.stats().pendingTasks).toBe(0);

      // 2. Wait for active tasks to settle completely
      await ahko.chill();

      await Promise.all([inFlight1, inFlight2, queued1, queued2, delayed]);

      expect(completed).toEqual([1, 2]);
      expect(cancelled).toHaveLength(3);
      expect(ahko.isIdle()).toBe(true);
    });
  });

  describe("Scenario 5: Complete Telemetry Event Pipeline Audit", () => {
    it("should accurately stream every lifecycle event in proper chronological order with correct payload structures", async () => {
      const ahko = new Ahko({ concurrency: 2 });
      const eventLog: Array<{ event: string; payload: unknown }> = [];

      ahko.on("task:start", (p) => eventLog.push({ event: "task:start", payload: p }));
      ahko.on("task:complete", (p) => eventLog.push({ event: "task:complete", payload: p }));
      ahko.on("task:fail", (p) => eventLog.push({ event: "task:fail", payload: p }));
      ahko.on("task:timeout", (p) => eventLog.push({ event: "task:timeout", payload: p }));
      ahko.on("task:cancel", (p) => eventLog.push({ event: "task:cancel", payload: p }));
      ahko.on("idle", (p) => eventLog.push({ event: "idle", payload: p }));

      // 1. Success task
      const pSuccess = ahko.schedule(async () => {
        await sleep(10);
        return "success";
      });

      // 2. Timeout task
      const pTimeout = ahko.schedule(
        async () => {
          await sleep(80);
          return "never";
        },
        { timeoutMs: 25 }
      ).catch(() => {});

      // 3. Retry -> Success task
      let attempts = 0;
      const pRetry = ahko.schedule(
        async () => {
          attempts++;
          if (attempts === 1) {
            throw new Error("retryable error");
          }
          await sleep(10);
          return "recovered";
        },
        { retry: { attempts: 2, baseDelay: 10 } }
      );

      await Promise.all([pSuccess, pTimeout, pRetry]);
      await ahko.onIdle();

      // Check events received
      const eventNames = eventLog.map((e) => e.event);

      expect(eventNames).toContain("task:start");
      expect(eventNames).toContain("task:complete");
      expect(eventNames).toContain("task:fail");
      expect(eventNames).toContain("task:timeout");
      expect(eventNames).toContain("idle");

      // Verify specific retry failure payload
      const failEvents = eventLog.filter((e) => e.event === "task:fail");
      expect(failEvents.length).toBeGreaterThanOrEqual(1);
      const firstFail = failEvents[0].payload as { willRetry: boolean; attempt: number };
      expect(firstFail.willRetry).toBe(true);
      expect(firstFail.attempt).toBe(1);

      // Verify timeout event payload
      const timeoutEvents = eventLog.filter((e) => e.event === "task:timeout");
      expect(timeoutEvents).toHaveLength(1);
      const timeoutPayload = timeoutEvents[0].payload as { timeoutMs: number };
      expect(timeoutPayload.timeoutMs).toBe(25);
    });
  });

  describe("Scenario 6: Microservice Gateway with Dual Signals & Uncooperative Timeout", () => {
    it("should coordinate external cancellation and internal execution deadline with clean slot liberation", async () => {
      const ahko = new Ahko({ concurrency: 1 });
      const externalController = new AbortController();

      // First task hangs uncooperatively (ignores signal and does not resolve)
      const hangingTask = ahko.schedule(
        () => new Promise(() => {}), // Never resolves
        { timeoutMs: 30 }
      );

      // Second task waits in queue
      const nextTask = ahko.schedule(async () => "next ready");

      await expect(hangingTask).rejects.toThrow(AhkoTimeoutError);

      // Second task runs immediately after the hanging task was aborted by timeout
      const result = await nextTask;
      expect(result).toBe("next ready");
      expect(ahko.isIdle()).toBe(true);
    });
  });
});
