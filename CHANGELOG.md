# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
