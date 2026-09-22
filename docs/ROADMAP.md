# Roadmap — @mrjacket/ahko

## Milestone Overview

| Version | Milestone | Scope | Status |
|---|---|---|---|
| **0.1.0** | **Core Scheduler** | `Ahko`, `schedule()`, generic return inference, task ID, `immediate` & `delay` strategies, FIFO queue, concurrency limits, `AbortSignal` cooperative cancellation, lifecycle tracking, core errors, telemetry `stats()`. | **Completed ✅** |
| **0.2.0** | **Idle Scheduling** | `idle` strategy, `IdleScheduler` cross-runtime abstraction (`requestIdleCallback`, `setImmediate`, `setTimeout`), cancellation during idle wait, `ahko.idle()` convenience API. | **Completed ✅** |
| **0.3.0** | **Retry & Backoff** | `retry` options, exponential backoff, jitter, `shouldRetry` predicate, cancellation during backoff delays. | **Completed ✅** |
| **0.4.0** | **Timeout & Robust Cancellation** | Task timeouts with `AhkoTimeoutError`, unified internal signal abort via `AbortSignal.any()`, race-condition safety. | Planned |
| **0.5.0** | **Throttle, Debounce & Rate Limiting** | `throttle`, `debounce` with Promise coalescing by explicit key, rate-limiting start intervals. | Planned |
| **0.6.0** | **Telemetry & DX** | Refined stats, optional debug event hooks, inspection, battery easter egg (`battery()`). | Planned |
| **1.0.0** | **Stable Scheduler & E2E Testing** | Full API stabilization, production hardening, complete documentation, 100% test coverage, and comprehensive **End-to-End (E2E) integration testing suite** proving all scheduling strategies, concurrency limits, cancellations, and retries under real asynchronous workloads. | Planned |
