# Declarative Configuration Guide (`config.ahko.json`) — @mrjacket/ahko

This guide covers declarative configuration in **`@mrjacket/ahko`**, including JSON schema integration, profile inheritance, dual-runtime loading, and option precedence.

---

## 1. Overview

Starting with **v1.1.0**, `@mrjacket/ahko` supports declarative configuration via `config.ahko.json`. This allows teams to:
- Centralize scheduler limits (concurrency, rate limiting, timeouts, retries, and circuit breakers) in version-controlled JSON.
- Define **named workload profiles** for different tasks (e.g. fast API calls vs. background crawlers vs. critical payment gateways).
- Enjoy full **IntelliSense autocompletion and schema validation** in VS Code, WebStorm, and other IDEs.
- Rely on **graceful fallbacks**: if no configuration file exists, the scheduler falls back cleanly to standard defaults without errors.

---

## 2. Configuration File Structure

Place a `config.ahko.json` file in the root of your project:

```json
{
  "$schema": "https://raw.githubusercontent.com/x-name15/ahko/main/schema.json",
  "default": {
    "concurrency": 2,
    "minIntervalMs": 50,
    "priority": "normal",
    "timeoutMs": 10000,
    "retry": {
      "attempts": 3,
      "backoff": "exponential",
      "baseDelay": 100,
      "maxDelay": 3000,
      "jitter": true
    }
  },
  "profiles": {
    "crawler": {
      "concurrency": 4,
      "minIntervalMs": 250,
      "priority": "low"
    },
    "critical-gateway": {
      "concurrency": 1,
      "priority": 100,
      "totalTimeoutMs": 5000,
      "circuitBreaker": {
        "failureThreshold": 3,
        "resetTimeoutMs": 1000
      }
    },
    "background-sync": {
      "concurrency": 2,
      "strategy": "idle",
      "priority": "low"
    }
  }
}
```

---

## 3. IDE Autocompletion with `$schema`

By referencing the official `$schema` at the top of your JSON file:

```json
"$schema": "https://raw.githubusercontent.com/x-name15/ahko/main/schema.json"
```

VS Code and WebStorm provide:
- **Instant property autocompletion** (`concurrency`, `circuitBreaker`, `priority`, etc.).
- **Real-time type validation** (e.g. ensuring `failureThreshold` is an integer $\ge 1$, or `backoff` is `"exponential"` | `"linear"` | `"none"`).
- **Inline documentation tooltips** explaining what each option does and its units.

The canonical schema is also committed locally in the repository as [`schema.json`](../../schema.json).

---

## 4. Supported Profile Options

Each profile (both `"default"` and entries under `"profiles"`) accepts:

| Property | Type | Description |
|---|---|---|
| `concurrency` | `integer` ($\ge 1$) | Maximum simultaneous active tasks for the scheduler. |
| `minIntervalMs` | `number` ($\ge 0$) | Minimum interval in ms between consecutive task starts (temporal rate limiting). |
| `priority` | `"high" \| "normal" \| "low"` or `number` | Default priority weight applied to tasks scheduled under this profile. |
| `strategy` | `"immediate" \| "delay" \| "idle" \| "throttle" \| "debounce"` | Default scheduling strategy. |
| `delay` | `number` ($\ge 0$) | Delay duration in ms when strategy is `"delay"`. |
| `timeoutMs` | `number` ($\ge 1$) | Per-attempt active execution deadline in ms before aborting with `AhkoTimeoutError`. |
| `totalTimeoutMs` | `number` ($\ge 1$) | Overarching task budget in ms spanning queue wait, retries, and execution. |
| `retry` | `object` | Retry policy configuration (see below). |
| `circuitBreaker` | `object` | Downstream protection policy (see below). |

### `retry` Object Specification

```json
{
  "attempts": 3,
  "backoff": "exponential",
  "baseDelay": 200,
  "maxDelay": 5000,
  "jitter": true
}
```

- `attempts` (`integer`, required): Total execution attempts (initial attempt + retries).
- `backoff` (`"exponential" | "linear" | "none"`): Delay curve between attempts.
- `baseDelay` (`number`): Starting delay in milliseconds (default: `250`).
- `maxDelay` (`number`): Upper cap in milliseconds (default: `10000`).
- `jitter` (`boolean`): Full jitter randomization to prevent stampedes (default: `false`).

### `circuitBreaker` Object Specification

```json
{
  "failureThreshold": 3,
  "resetTimeoutMs": 10000
}
```

- `failureThreshold` (`integer`, required): Number of consecutive task failures required to trip the circuit to `OPEN`.
- `resetTimeoutMs` (`number`, required): Cool-down window in milliseconds before attempting recovery in `HALF_OPEN`.

---

## 5. Loading Configuration in Your Code

### Automatic Discovery in Node.js

In Node.js ($\ge 22.12.0$), `@mrjacket/ahko` uses native `process.getBuiltinModule("node:fs")` to inspect `process.cwd()` for `config.ahko.json` **without requiring static Node imports or triggering bundler warnings**:

```typescript
import { Ahko } from "@mrjacket/ahko";

// Automatically inherits the "default" profile from config.ahko.json if present
const ahko = new Ahko();

// Or instantiate a specific named profile:
const crawler = new Ahko({ profile: "crawler" });

// Or using the factory helper:
const gateway = Ahko.fromProfile("critical-gateway");
```

### Programmatic Loading (Browsers, Bundlers & Edge)

When running in client-side applications (Vite, Next.js client components, Webpack) or test suites, load configuration programmatically in memory:

```typescript
import { Ahko } from "@mrjacket/ahko";

Ahko.loadConfig({
  default: {
    concurrency: 2,
    minIntervalMs: 50,
  },
  profiles: {
    background: {
      concurrency: 1,
      priority: "low",
    },
  },
});

// Now instances resolve from the loaded configuration
const backgroundScheduler = Ahko.fromProfile("background");
```

To reset in-memory configuration (useful in test teardowns):

```typescript
Ahko.resetConfig();
```

### Asynchronous File Loading (Node.js)

To load a custom path asynchronously:

```typescript
await Ahko.loadConfigFile("./configs/production.ahko.json");
```

---

## 6. Precedence & Fallback Rules

When creating a new scheduler instance or scheduling a task, settings resolve in this strict order:

$$\text{Inline Arguments} > \text{Named Profile} > \text{Default Profile} > \text{Library Defaults}$$

### Example of Precedence

Suppose `config.ahko.json` defines:
```json
{
  "default": { "concurrency": 2 },
  "profiles": {
    "crawler": { "concurrency": 4 }
  }
}
```

1. `new Ahko()` $\rightarrow$ `concurrency: 2` (inherited from `default`).
2. `new Ahko({ profile: "crawler" })` $\rightarrow$ `concurrency: 4` (inherited from `crawler`).
3. `new Ahko({ profile: "crawler", concurrency: 10 })` $\rightarrow$ `concurrency: 10` (inline override wins).
4. `new Ahko({ concurrency: 8 })` $\rightarrow$ `concurrency: 8` (inline override wins over `default`).

### Fallback Behavior when No Config Exists

If `config.ahko.json` is missing or unreadable:
- `Ahko.getActiveConfig()` safely returns `undefined`.
- The scheduler functions normally using standard defaults:
  - `concurrency`: `Infinity`
  - `minIntervalMs`: `0`
  - `priority`: `"normal"`
  - `circuitBreaker`: `undefined` (disabled)
- **Zero runtime errors, zero crashes.**
