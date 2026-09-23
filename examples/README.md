# Examples — @mrjacket/ahko

This folder contains standalone, runnable Node.js examples demonstrating core usage patterns and architectural solutions with **`@mrjacket/ahko`**.

All examples use modern ESM and import directly from the compiled library in `../dist/index.js`.

---

## Prerequisites

Build the library before running the examples:

```bash
npm run build
```

---

## Runnable Examples

| Example | Command | Description |
|---|---|---|
| **01: Concurrency & Pacing** | `node examples/01-concurrency-and-pacing.mjs` | Capping simultaneous operations and pacing task start intervals (`minIntervalMs`). |
| **02: Debounced Search** | `node examples/02-debounce-search.mjs` | Coalescing rapid keystrokes into a single execution sharing the same Promise result. |
| **03: Throttled Events** | `node examples/03-throttle-events.mjs` | Leading execution with coalesced trailing run for high-frequency streams (scroll/resize). |
| **04: Retries & Jitter** | `node examples/04-retry-backoff-jitter.mjs` | Automatic retries with slot release, exponential backoff, and full jitter. |
| **05: Idle Telemetry** | `node examples/05-idle-telemetry.mjs` | Background non-blocking execution (`ahko.idle`) and lifecycle event monitoring. |
| **06: Graceful Shutdown** | `node examples/06-graceful-shutdown.mjs` | Safe process termination clearing backlog (`ahko.clear`) and awaiting in-flight work (`ahko.chill`). |

---

## Running All Examples

You can run any script directly using Node:

```bash
node examples/01-concurrency-and-pacing.mjs
node examples/02-debounce-search.mjs
node examples/03-throttle-events.mjs
node examples/04-retry-backoff-jitter.mjs
node examples/05-idle-telemetry.mjs
node examples/06-graceful-shutdown.mjs
```
