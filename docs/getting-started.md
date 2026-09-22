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

## 5. Next Steps

- Explore the complete [Library API Guide](./library.md).
- Learn about the internal [Architecture & Design](./architecture.md).
