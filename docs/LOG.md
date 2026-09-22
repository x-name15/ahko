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
