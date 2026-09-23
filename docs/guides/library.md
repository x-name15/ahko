# Library API Reference — @mrjacket/ahko

This document covers the programmatic API surface of `@mrjacket/ahko`.

---

## 1. Class: `Ahko`

The primary scheduler class.

```typescript
import { Ahko } from "@mrjacket/ahko";
```

### Constructor

```typescript
new Ahko(options?: IAhkoOptions): Ahko
```

#### `IAhkoOptions`
| Option | Type | Default | Description |
|---|---|---|---|
| `concurrency` | `number` | `Infinity` | Maximum concurrent active tasks allowed to run simultaneously. Must be $\ge 1$. |
| `minIntervalMs` | `number` | `0` | Minimum interval in milliseconds between consecutive task starts (rate limiting). Must be $\ge 0$. |
| `circuitBreaker` | `ICircuitBreakerOptions` | `undefined` | Optional circuit breaker failure threshold and cooldown reset configuration. |
| `profile` | `string` | `undefined` | Optional declarative profile name to inherit configuration from. |

---

### Methods

#### `ahko.schedule<T>(task: ITask<T>, options?: IScheduleOptions): Promise<T>`

Schedules a task for controlled execution. Preserves the exact return type `T` of `task`.

##### Parameters
- `task: (context: ITaskContext) => Promise<T> | T`
  Function representing the asynchronous or synchronous work to run.
- `options?: IScheduleOptions`
  Optional scheduling settings.

##### `IScheduleOptions`
| Property | Type | Default | Description |
|---|---|---|---|
| `strategy` | `EScheduleStrategy \| "immediate" \| "delay" \| "idle" \| "throttle" \| "debounce"` | `"immediate"` | Scheduling strategy. |
| `priority` | `TTaskPriority` | `"normal"` | Priority weight (`"high"`, `"normal"`, `"low"`, or custom numeric weight). |
| `delay` | `number` | `0` | Delay duration in milliseconds (required when strategy is `"delay"`). |
| `key` | `string \| symbol` | `undefined` | Explicit identity key (required when strategy is `"throttle"` or `"debounce"`). |
| `waitMs` | `number` | `undefined` | Time window in milliseconds for debounce quiet window or throttle interval. |
| `idleTimeout` | `number` | `undefined` | Maximum time in ms to wait for idle opportunity before forcing queue execution. |
| `retry` | `IRetryOptions` | `undefined` | Automatic retry policy (attempts, backoff, jitter, predicate). |
| `timeoutMs` | `number` | `undefined` | Maximum execution duration in milliseconds per attempt before aborting with `AhkoTimeoutError`. |
| `totalTimeoutMs` | `number` | `undefined` | Total execution budget across queue wait time, retries, and execution before aborting with `AhkoTimeoutError`. |
| `signal` | `AbortSignal` | `undefined` | Optional external abort signal for cooperative cancellation. |

##### Throws
- `AhkoConfigurationError`: If `task` is not a function or options are invalid.
- `AhkoCancellationError`: If the task is aborted before or during execution.
- `AhkoTimeoutError`: If the task execution exceeds `timeoutMs` or `totalTimeoutMs`.
- `AhkoCircuitBreakerOpenError`: If the circuit breaker is OPEN and rejects the task.

---

#### `ahko.idle<T>(task: ITask<T>, options?: Omit<IScheduleOptions, "strategy">): Promise<T>`

Convenience method that schedules a task using `strategy: "idle"`.
- Uses `requestIdleCallback` in browser environments when present.
- Uses `setImmediate` in Node.js environments.
- Falls back to `setTimeout(..., 0)` if neither is available.

---

#### `ahko.debounce<T>(key: string | symbol, task: ITask<T>, waitMs: number, options?: IScheduleOptions): Promise<T>`

Convenience method scheduling a debounced task with Promise coalescing by explicit identity key.
- Resets the quiet window timer if called again with the same `key` within `waitMs`.
- Multiple callers awaiting the same `key` share the exact same returned Promise.

---

#### `ahko.throttle<T>(key: string | symbol, task: ITask<T>, waitMs: number, options?: IScheduleOptions): Promise<T>`

Convenience method scheduling a throttled task with leading execution and coalesced trailing run.
- The first invocation on an idle `key` runs immediately (leading edge).
- Subsequent calls within `waitMs` coalesce into a single trailing run dispatched when the window timer expires.

---

#### `ahko.on<K>(event: K, handler: (payload: IAhkoEventMap[K]) => void): () => void`

Subscribes to scheduler lifecycle events. Returns an unsubscribe function.
Supported events:
- `"task:start"`: `{ taskId: string, attempt: number }`
- `"task:complete"`: `{ taskId: string, attempt: number, durationMs: number, result: unknown }`
- `"task:fail"`: `{ taskId: string, attempt: number, error: unknown, willRetry: boolean }`
- `"task:cancel"`: `{ taskId: string, reason: unknown }`
- `"task:timeout"`: `{ taskId: string, timeoutMs: number }`
- `"idle"`: `{ timestamp: number }`

---

#### `ahko.off<K>(event: K, handler: (payload: IAhkoEventMap[K]) => void): void`

Unsubscribes a specific listener callback from an event.

---

#### `ahko.isIdle(): boolean`

Returns `true` if the scheduler currently has no running and no pending tasks; `false` otherwise.

---

#### `ahko.onIdle(): Promise<void>`

Returns a Promise that resolves when all active, queued, delayed, and throttled/debounced tasks settle and the scheduler transitions to idle.

---

#### `ahko.chill(): Promise<void>`

Delightful alias for `ahko.onIdle()`. Wait for tasks to finish in complete tranquility.

---

#### `ahko.pause(): void`

Pauses task dispatching. In-flight tasks run to completion, but pending tasks remain in the queue.

---

#### `ahko.resume(): void`

Resumes task dispatching, immediately pumping accumulated tasks up to capacity.

---

#### `ahko.isPaused(): boolean`

Returns whether the scheduler is currently paused.

---

#### `ahko.wrap<TArgs, TReturn>(fn: (...args: TArgs) => Promise<TReturn> | TReturn, options?: IScheduleOptions): (...args: TArgs) => Promise<TReturn>`

Wraps an async function so every execution is routed through this scheduler instance with configured options.

---

#### `ahko.circuitState: ECircuitState | undefined`

Current state of the circuit breaker (`"closed"`, `"open"`, `"half_open"`, or `undefined` if not configured).

---

#### `ahko.clear(): void`

Cancels all pending, delayed, and coalesced tasks cleanly. In-flight running tasks continue to completion or abort via signal.

---

#### `ahko.battery(): { level: number, chill: boolean, status: string, quote: string }`

Returns Ahko's low-energy mascot telemetry.

---

#### `ahko.stats(): IAhkoStats`

Returns an immutable snapshot of current scheduler telemetry.

##### `IAhkoStats`
| Metric | Type | Description |
|---|---|---|
| `activeTasks` | `number` | Tasks currently executing in a concurrency slot. |
| `pendingTasks` | `number` | Tasks waiting in queue, delay timers, idle handles, backoffs, or debounce/throttle windows. |
| `completedTasks` | `number` | Cumulative count of successful task runs. |
| `failedTasks` | `number` | Cumulative count of failed task runs. |
| `cancelledTasks` | `number` | Cumulative count of cancelled task runs. |
| `timedOutTasks` | `number` | Cumulative count of timed out task runs. |
| `retriedTasks` | `number` | Cumulative count of retry attempts triggered. |
| `totalDispatched` | `number` | Cumulative count of tasks dispatched to concurrency slots. |
| `capacity` | `number` | Configured concurrency capacity. |
| `isPaused` | `boolean` | Whether task dispatching is currently paused. |
| `circuitState` | `ECircuitState \| undefined` | Current circuit breaker state if configured. |

---

### Static Methods

#### `Ahko.loadConfig(config: IAhkoFileConfig): void`

Programmatically loads declarative configuration into memory (universal across Node.js, browsers, and edge).

#### `Ahko.loadConfigFile(filePath?: string): Promise<IAhkoFileConfig | undefined>`

Asynchronously reads and parses `config.ahko.json` from the filesystem (Node.js).

#### `Ahko.fromProfile(profileName?: string, overrides?: IAhkoOptions): Ahko`

Instantiates an Ahko scheduler configured from a named profile.

---

## 2. Models & Interfaces

### `ITaskContext`
Passed to every task invocation:
```typescript
interface ITaskContext {
  readonly signal: AbortSignal;
  readonly taskId: string;
}
```

### `ETaskState`
```typescript
enum ETaskState {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  TIMED_OUT = "timed_out",
}
```

### `EScheduleStrategy`
```typescript
enum EScheduleStrategy {
  IMMEDIATE = "immediate",
  DELAY = "delay",
  IDLE = "idle",
  THROTTLE = "throttle",
  DEBOUNCE = "debounce",
}
```

### `IRetryOptions`
```typescript
interface IRetryOptions {
  attempts: number;            // Total execution attempts (e.g. 3 = initial + 2 retries)
  backoff?: "exponential" | "linear" | "none"; // Default: "exponential"
  baseDelay?: number;          // Starting backoff delay in ms (default: 250)
  maxDelay?: number;           // Maximum delay cap in ms (default: 10000)
  jitter?: boolean;            // Full jitter randomization (default: false)
  shouldRetry?: (error: unknown, attempt: number) => boolean | Promise<boolean>;
}
```

### `IAhkoEventMap`
```typescript
interface IAhkoEventMap {
  "task:start": { taskId: string; attempt: number };
  "task:complete": { taskId: string; attempt: number; durationMs: number; result: unknown };
  "task:fail": { taskId: string; attempt: number; error: unknown; willRetry: boolean };
  "task:cancel": { taskId: string; reason: unknown };
  "task:timeout": { taskId: string; timeoutMs: number };
  "idle": { timestamp: number };
}
```

### `ECircuitState`
```typescript
enum ECircuitState {
  CLOSED = "closed",
  OPEN = "open",
  HALF_OPEN = "half_open",
}
```

### `ICircuitBreakerOptions`
```typescript
interface ICircuitBreakerOptions {
  failureThreshold: number; // Consecutive failures before tripping OPEN
  resetTimeoutMs: number;   // Cool-down window before trial call in HALF_OPEN
}
```

### `TTaskPriority`
```typescript
type TTaskPriority = "high" | "normal" | "low" | number;
```

---

## 3. Errors

All errors inherit from `AhkoError`:

```typescript
import {
  AhkoError,
  AhkoCancellationError,
  AhkoConfigurationError,
  AhkoQueueError,
  AhkoTimeoutError,
  AhkoCircuitBreakerOpenError,
} from "@mrjacket/ahko";
```

- **`AhkoError`**: Base class for all scheduler errors.
- **`AhkoCancellationError`**: Thrown when a task is aborted.
- **`AhkoConfigurationError`**: Thrown when invalid options (e.g. invalid concurrency or delay) are supplied.
- **`AhkoQueueError`**: Thrown when queue constraints are violated.
- **`AhkoTimeoutError`**: Thrown when a task exceeds its allotted timeout duration or total execution budget.
- **`AhkoCircuitBreakerOpenError`**: Thrown when task execution is rejected immediately because the circuit breaker is OPEN.

---

## 4. Utilities

### `calculateBackoff(attempt: number, options?: IRetryOptions, randomFn?: () => number): number`

Pure calculation helper that computes the delay in milliseconds for a failed attempt based on the configured retry policy.

- Exponential backoff formula: $\min(\text{baseDelay} \times 2^{\text{attempt} - 1}, \text{maxDelay})$
- Linear backoff formula: $\min(\text{baseDelay} \times \text{attempt}, \text{maxDelay})$
- When `jitter: true`, computes $\lfloor \text{randomFn}() \times (\text{cappedDelay} + 1) \rfloor$ (full jitter).

```typescript
import { calculateBackoff } from "@mrjacket/ahko";

const delayMs = calculateBackoff(1, {
  attempts: 3,
  backoff: "exponential",
  baseDelay: 200,
  maxDelay: 5000,
  jitter: false,
});
// 200ms
```

### `combineSignals(signals: ReadonlyArray<AbortSignal | undefined>): ICombinedSignal`

Combines multiple `AbortSignal` instances into a single coordinated `AbortSignal` with explicit, memory-safe cleanup.

- Returns `{ signal: AbortSignal, cleanup: () => void }`.
- If any source signal aborts, the combined signal aborts with the same reason.
- Calling `cleanup()` immediately removes internal event listeners from all source signals, preventing memory leaks and `MaxListenersExceededWarning` alerts.

```typescript
import { combineSignals } from "@mrjacket/ahko";

const { signal, cleanup } = combineSignals([externalSignal, timeoutSignal]);

try {
  await doWork({ signal });
} finally {
  cleanup();
}
```
