# Production Recipes & Architectural Patterns

This guide presents battle-tested architectural patterns demonstrating how **`@mrjacket/ahko`** solves real-world backend and frontend engineering challenges without burst overload or unnecessary dependencies.

---

## Table of Contents

1. [Recipe 1: Paced Rate-Limited API Client (GitHub / Discord)](#recipe-1-paced-rate-limited-api-client)
2. [Recipe 2: Debounced Live Search & Form Autosave](#recipe-2-debounced-live-search--form-autosave)
3. [Recipe 3: Throttled Viewport Resizing & High-Frequency Events](#recipe-3-throttled-viewport-resizing--high-frequency-events)
4. [Recipe 4: Non-Blocking Background Telemetry & Cache Indexing](#recipe-4-non-blocking-background-telemetry--cache-indexing)
5. [Recipe 5: Resilient Microservice Client with Jitter & Timeout](#recipe-5-resilient-microservice-client-with-jitter--timeout)
6. [Recipe 6: Graceful Application Shutdown with State Settlement](#recipe-6-graceful-application-shutdown-with-state-settlement)

---

## Recipe 1: Paced Rate-Limited API Client

### The Problem
External REST APIs (e.g. GitHub, Discord, Stripe, Shopify) strictly limit both total concurrent connections and request frequencies. Firing 50 asynchronous requests at once immediately triggers `429 Too Many Requests` status codes.

### The Ahko Solution
Configure `concurrency` alongside `minIntervalMs` (task start pacing). Even if concurrency capacity is immediately free, Ahko ensures a guaranteed quiet interval elapses between consecutive request dispatches.

```typescript
import { Ahko } from "@mrjacket/ahko";

export class GitHubApiClient {
  private readonly ahko: Ahko;

  constructor() {
    // Max 2 concurrent requests, paced at least 100ms apart
    this.ahko = new Ahko({ concurrency: 2, minIntervalMs: 100 });
  }

  async fetchRepository(repo: string): Promise<Record<string, unknown>> {
    return this.ahko.schedule(async ({ signal }) => {
      const res = await fetch(`https://api.github.com/repos/${repo}`, { signal });
      if (!res.ok) {
        throw new Error(`GitHub API error: ${res.statusText}`);
      }
      return res.json();
    });
  }
}
```

---

## Recipe 2: Debounced Live Search & Form Autosave

### The Problem
In web apps or forms, triggering network requests or file writes on every keystroke leads to server congestion, race conditions, and out-of-order response overwrites.

### The Ahko Solution
Use `ahko.debounce()` with an explicit identity `key`. Multiple calls sharing the same key reset the quiet window timer and coalesce into a single execution. All callers awaiting that key receive the exact same final result.

```typescript
import { Ahko } from "@mrjacket/ahko";

const ahko = new Ahko();

export async function onSearchInput(query: string): Promise<string[]> {
  // If the user types 10 letters rapidly, only 1 network call runs
  // after 300ms of user inactivity
  return ahko.debounce("search-input", async ({ signal }) => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
    return res.json();
  }, 300);
}
```

---

## Recipe 3: Throttled Viewport Resizing & High-Frequency Events

### The Problem
Window resize, scroll, or websocket message bursts can fire hundreds of times per second. Running expensive recalculations or DOM updates synchronously degrades user experience and CPU efficiency.

### The Ahko Solution
Use `ahko.throttle()` with an explicit `key`. The leading call executes immediately, and calls that arrive while the throttle interval is active coalesce into a single trailing run when the interval completes.

```typescript
import { Ahko } from "@mrjacket/ahko";

const ahko = new Ahko();

export function onWindowScroll(scrollY: number): void {
  void ahko.throttle("scroll-analytics", async () => {
    await sendScrollMetrics({ scrollY, timestamp: Date.now() });
  }, 200);
}
```

---

## Recipe 4: Non-Blocking Background Telemetry & Cache Indexing

### The Problem
Auxiliary tasks (e.g. logging metrics, cleaning local storage, prefetching assets) must never block main thread interaction in browsers or starve HTTP server request loops in Node.js.

### The Ahko Solution
Use `ahko.idle()` or `strategy: "idle"`. Ahko automatically schedules execution using `requestIdleCallback` in browsers and `setImmediate` in Node.js, ensuring priority work executes first.

```typescript
import { Ahko } from "@mrjacket/ahko";

const ahko = new Ahko();

export async function recordTelemetry(event: string, payload: unknown): Promise<void> {
  await ahko.idle(async ({ signal }) => {
    await fetch("/telemetry", {
      method: "POST",
      body: JSON.stringify({ event, payload }),
      signal,
    });
  }, { idleTimeout: 5000 });
}
```

---

## Recipe 5: Resilient Microservice Client with Jitter & Timeout

### The Problem
Downstream services may occasionally experience transient latency spikes or network drops. Naive retries risk causing thundering herd stampedes, while hanging requests exhaust socket pools.

### The Ahko Solution
Combine `timeoutMs`, `retry` with exponential backoff, and full `jitter`. Concurrency slots are freed immediately during backoff sleep, and uncooperative tasks are aborted promptly when exceeding deadlines.

```typescript
import { Ahko } from "@mrjacket/ahko";

const ahko = new Ahko({ concurrency: 10 });

export async function queryBillingService(customerId: string): Promise<unknown> {
  return ahko.schedule(
    async ({ signal }) => {
      const res = await fetch(`https://billing.internal/customers/${customerId}`, { signal });
      return res.json();
    },
    {
      timeoutMs: 3000, // 3s execution timeout per attempt
      retry: {
        attempts: 3,
        backoff: "exponential",
        baseDelay: 200,
        maxDelay: 2000,
        jitter: true, // Randomizes sleep to prevent thundering herd
        shouldRetry: (error) => {
          // Only retry network errors, not client validation (4xx)
          return !(error instanceof TypeError && error.message.includes("400"));
        },
      },
    }
  );
}
```

---

## Recipe 6: Graceful Application Shutdown with State Settlement

### The Problem
During deployment or server shutdown (`SIGTERM`, `SIGINT`), terminating the Node.js process immediately abruptly cuts off active tasks, corrupting database transactions or leaving partial writes.

### The Ahko Solution
On termination signals, stop accepting new operations, cancel long-delayed or unnecessary tasks with `ahko.clear()`, and await `ahko.onIdle()` (or the mascot alias `ahko.chill()`) before exiting.

```typescript
import { Ahko } from "@mrjacket/ahko";

const ahko = new Ahko({ concurrency: 5 });

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, waiting for Ahko tasks to settle...`);

  // Clear queued and delayed tasks that haven't started yet
  ahko.clear();

  // Wait for all in-flight tasks to complete peacefully
  await ahko.chill();

  console.log("All tasks completed chill and calm. Exiting process.");
  process.exit(0);
}

process.once("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => void gracefulShutdown("SIGINT"));
```
