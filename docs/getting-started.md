# Getting Started with @mrjacket/ahko

`@mrjacket/ahko` is a low-energy task scheduler for JavaScript and TypeScript designed to control when asynchronous operations run, prevent bursty workload spikes, and manage concurrency.

---

## 1. Installation

```bash
npm install @mrjacket/ahko
```

### Runtime Requirements
- **Node.js**: `>= 22.12.0` (ESM-first, zero runtime dependencies)
- **Browser**: All modern browsers supporting `AbortController` and `Promise`.

---

## 2. Core Concepts

AHKO solves a very simple problem:

> *"I have work that needs to happen, but it doesn't necessarily need to happen right now."*

Instead of firing dozens or hundreds of asynchronous tasks simultaneously (e.g. hitting an API, querying a database, or reading files), AHKO passes them through a controlled scheduler queue with:
- Strict concurrency limits
- Explicit scheduling strategies (`immediate`, `delay`)
- First-class cooperative cancellation via `AbortSignal`
- Accurate real-time telemetry

---

## 3. Basic Usage

### Scheduling a Task
```typescript
import { Ahko } from "@mrjacket/ahko";

const ahko = new Ahko();

// Return types are automatically inferred
const user = await ahko.schedule(async ({ signal, taskId }) => {
  const response = await fetch("https://api.example.com/user", { signal });
  return response.json();
});

console.log(user.id);
```

### Controlling Concurrency
```typescript
// Allow at most 2 tasks running simultaneously
const ahko = new Ahko({ concurrency: 2 });

const operations = Array.from({ length: 10 }, (_, i) =>
  ahko.schedule(async () => {
    await doWork(i);
    return i;
  })
);

// 2 run concurrently; the remaining 8 wait in FIFO order
const results = await Promise.all(operations);
```

### Delaying Execution
```typescript
await ahko.schedule(
  async () => {
    console.log("Chill delay completed");
  },
  {
    strategy: "delay",
    delay: 2000, // wait 2 seconds before entering queue
  }
);
```

### Opportunistic Idle Execution
Run background tasks when the platform has available idle capacity (using `requestIdleCallback` in browsers, `setImmediate` in Node.js, or `setTimeout(..., 0)`):

```typescript
// Via strategy
await ahko.schedule(
  async ({ signal }) => {
    await sendNonCriticalTelemetry({ signal });
  },
  { strategy: "idle", idleTimeout: 5000 }
);

// Or via the idle() convenience method
await ahko.idle(async ({ signal }) => {
  await indexCachedRecords({ signal });
});
```

### Automatic Retries with Exponential Backoff
Configure resilient retries with optional jitter to spread out retries and prevent thundering herd problems:

```typescript
const result = await ahko.schedule(
  async ({ signal, taskId }) => {
    return fetchUnstableEndpoint({ signal });
  },
  {
    retry: {
      attempts: 3,                // 1 initial run + up to 2 retries
      backoff: "exponential",     // "exponential" | "linear" | "none"
      baseDelay: 200,             // starts at 200ms
      maxDelay: 5000,             // caps at 5 seconds
      jitter: true,               // full jitter randomization
      shouldRetry: (error, attempt) => {
        // Only retry network errors or 5xx server issues
        return error instanceof NetworkError;
      },
    },
  }
);
```

---

## 4. Cancellation with `AbortSignal`

Cancellation is cooperative and native:

```typescript
const controller = new AbortController();

const promise = ahko.schedule(
  async ({ signal }) => {
    return heavyTask({ signal });
  },
  { signal: controller.signal }
);

// If aborted while queued: removed immediately, rejects with AhkoCancellationError
// If aborted while running: signal.aborted becomes true, triggers abort event
controller.abort();
```

---

## 5. Execution Timeouts (`timeoutMs`)

Enforce strict execution deadlines on tasks. If a task exceeds `timeoutMs`, its context signal is aborted and the promise rejects with `AhkoTimeoutError`:

```typescript
import { Ahko, AhkoTimeoutError } from "@mrjacket/ahko";

const ahko = new Ahko();

try {
  await ahko.schedule(
    async ({ signal }) => {
      // Long-running operation aborted if it takes longer than 2.5s
      const response = await fetch("https://api.example.com/slow-export", { signal });
      return response.blob();
    },
    { timeoutMs: 2500 }
  );
} catch (error) {
  if (error instanceof AhkoTimeoutError) {
    console.error(`Task timed out after ${error.timeoutMs}ms`);
  }
}
```

> **Note:** `timeoutMs` only measures the task's **active execution time** in a concurrency slot. Time waiting in the queue does not count against the timeout, and each retry attempt receives a fresh `timeoutMs` window.

---

## 6. Debounce & Throttle with Promise Coalescing

### Debounce
Wait for a quiet period before running. When called repeatedly with the same `key`, the timer resets, and **all callers share the exact same returned Promise**:

```typescript
// 10 keystrokes typed rapidly in search box -> only 1 API call after 300ms of inactivity
const searchResults = await ahko.debounce("search_input", async () => {
  return fetchSearchResults(currentQuery);
}, 300);
```

### Throttle
Ensure an action runs at most once per designated interval. The leading call executes immediately, and calls arriving during the window coalesce into a single trailing run:

```typescript
// Rapid scroll events -> at most 1 execution every 100ms
await ahko.throttle("scroll_tracker", async () => {
  recordScrollPosition(window.scrollY);
}, 100);
```

---

## 7. Interval Rate Limiting (`minIntervalMs`)

Prevent burst workloads by pacing task dispatching, ensuring at least `minIntervalMs` elapses between consecutive task starts:

```typescript
// Concurrency 3, but paced so tasks start at least 50ms apart
const ahko = new Ahko({ concurrency: 3, minIntervalMs: 50 });

const operations = Array.from({ length: 10 }, (_, i) =>
  ahko.schedule(async () => callPacedApi(i))
);

await Promise.all(operations);
```

---

## 8. Next Steps

- Explore the complete [Library API Guide](./library.md).
- Learn about the internal [Architecture & Design](./architecture.md).
