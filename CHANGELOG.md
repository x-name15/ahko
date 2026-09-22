# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
