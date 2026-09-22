# Engineering Decisions Log — @mrjacket/ahko

## 2026-09-22 — Project Foundation & Milestone 0.1.0 Architecture

- **Decision 1: Zero Runtime Dependencies**:
  Avoid all external packages. Use standard Web & Node.js globals (`AbortController`, `AbortSignal`, `setImmediate`, `setTimeout`).
- **Decision 2: Hungarian Notation (`lineamientos-pw`)**:
  All TypeScript models adhere to Hungarian prefixing (`ITaskContext`, `EScheduleStrategy`, `IScheduleOptions`, `IAhkoStats`, `ETaskState`).
- **Decision 3: Debounce Coalescing**:
  Calls with matching keys share the eventual execution Promise. No synthetic cancellation error thrown to absorbed callers.
- **Decision 4: Memory Safety**:
  Strict cleanup of abort event listeners upon settle (`signal.removeEventListener('abort', ...)`).
- **Decision 5: NodeNext ESM-First**:
  Standard Node.js ESM output with CJS bundle generated via `tsup`, declarations generated via `tsc`.

## 2026-09-22 — Milestone 0.2.0 Architecture Decisions

- **Decision 6: Cross-Platform Idle Scheduling Abstraction**:
  Implemented platform-agnostic `IdleScheduler`. Order of precedence:
  1. Browser `requestIdleCallback` (forwards `timeout`).
  2. Node.js `setImmediate`.
  3. Universal fallback `setTimeout(..., 0)`.
- **Decision 7: Immediate Idle Resource Detachment on Abort**:
  If cancelled prior to callback invocation, `cancel()` is triggered immediately on the handle to prevent redundant tick execution and memory leaks.

## 2026-09-22 — Milestone 0.3.0 Architecture Decisions

- **Decision 8: Concurrency Slot Release During Backoff**:
  Tasks sleeping in backoff do not consume active runner slots; slots are released immediately upon failure and re-acquired when the backoff delay completes.
- **Decision 9: Backoff Calculation Purity & Full Jitter**:
  Mathematical delay calculation with cap and full jitter (`[0, baseDelay * factor]`) implemented as pure functional logic with injectable random generator for deterministic testing.
- **Decision 10: Persistent Cancellation Across Retries**:
  Abort listeners remain attached across retry attempts until final resolution or definitive rejection, ensuring cooperative cancellation can halt execution at any point in the retry cycle.

## 2026-09-22 — Milestone 0.4.0 Architecture Decisions

- **Decision 11: Active Execution Scope for Timeouts**:
  `timeoutMs` applies strictly to the duration of active execution within a concurrency slot (`ETaskState.RUNNING`). Queue wait times and backoff sleep delays do not count against this deadline. Furthermore, each retry attempt receives a fresh, full `timeoutMs` window.
- **Decision 12: Deterministic Uncooperative Task Interception**:
  Execution is coordinated via `Promise.race` against a timeout promise and an abort promise, guaranteeing that uncooperative tasks that hang or ignore signals do not freeze scheduler capacity or delay promise rejection to callers.
- **Decision 13: Memory-Safe Coordinated Signal Aggregation**:
  Created `combineSignals()` utility with explicit `cleanup()` callback, guaranteeing that all event listeners attached to external or internal signals are cleanly detached upon task settle to prevent memory leaks in high-throughput environments.
