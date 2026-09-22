<p align="center">
  <img src=".github/images/ahko.png" width="120" height="120" alt="ahko">
</p>

<h1 align="center">ahko</h1>

<p align="center">
  <strong>Let your code chill.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mrjacket/ahko">
    <img src="https://img.shields.io/npm/v/@mrjacket/ahko.svg?color=success" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/@mrjacket/ahko">
    <img src="https://img.shields.io/npm/dm/@mrjacket/ahko.svg" alt="npm downloads">
  </a>
  <a href="https://www.npmjs.com/package/@mrjacket/ahko">
    <img src="https://img.shields.io/node/v/@mrjacket/ahko.svg" alt="node">
  </a>
  <a href="https://github.com/x-name15/ahko/actions/workflows/ci.yml">
    <img src="https://github.com/x-name15/ahko/actions/workflows/ci.yml/badge.svg" alt="ci">
  </a>
  <a href="https://www.npmjs.com/package/@mrjacket/ahko">
    <img src="https://img.shields.io/npm/types/@mrjacket/ahko.svg" alt="types">
  </a>
  <a href="https://github.com/x-name15/ahko/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/@mrjacket/ahko.svg" alt="license">
  </a>
</p>

`ahko` is a low-energy task scheduler for JavaScript and TypeScript.

Inspired by Aashii Kedarui / Ahko from *"The 100 Girlfriends Who Really, Really, Really, Really, Really Love You"*, @mrjacket/ahko brings calm, controlled execution to asynchronous workflows without rush, bursts, or unnecessary complexity.

---

## Installation

```bash
npm install @mrjacket/ahko
```

Requires **Node.js >= 22.12.0** or a modern browser environment. Zero external dependencies.

---

## Quick Start

```typescript
import { Ahko } from "@mrjacket/ahko";

const ahko = new Ahko({ concurrency: 2 });

// Return types are inferred automatically
const data = await ahko.schedule(async ({ signal, taskId }) => {
  const response = await fetch("https://api.example.com/data", { signal });
  return response.json();
});
```

---

## Core Capabilities

### 1. Concurrency Control

Prevent bursts by capping the number of concurrently running asynchronous tasks:

```typescript
const ahko = new Ahko({ concurrency: 3 });

// 20 operations scheduled at once -> 3 running, 17 queued in FIFO order
const promises = Array.from({ length: 20 }, (_, i) =>
  ahko.schedule(async () => {
    await performWork(i);
    return i;
  })
);

const results = await Promise.all(promises);
```

### 2. Delayed Execution

Wait calmly for a specified time before task execution begins:

```typescript
await ahko.schedule(
  async () => {
    console.log("Executed after chill window");
  },
  {
    strategy: "delay",
    delay: 1500, // milliseconds
  }
);
```

### 3. First-Class Cancellation (`AbortSignal`)

AHKO provides native, cooperative cancellation:

```typescript
const controller = new AbortController();

const taskPromise = ahko.schedule(
  async ({ signal }) => {
    return doHeavyOperation({ signal });
  },
  { signal: controller.signal }
);

// Cancel while pending: immediately dequeued and rejected with AhkoCancellationError
// Cancel while running: signal triggers abort on the task context
controller.abort();
```

### 4. Telemetry (`stats`)

Inspect real-time scheduler state without synthetic metrics:

```typescript
const stats = ahko.stats();

console.log(stats);
// {
//   activeTasks: 2,
//   pendingTasks: 5,
//   completedTasks: 42,
//   failedTasks: 1,
//   cancelledTasks: 2,
//   timedOutTasks: 0,
//   capacity: 3
// }
```

---

## API Reference

### `new Ahko(options?: IAhkoOptions)`

Creates an AHKO scheduler instance.

| Option | Type | Default | Description |
|---|---|---|---|
| `concurrency` | `number` | `Infinity` | Maximum concurrent tasks allowed to run simultaneously. Must be $\ge 1$. |

### `ahko.schedule<T>(task: ITask<T>, options?: IScheduleOptions): Promise<T>`

Schedules an asynchronous task with full return type inference.

- `task`: `(context: ITaskContext) => Promise<T> | T`
- `options.strategy`: `"immediate"` (default) or `"delay"`.
- `options.delay`: Delay in milliseconds when strategy is `"delay"`.
- `options.signal`: Optional `AbortSignal` for cancellation.

### `ahko.stats(): IAhkoStats`

Returns a snapshot of current task counters and capacity.

---

## Errors

- `AhkoError`: Base class for all scheduler errors.
- `AhkoCancellationError`: Thrown when a task is aborted.
- `AhkoConfigurationError`: Thrown when invalid options are provided.
- `AhkoQueueError`: Thrown when queue constraints are violated.
- `AhkoTimeoutError`: Thrown when a task exceeds its configured duration.

---

## License
[GNU General Public License v3.0 (GPL-3.0-only)](LICENSE) 

### Credits
**Author:** Mr Jacket / Felix Manrique / x-name15 (we are all the same person)
