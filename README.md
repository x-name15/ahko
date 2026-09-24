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
    <img src="https://img.shields.io/node/v/@mrjacket/ahko.svg" alt="node">
  </a>
  <a href="https://www.npmjs.com/package/@mrjacket/ahko">
    <img src="https://img.shields.io/npm/dm/@mrjacket/ahko.svg" alt="npm downloads">
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
  <a href="https://www.npmjs.com/package/@mrjacket/ahko">
    <img src="https://img.shields.io/badge/dependencies-0-success" alt="zero dependencies">
  </a>
  <a href="https://github.com/x-name15/ahko/issues">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">
  </a>
  <a href="https://buymeacoffee.com/mrjacket">
    <img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee">
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

### 3. Opportunistic Idle Execution

Schedule work to run when the runtime is idle (using browser `requestIdleCallback`, Node.js `setImmediate`, or universal fallback):

```typescript
// Dedicated convenience method
await ahko.idle(async ({ signal }) => {
  await computeBackgroundAnalytics({ signal });
});

// Or via schedule options with maximum wait timeout
await ahko.schedule(
  async ({ signal }) => {
    await performLowPriorityWork({ signal });
  },
  {
    strategy: "idle",
    idleTimeout: 5000, // Forces execution if idle window doesn't appear in 5s
  }
);
```

### 4. Resilient Retries & Backoff

Automatically retry failed tasks with configurable exponential or linear backoff and full jitter:

```typescript
const result = await ahko.schedule(
  async ({ signal }) => {
    return callExternalService({ signal });
  },
  {
    retry: {
      attempts: 3,            // 1 initial run + up to 2 retries
      backoff: "exponential", // "exponential" | "linear" | "none"
      baseDelay: 250,         // starting delay in ms
      maxDelay: 5000,         // maximum delay cap in ms
      jitter: true,           // randomize backoff to prevent thundering herds
      shouldRetry: (error) => isNetworkError(error),
    },
  }
);
```

### 5. First-Class Cancellation (`AbortSignal`)

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

### 6. Execution Deadlines & Timeouts (`timeoutMs`)

Enforce deadlines per attempt. If a task exceeds `timeoutMs`, its context signal is aborted and the task rejects with `AhkoTimeoutError`:

```typescript
try {
  await ahko.schedule(
    async ({ signal }) => {
      return callLongRunningApi({ signal });
    },
    { timeoutMs: 3000 } // aborts and rejects if running longer than 3 seconds
  );
} catch (error) {
  if (error instanceof AhkoTimeoutError) {
    console.error(`Timed out after ${error.timeoutMs}ms`);
  }
}
```

### 7. Debounce & Throttle with Promise Coalescing

Coalesce repeated invocations into shared executions by explicit `key`. Callers share the exact same returned Promise:

```typescript
// Debounce: waits for 300ms of quiet before running
const results = await ahko.debounce("search_box", async () => {
  return queryApi(text);
}, 300);

// Throttle: runs leading edge immediately, coalesces trailing calls
await ahko.throttle("window_resize", async () => {
  recalculateLayout();
}, 100);
```

### 8. Paced Execution (`minIntervalMs`)

Prevent burst spikes by ensuring a minimum interval elapses between consecutive task starts:

```typescript
// At most 2 concurrent tasks, paced at least 50ms apart
const ahko = new Ahko({ concurrency: 2, minIntervalMs: 50 });
```

### 9. Telemetry (`stats`)

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
//   timedOutTasks: 1,
//   retriedTasks: 3,
//   totalDispatched: 45,
//   capacity: 3
// }
```

### 10. Lifecycle Events (`on` / `off`)

Listen to typed lifecycle events with isolated callback safety:

```typescript
const unsubscribe = ahko.on("task:start", ({ taskId, attempt }) => {
  console.log(`Task ${taskId} started attempt #${attempt}`);
});

ahko.on("task:complete", ({ taskId, durationMs, result }) => {
  console.log(`Task ${taskId} completed in ${durationMs}ms:`, result);
});

ahko.on("task:fail", ({ taskId, attempt, error, willRetry }) => {
  console.warn(`Task ${taskId} attempt #${attempt} failed (willRetry: ${willRetry})`, error);
});

ahko.on("task:timeout", ({ taskId, timeoutMs }) => {
  console.warn(`Task ${taskId} exceeded ${timeoutMs}ms deadline`);
});

ahko.on("task:cancel", ({ taskId, reason }) => {
  console.info(`Task ${taskId} was cancelled:`, reason);
});

ahko.on("idle", ({ timestamp }) => {
  console.log("Scheduler transitioned to idle at", timestamp);
});
```

### 11. Idle & Chill Developer Experience

Wait for all work to settle or clear the queue cleanly:

```typescript
// Wait for all active and pending tasks to finish
await ahko.onIdle();
// Or use the completely chill alias:
await ahko.chill();

// Check if scheduler is currently idle
if (ahko.isIdle()) {
  console.log("Completely chill. No tasks running or queued.");
}

// Clear all queued, delayed, and coalesced tasks
ahko.clear();

// Check Ahko mascot battery telemetry
console.log(ahko.battery());
// { level: 3, chill: true, status: "low-energy", quote: "Mwee... my battery is low, but all your tasks are handled completely chill." }
```

### 12. Priority-Aware Scheduling

Ensure critical tasks jump ahead of normal or background work while preserving strict FIFO ordering among peers:

```typescript
// Named priorities: "high" (10), "normal" (0), "low" (-10), or custom numeric weights
await ahko.schedule(criticalTask, { priority: "high" });
await ahko.schedule(backgroundSync, { priority: "low" });
await ahko.schedule(superUrgent, { priority: 100 });
```

### 13. Circuit Breaker Protection

Protect fragile downstream services and databases from cascading failures. When consecutive failures meet `failureThreshold`, the circuit trips to `OPEN` and fast-fails tasks immediately without execution:

```typescript
const ahko = new Ahko({
  concurrency: 2,
  circuitBreaker: {
    failureThreshold: 3, // trip after 3 consecutive failures
    resetTimeoutMs: 15000, // wait 15s before attempting recovery probe
  },
});

try {
  await ahko.schedule(callFlakyService);
} catch (err) {
  if (err instanceof AhkoCircuitBreakerOpenError) {
    console.warn("Fast-failed: Circuit breaker is OPEN!");
  }
}
```

### 14. Pause & Resume Flow Control

Temporarily halt queue dispatching without aborting in-flight tasks. Resuming immediately pumps accumulated tasks up to capacity:

```typescript
// Stop dispatching new tasks
ahko.pause();
console.log(ahko.isPaused()); // true

// In-flight tasks finish peacefully...

// Resume dispatching
ahko.resume();
```

### 15. Total Timeout Budget

Enforce an overarching deadline spanning queue wait time, execution, and retries:

```typescript
// Task will abort with AhkoTimeoutError if total elapsed time exceeds 5000ms
await ahko.schedule(fetchWithRetries, {
  totalTimeoutMs: 5000,
  retry: { attempts: 3, baseDelay: 1000 },
});
```

### 16. Function Wrapping (`ahko.wrap`)

Decorate any async function to automatically route every invocation through Ahko:

```typescript
const fetchUser = ahko.wrap(
  async (userId: string) => {
    const res = await fetch(`https://api.example.com/users/${userId}`);
    return res.json();
  },
  { priority: "high", retry: { attempts: 2 } }
);

// Seamlessly executed via scheduler
const user = await fetchUser("usr_42");
```

### 17. Declarative Configuration (`config.ahko.json`)

Define scheduler defaults and workload profiles cleanly in JSON:

```json
{
  "default": {
    "concurrency": 2,
    "minIntervalMs": 50,
    "priority": "normal"
  },
  "profiles": {
    "crawler": {
      "concurrency": 4,
      "minIntervalMs": 200,
      "priority": "low"
    },
    "critical-gateway": {
      "concurrency": 1,
      "circuitBreaker": {
        "failureThreshold": 3,
        "resetTimeoutMs": 10000
      }
    }
  }
}
```

```typescript
// Programmatically or from config file:
Ahko.loadConfig(config);

// Instantiate configured scheduler from profile
const gateway = Ahko.fromProfile("critical-gateway");
```

### 18. Batch Collections API (`ahko.map` & `ahko.each`)

Transform collections concurrently with strict index order preservation and localized concurrency limits:

```typescript
const urls = ["/api/users", "/api/posts", "/api/comments"];

// Processes concurrently (max 2 at a time), guaranteed return in original order
const responses = await ahko.map(
  urls,
  async (url, index, { signal }) => {
    const res = await fetch(url, { signal });
    return res.json();
  },
  { concurrency: 2, stopOnError: true }
);

// Or iterate over items returning void:
await ahko.each(userIds, async (id) => syncUser(id), { concurrency: 5 });
```

### 19. Dynamic & Adaptive Concurrency (AIMD Auto-Chill)

Adjust concurrency dynamically on the fly or let Ahko adapt automatically to network latency:

```typescript
// Manually update concurrency at runtime:
ahko.setConcurrency(5);
console.log(ahko.concurrency); // 5

// Or enable AIMD (Additive Increase / Multiplicative Decrease) Auto-Chill mode:
const adaptiveAhko = new Ahko({
  concurrency: 4,
  adaptive: {
    targetLatencyMs: 150, // if tasks take >150ms, cut concurrency in half
    sampleWindowSize: 5,   // adjust after every 5 completed tasks
    minConcurrency: 1,
    maxConcurrency: 10,
    backoffFactor: 0.5,
  },
});

adaptiveAhko.on("concurrency:change", ({ previousConcurrency, currentConcurrency, reason }) => {
  console.log(`Capacity adapted: ${previousConcurrency} -> ${currentConcurrency} (${reason})`);
});
```

### 20. Task Tags & Selective Cancellation

Classify tasks by tags, query categorical telemetry, and selectively cancel specific operations:

```typescript
// Tag tasks during scheduling:
ahko.schedule(generateReport, { tags: ["reports", "finance"] });
ahko.schedule(syncDatabase, { tags: ["sync"] });

// Check active and pending tasks by tag:
console.log(ahko.statsByTag("reports")); // { activeTasks: 1, pendingTasks: 0 }

// Cancel all tasks associated with a tag without affecting other tasks:
ahko.cancelByTag("reports", "User navigated away");
```

---

## Documentation

Comprehensive guides and technical documentation are available in the [`docs/`](./docs) directory:

| Document | Description |
|---|---|
| [**Documentation Portal**](./docs/README.md) | Master overview and index of all guides and specifications. |
| [**Getting Started**](./docs/guides/getting-started.md) | Quickstart guide, installation, and fundamental usage patterns. |
| [**Declarative Configuration**](./docs/guides/configuration.md) | Centralizing limits in `config.ahko.json`, `$schema` validation, named profiles, and fallback rules. |
| [**Library API**](./docs/guides/library.md) | Complete programmatic API reference, TypeScript interfaces, and options. |
| [**Production Recipes**](./docs/guides/recipes.md) | Battle-tested recipes (paced API client, debounced search, throttled scroll, graceful shutdown). |
| [**Architecture**](./docs/architecture/ARCHITECTURE.md) | Architectural specifications, lifecycle state machine, and design decisions. |
| [**Roadmap**](./docs/architecture/ROADMAP.md) | Milestone progression from 0.1.0 through 1.1.0. |
| [**Engineering Log**](./docs/architecture/LOG.md) | Chronological log of engineering decisions and ADRs. |

> **Runnable Examples:** A comprehensive suite of standalone, runnable Node.js scripts is available in the [`examples/`](./examples/) folder. See [`examples/README.md`](./examples/README.md) for details.

---

## API Reference

### `new Ahko(options?: IAhkoOptions)`

Creates an ahko scheduler instance.

| Option | Type | Default | Description |
|---|---|---|---|
| `concurrency` | `number` | `Infinity` | Maximum concurrent tasks allowed to run simultaneously. Must be $\ge 1$. |
| `minIntervalMs` | `number` | `0` | Minimum interval in milliseconds between consecutive task starts. Must be $\ge 0$. |
| `circuitBreaker` | `ICircuitBreakerOptions` | `undefined` | Optional failure threshold and cooldown reset configuration. |
| `adaptive` | `IAdaptiveConcurrencyOptions` | `undefined` | Optional AIMD adaptive concurrency options based on task execution latency. |
| `profile` | `string` | `undefined` | Name of declarative profile to inherit settings from. |

### `ahko.concurrency`

Getter returning the current concurrency capacity limit.

### `ahko.setConcurrency(newConcurrency: number): void`

Dynamically updates the concurrency limit of the scheduler at runtime.

### `ahko.map<TItem, TResult>(items, fn, options?): Promise<TResult[]>`

Concurrently transforms an iterable sequence into an array with strict index ordering. Supports localized `concurrency` limits and `stopOnError`.

### `ahko.each<TItem>(items, fn, options?): Promise<void>`

Iterates over an iterable sequence concurrently, executing the callback for each element.

### `ahko.cancelByTag(tag: string, reason?: unknown): number`

Cancels all pending, delayed, and active tasks marked with the specified tag. Returns the number of cancelled tasks.

### `ahko.statsByTag(tag: string): { activeTasks: number; pendingTasks: number }`

Returns active and pending task counts for a specific classification tag.

### `ahko.schedule<T>(task: ITask<T>, options?: IScheduleOptions): Promise<T>`

Schedules an asynchronous task with full return type inference.

| Option | Type | Default | Description |
|---|---|---|---|
| `strategy` | `"immediate" \| "delay" \| "idle" \| "throttle" \| "debounce"` | `"immediate"` | Scheduling execution strategy. |
| `priority` | `"high" \| "normal" \| "low" \| number` | `"normal"` | Task priority weight for queue ordering. |
| `delay` | `number` | `0` | Delay in milliseconds when strategy is `"delay"`. |
| `key` | `string \| symbol` | `undefined` | Explicit identity key for `"debounce"` and `"throttle"`. |
| `waitMs` | `number` | `undefined` | Window duration in ms for debounce quiet period or throttle interval. |
| `idleTimeout` | `number` | `undefined` | Maximum time to wait for idle window before forcing queue entry. |
| `retry` | `IRetryOptions` | `undefined` | Automatic retry policy (attempts, backoff, jitter, predicate). |
| `timeoutMs` | `number` | `undefined` | Maximum execution duration in milliseconds per attempt before aborting with `AhkoTimeoutError`. |
| `totalTimeoutMs` | `number` | `undefined` | Total execution budget across wait time, retries, and execution. |
| `signal` | `AbortSignal` | `undefined` | Optional external `AbortSignal` for cooperative cancellation. |
| `tags` | `string[]` | `undefined` | Classification tags for selective cancellation and metric grouping. |

### `ahko.wrap(fn, options?)`

Returns a wrapped version of `fn` routed through the scheduler.

### `ahko.pause() / ahko.resume() / ahko.isPaused()`

Pauses and resumes task dispatching.

### `ahko.circuitState`

Returns current circuit breaker state (`"closed" | "open" | "half_open"` or `undefined`).

### `ahko.debounce<T>(key, task, waitMs, options?): Promise<T>`

Convenience method scheduling a debounced task with key-based Promise coalescing.

### `ahko.throttle<T>(key, task, waitMs, options?): Promise<T>`

Convenience method scheduling a throttled task with leading execution and coalesced trailing run.

### `ahko.idle<T>(task, options?): Promise<T>`

Convenience method scheduling a task under `strategy: "idle"`.

### `ahko.on(event, handler)`

Subscribes to scheduler lifecycle events (`task:start`, `task:complete`, `task:fail`, `task:cancel`, `task:timeout`, `idle`, `concurrency:change`). Returns an unsubscribe function.

### `ahko.off(event, handler)`

Unsubscribes an event listener callback.

### `ahko.isIdle(): boolean`

Returns whether the scheduler is currently idle (no active or pending tasks).

### `ahko.onIdle(): Promise<void>`

Returns a Promise that resolves when all active and pending tasks have settled.

### `ahko.chill(): Promise<void>`

Alias for `ahko.onIdle()`.

### `ahko.clear(): void`

Cancels all pending, delayed, and throttled/debounced tasks cleanly.

### `ahko.battery()`

Returns mascot battery status and quote.

### `ahko.stats(): IAhkoStats`

Returns a snapshot of current task counters, retry counts, total dispatches, pause status, circuit state, and queue capacity.

---

## Errors

All scheduler errors inherit from `AhkoError`:

- `AhkoError`: Base class for all scheduler errors.
- `AhkoCancellationError`: Thrown when a task is aborted.
- `AhkoConfigurationError`: Thrown when invalid options are provided.
- `AhkoQueueError`: Thrown when queue constraints are violated.
- `AhkoTimeoutError`: Thrown when a task exceeds its configured duration or totalTimeoutMs.
- `AhkoCircuitBreakerOpenError`: Thrown when task execution is fast-failed because the circuit breaker is OPEN.

---

## Support & Sponsoring

If you liked this library or want to support my work, I'd be eternally grateful for a warm coffee! ☕ <3

<a href="https://buymeacoffee.com/mrjacket" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="180">
</a>

---

## License
[GNU General Public License v3.0 (GPL-3.0-only)](LICENSE) 

### Credits
**Author:** Mr Jacket / Felix Manrique / x-name15 (we are all the same person)
