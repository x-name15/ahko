# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.5] - 2026-09-24 — Batch Collections, Dynamic & Adaptive Concurrency, Task Tags

### Added
- **Batch Collections API (`ahko.map` & `ahko.each`)**:
  - `ahko.map<TItem, TResult>(items, fn, options?)`: Concurrently transforms any iterable sequence while strictly preserving original element order.
  - `ahko.each<TItem>(items, fn, options?)`: Concurrently iterates over any sequence returning `Promise<void>`.
  - Supports localized concurrency caps per-batch (`options.concurrency`), falling back to scheduler concurrency when omitted.
  - Fail-fast flow control via `stopOnError: true` (aborts remaining tasks immediately and rejects) or settled error propagation via `stopOnError: false` (default).
  - Native integration with `signal`, `retry`, `tags`, and priority options.
- **Dynamic & Adaptive Concurrency (AIMD Auto-Chill Mode)**:
  - Runtime dynamic concurrency reconfiguration via `ahko.setConcurrency(n)` and getter `ahko.concurrency`.
  - Additive Increase / Multiplicative Decrease (AIMD) algorithm (`AdaptiveCoordinator`) adjusting scheduler capacity based on real-time task latency (`options.adaptive`).
  - Seamlessly handles network latency spikes by scaling down concurrency on congestion and recovering when latency drops.
  - Lifecycle event `"concurrency:change"` emitting `previousConcurrency`, `currentConcurrency`, and human-readable `reason`.
  - Telemetry metrics in `ahko.stats().adaptive`: `currentConcurrency`, `averageLatencyMs`, `samplesRecorded`.
- **Task Tags & Selective Cancellation**:
  - Categorize tasks via `tags: string[]` in `schedule()`, `map()`, or declarative profiles.
  - Selectively cancel related tasks via `ahko.cancelByTag(tag, reason?)` without interrupting other pending or active workloads.
  - Inspect workload density per category via `ahko.statsByTag(tag)` (`activeTasks` and `pendingTasks`).
  - Memory-safe automatic tag indexing and instant cleanup upon task runner settlement.
- **Declarative Configuration Schema Expansion**:
  - Added `adaptive` policy and `tags` classification to `schema.json` and `config.ahko.example.json`.
- **New Runnable Examples**:
  - `examples/09-batch-collections.mjs`: Concurrent mapping over iterables with strict index ordering.
  - `examples/10-adaptive-concurrency.mjs`: AIMD Auto-Chill mode reacting to upstream latency.
  - `examples/11-tag-cancellation.mjs`: Tagged workload telemetry and selective cancellation.

---

## [1.1.0] - 2026-09-23 — Declarative Config, Circuit Breaker & Priority Queue

### Added
- Declarative configuration file support via `config.ahko.json` with multi-profile support (e.g. `default`, `crawler`, `critical-gateway`).
- Static configuration loaders: `Ahko.loadConfig(config)` for universal programmatic profile loading (Node.js & browser), `Ahko.loadConfigFile(path?)` for asynchronous filesystem loading, and `Ahko.fromProfile(name, overrides?)`.
- Martin Fowler Circuit Breaker pattern with `ECircuitState` (`CLOSED`, `OPEN`, `HALF_OPEN`), `CircuitBreakerCoordinator`, and `AhkoCircuitBreakerOpenError`:
  - Protects downstream services by tracking consecutive failures against a `failureThreshold`.
  - Fast-fails pending and incoming tasks without execution when OPEN.
  - Automatically transitions to HALF_OPEN after `resetTimeoutMs` cooldown to allow a recovery trial.
  - Heals to CLOSED on trial success or immediately re-trips to OPEN on trial failure.
- Priority queue scheduling with stable FIFO ordering:
  - Supports named priorities (`"high"`, `"normal"`, `"low"`) and arbitrary numerical weights (e.g. `100`, `-5`).
  - Tasks with higher priority preempt lower priority tasks in the queue; tasks with identical priority preserve strict FIFO ordering.
- Queue flow control via `ahko.pause()`, `ahko.resume()`, and `ahko.isPaused()`:
  - Halts dispatching pending tasks without interrupting currently executing tasks.
  - Immediately dispatches accumulated tasks upon resume up to concurrency limits.
- Total Timeout Budget (`totalTimeoutMs`):
  - Sets an overarching execution deadline spanning queue wait time, execution, and retry delays.
  - Cancels task runners cleanly with `AhkoTimeoutError` when the budget expires.
- Ergonomic function wrapping via `ahko.wrap(fn, options)`:
  - Wraps any sync or async function returning a decorated function routed through the scheduler with pre-configured priorities and options.
- New runnable examples:
  - `examples/07-circuit-breaker.mjs`: circuit breaker tripping, fast-failing, and cooldown recovery.
  - `examples/08-priority-queue.mjs`: priority queue ordering and pause/resume flow control.
  - `config.ahko.example.json`: reference declarative schema configuration file.
- Extended telemetry in `ahko.stats()`: `isPaused` boolean and `circuitState` indicator.

### Fixed
- Remediated 2 CodeQL static analysis security alerts:
  - Alert #4: Removed unused `externalController` declaration in `src/__tests__/e2e.test.ts`.
  - Alert #3: Removed unused `sleep` helper declaration in `examples/04-retry-backoff-jitter.mjs`.

---

## [1.0.0] - 2026-09-23 — Stable Scheduler Release

### Added
- Comprehensive End-to-End stress and integration test suite (`src/__tests__/e2e.test.ts`) verifying:
  - High-concurrency bursts under rate-limited temporal pacing (`minIntervalMs`) and jittered backoff retries.
  - Interleaved interactive debounce and throttle streams under queue contention.
  - Cooperative cancellation waves simulating document switches or build cancellations (VS Code / CLI scenarios).
  - Graceful shutdown workflows clearing pending queues while allowing in-flight tasks to settle cleanly (`ahko.chill()`).
  - Full lifecycle telemetry stream validation and microservice uncooperative timeout handling.
- Standalone runnable examples suite (`examples/`) with dedicated `examples/README.md`:
  - `01-concurrency-and-pacing.mjs`: concurrency limits and temporal pacing.
  - `02-debounce-search.mjs`: debounced interactive search with Promise coalescing.
  - `03-throttle-events.mjs`: high-frequency event stream throttling.
  - `04-retry-backoff-jitter.mjs`: resilient retries with exponential backoff and full jitter.
  - `05-idle-telemetry.mjs`: non-blocking background tasks and lifecycle event logging.
  - `06-graceful-shutdown.mjs`: safe process termination sequence.
- Dedicated npm script `"test:e2e"` for focused integration testing.
- Documentation restructuring into domain guides (`docs/guides/`) and specifications (`docs/architecture/`), including production architectural recipes (`recipes.md`).

### Changed
- Connected `DebounceCoordinator` and `ThrottleCoordinator` settlement lifecycles directly to `TaskQueue.checkIdle()`, ensuring that window expirations and coordinator deletions deterministically resolve idle promises and emit `"idle"` events.
- Transitioned version to stable 1.0.0 baseline with frozen zero-dependency architecture.

---

## [0.6.0] - 2026-09-23 — Telemetry & DX

### Added
- Type-safe lifecycle event emitter (`AhkoEventEmitter`) with dedicated `IAhkoEventMap` events:
  - `task:start`: emitted when a task begins execution with `taskId` and `attempt`.
  - `task:complete`: emitted on task success with `taskId`, `attempt`, `durationMs`, and `result`.
  - `task:fail`: emitted on failure with `taskId`, `attempt`, `error`, and `willRetry` boolean indicator.
  - `task:cancel`: emitted on task cancellation with `taskId` and `reason`.
  - `task:timeout`: emitted when execution exceeds configured deadline with `taskId` and `timeoutMs`.
  - `idle`: emitted when all tasks settle and queue reaches idle state with `timestamp`.
- Event subscription methods `ahko.on(event, handler)` returning an unsubscribe function, and `ahko.off(event, handler)`.
- Listener error containment: listener exceptions are safely isolated without crashing the scheduler loop or sibling listeners.
- Idle lifecycle promises via `ahko.isIdle()`, `ahko.onIdle()`, and chill alias `ahko.chill()`.
- Queue clearance method `ahko.clear()` to cancel queued, delayed, and coalesced tasks cleanly.
- Ahko mascot battery telemetry via `ahko.battery()` reporting chill status.
- Extended telemetry snapshot in `ahko.stats()` with `retriedTasks` and `totalDispatched`.

### Fixed
- Fixed 2 CodeQL security alerts by iterating over map values (`this.entries.values()`) in `DebounceCoordinator.clear()` and `ThrottleCoordinator.clear()`.

---

## [0.5.0] - 2026-09-22 — Throttle, Debounce & Rate Limiting

### Added
- Debounce scheduling strategy (`EScheduleStrategy.DEBOUNCE`) with quiet window timer resets.
- Throttle scheduling strategy (`EScheduleStrategy.THROTTLE`) with immediate leading execution and coalesced trailing run.
- Promise coalescing by explicit identity key (`key: string | symbol`): all concurrent callers awaiting the same key receive the exact same Promise resolution without artificial cancellation rejections.
- Task start interval rate limiting via `minIntervalMs` on scheduler constructor (`IAhkoOptions`).
- Automatic key cleanup and timer detachment upon settlement guaranteeing zero memory leaks.
- Convenience API methods `ahko.debounce()` and `ahko.throttle()`.
- Validation for keys, quiet windows, throttle periods, and rate limit intervals.
- Comprehensive unit test suites for debounce coalescing, throttle leading/trailing runs, and interval rate limiting.

---

## [0.4.0] - 2026-09-22 — Timeout & Robust Cancellation

### Added
- Execution timeout control via `timeoutMs` in `IScheduleOptions`.
- Rejection with `AhkoTimeoutError` containing exceeded `timeoutMs` threshold and descriptive message.
- Immediate rejection and slot recovery for hanging, uncooperative tasks via `Promise.race`.
- Active execution timeout isolation (queued waiting time and backoff delays do not consume execution timeout).
- Fresh `timeoutMs` window allocation on retry attempts.
- Unified signal coordination via `combineSignals` utility with deterministic listener detachment.
- Strict configuration validation for `timeoutMs` (positive finite numbers).
- Comprehensive unit test suite covering execution timeouts, cancellation precedence, uncooperative tasks, retries, and signal combination.

---

## [0.3.0] - 2026-09-22 — Retry & Backoff

### Added
- Automatic retry engine supporting `attempts`, exponential/linear backoff, and full jitter.
- Retry filtering via `shouldRetry` predicate `(error, attempt) => boolean | Promise<boolean>`.
- Concurrency slot release during backoff delay to prevent capacity starvation.
- Cancellation safety during backoff delay (clears timers immediately, rejects with `AhkoCancellationError`, and halts remaining retries).
- Public retry models (`IRetryOptions`, `TRetryBackoff`, `TRetryPredicate`) and backoff calculation utilities.
- Comprehensive unit test suite covering backoff calculations, jitter, slot release, predicates, and cancellations.

---

## [0.2.0] - 2026-09-22 — Idle Scheduling

### Added
- Platform-agnostic `IdleScheduler` supporting browser `requestIdleCallback`, Node.js `setImmediate`, and universal fallback `setTimeout(..., 0)`.
- Support for `idle` strategy (`EScheduleStrategy.IDLE`).
- Optional `idleTimeout` parameter in `IScheduleOptions` forwarding to `requestIdleCallback({ timeout })`.
- Convenience method `ahko.idle(task, options)`.
- Immediate resource cleanup and handle cancellation when idle tasks are cancelled prior to callback execution.
- Comprehensive unit test suite covering cross-runtime execution, fallback paths, cancellation, and concurrency.

---

## [0.1.0] - 2026-09-22 — Core Scheduler

### Added
- Core `Ahko` scheduler class.
- Generic return type inference for `schedule<T>()`.
- Controlled concurrency queue with FIFO ordering.
- Scheduling strategies: `immediate` and `delay`.
- Task context with unique `taskId` and propagated `AbortSignal`.
- Cooperative cancellation for pending and running tasks via native `AbortSignal`.
- Memory leak prevention with automatic cleanup of abort listeners upon settle.
- Scheduler telemetry via `stats()`.
- Typed error hierarchy: `AhkoError`, `AhkoCancellationError`, `AhkoConfigurationError`, `AhkoQueueError`, and `AhkoTimeoutError`.
