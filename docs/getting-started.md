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
