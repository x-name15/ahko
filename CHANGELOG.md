# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
