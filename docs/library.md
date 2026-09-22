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
| `strategy` | `EScheduleStrategy \| "immediate" \| "delay"` | `"immediate"` | Scheduling strategy. |
| `delay` | `number` | `0` | Delay duration in milliseconds (required when strategy is `"delay"`). |
| `signal` | `AbortSignal` | `undefined` | Optional external abort signal for cooperative cancellation. |

##### Throws
- `AhkoConfigurationError`: If `task` is not a function or options are invalid.
- `AhkoCancellationError`: If the task is aborted before or during execution.

---

#### `ahko.stats(): IAhkoStats`

Returns an immutable snapshot of current scheduler telemetry.

##### `IAhkoStats`
| Metric | Type | Description |
|---|---|---|
| `activeTasks` | `number` | Tasks currently executing in a concurrency slot. |
| `pendingTasks` | `number` | Tasks waiting in queue or in delay timer. |
| `completedTasks` | `number` | Cumulative count of successful task runs. |
| `failedTasks` | `number` | Cumulative count of failed task runs. |
| `cancelledTasks` | `number` | Cumulative count of cancelled task runs. |
| `timedOutTasks` | `number` | Cumulative count of timed out task runs. |
| `capacity` | `number` | Configured concurrency capacity. |

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
}
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
} from "@mrjacket/ahko";
```

- **`AhkoError`**: Base class for all scheduler errors.
- **`AhkoCancellationError`**: Thrown when a task is aborted.
- **`AhkoConfigurationError`**: Thrown when invalid options (e.g. invalid concurrency or delay) are supplied.
- **`AhkoQueueError`**: Thrown when queue constraints are violated.
- **`AhkoTimeoutError`**: Thrown when a task exceeds its allotted timeout duration.
