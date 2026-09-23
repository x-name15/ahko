# ahko — Documentation

**`@mrjacket/ahko`** is a low-energy asynchronous task scheduler for JavaScript and TypeScript.

*Let your code chill.*

---

## Documentation Structure

```
docs/
├── README.md                     <-- Master portal (you are here)
│
├── guides/                       <-- Practical Developer Guides
│   ├── getting-started.md        <-- Installation, quickstart & mental model
│   ├── configuration.md          <-- Declarative config (config.ahko.json, schema, profiles)
│   ├── library.md                <-- Programmatic API reference (methods, types, errors, events)
│   └── recipes.md                <-- Production recipes & architectural patterns
│
└── architecture/                 <-- Architectural Specifications & Design Decisions
    ├── ARCHITECTURE.md           <-- Core scope, design principles & lifecycle state machine
    ├── ROADMAP.md                <-- Version progression & milestones (0.1.0 to 1.1.0)
    └── LOG.md                    <-- Engineering decision logs (ADRs)
```

> **Runnable Examples:** A comprehensive suite of standalone, runnable Node.js scripts is available in the [`examples/`](../examples/) folder. See [`examples/README.md`](../examples/README.md) for details.

---

## Guides

| Guide | Target Audience | Summary |
|---|---|---|
| [Getting Started](./guides/getting-started.md) | Everyone | Installation, 5-minute quickstart, concurrency control, and fundamental concepts. |
| [Declarative Configuration](./guides/configuration.md) | Developers & DevOps | Centralizing limits in `config.ahko.json`, `$schema` validation, named profiles, and fallback rules. |
| [Library API](./guides/library.md) | Developers | Complete API reference for `Ahko`, strategies, options, error classes, and events. |
| [Production Recipes & Patterns](./guides/recipes.md) | Engineers | Battle-tested recipes: paced API client, debounced search, throttled scroll, idle analytics, graceful shutdown. |

---

## Architecture & Specifications

| Document | Focus Area | Summary |
|---|---|---|
| [Architecture Specification](./architecture/ARCHITECTURE.md) | Architectural Foundation | Single-scheduler philosophy, native platform primitives, memory safety, and lifecycle state machine. |
| [Roadmap](./architecture/ROADMAP.md) | Version Progression | Progression from 0.1.0 through 1.1.0 release. |
| [Engineering Decisions Log](./architecture/LOG.md) | Design History | Chronological log of engineering decisions, trade-offs, and security remediations. |

---

## Contributing

See [CONTRIBUTING.md](../.github/CONTRIBUTING.md) for contribution guidelines.
