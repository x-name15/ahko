# Roadmap — @mrjacket/ahko

## Milestone Overview

| Version | Milestone | Scope | Status |
|---|---|---|---|
| **0.1.0** | **Core Scheduler** | `Ahko`, `schedule()`, generic return inference, task ID, `immediate` & `delay` strategies, FIFO queue, concurrency limits, `AbortSignal` cooperative cancellation, lifecycle tracking, core errors, telemetry `stats()`. | **Completed ✅** |
| **0.2.0** | **Idle Scheduling** | `idle` strategy, `IdleScheduler` cross-runtime abstraction (`requestIdleCallback`, `setImmediate`, `setTimeout`), cancellation during idle wait, `ahko.idle()` convenience API. | **Completed ✅** |
| **0.3.0** | **Retry & Backoff** | `retry` options, exponential backoff, jitter, `shouldRetry` predicate, cancellation during backoff delays. | **Completed ✅** |
| **0.4.0** | **Timeout & Robust Cancellation** | Task timeouts with `AhkoTimeoutError`, unified internal signal abort via `AbortSignal.any()`, race-condition safety. | **Completed ✅** |
| **0.5.0** | **Throttle, Debounce & Rate Limiting** | `throttle`, `debounce` with Promise coalescing by explicit key, rate-limiting start intervals. | **Completed ✅** |
| **0.6.0** | **Telemetry & DX** | Refined stats, lifecycle event emitter (`task:start`, `task:complete`, `task:fail`, `task:cancel`, `task:timeout`, `idle`), `isIdle()`, `onIdle()`, `clear()`, mascot battery status (`battery()`, `chill()`). | **Completed ✅** |
| **1.0.0** | **Stable Scheduler & E2E Testing** | Full API stabilization, production hardening, complete documentation, 100% test coverage, comprehensive **End-to-End (E2E) integration testing suite**, and standalone runnable examples suite (`examples/`). | **Completed ✅** |
| **1.1.0** | **Declarative Config, Circuit Breaker & Priority Queue** | `config.ahko.json`, Martin Fowler Circuit Breaker (`ECircuitState`), priority queue with FIFO stability, pause/resume flow control, `totalTimeoutMs` budget, function wrapping (`ahko.wrap()`), and CodeQL security remediations. | **Completed ✅** |
| **1.1.5** | **Batch Collections, Dynamic & Adaptive Concurrency, Task Tags** | `ahko.map()` & `ahko.each()` concurrent processing with strict index ordering and `stopOnError`, dynamic concurrency (`setConcurrency()`, getter), AIMD adaptive concurrency (`options.adaptive`, `"concurrency:change"`), task tags (`tags`, `cancelByTag()`, `statsByTag()`), examples 09-11. | **Completed ✅** |
