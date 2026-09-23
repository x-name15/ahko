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
│   ├── library.md                <-- Programmatic API reference (methods, types, errors, events)
│   └── recipes.md                <-- Production recipes & architectural patterns
│
└── architecture/                 <-- Architectural Specifications & Design Decisions
    ├── ARCHITECTURE.md           <-- Core scope, design principles & lifecycle state machine
    ├── ROADMAP.md                <-- Version progression & milestones (0.1.0 to 1.0.0)
    └── LOG.md                    <-- Engineering decision logs (ADRs)
```

---

## Guides

| Guide | Target Audience | Summary |
|---|---|---|
| [Getting Started](./guides/getting-started.md) | Everyone | Installation, 5-minute quickstart, concurrency control, and fundamental concepts. |
| [Library API](./guides/library.md) | Developers | Complete API reference for `Ahko`, strategies, options, error classes, and events. |
| [Production Recipes & Patterns](./guides/recipes.md) | Engineers | Battle-tested recipes: paced API client, debounced search, throttled scroll, idle analytics, graceful shutdown. |

---

## Architecture & Specifications

| Document | Focus Area | Summary |
|---|---|---|
| [Architecture Specification](./architecture/ARCHITECTURE.md) | Architectural Foundation | Single-scheduler philosophy, native platform primitives, memory safety, and lifecycle state machine. |
| [Roadmap](./architecture/ROADMAP.md) | Version Progression | Progression from 0.1.0 through 1.0.0 stable release. |
| [Engineering Decisions Log](./architecture/LOG.md) | Design History | Chronological log of engineering decisions, trade-offs, and security remediations. |

---

## Contributing

See [CONTRIBUTING.md](../.github/CONTRIBUTING.md) for contribution guidelines.
