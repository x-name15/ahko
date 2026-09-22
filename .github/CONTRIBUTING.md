# Contributing to ahko

Thank you for considering a contribution to `@mrjacket/ahko`.

This is an open source project licensed under **GPL-3.0-only**, maintained primarily
by a single developer. Please read this document before submitting anything.

## Contact

Questions or design discussions: open a [GitHub Issue](https://github.com/x-name15/ahko/issues).
For security issues, see [SECURITY.md](SECURITY.md).

---

## Development workflow

1. Fork the repository and clone it locally.
2. Install dependencies: `npm install`
3. Create a topic branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
4. Make your changes.
5. Run the full verification pipeline:
   ```bash
   npm run typecheck
   npm run build
   npm test
   ```
6. Push your branch and open a Pull Request against `main`.

---

## Development scripts

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript type check (no output = pass) |
| `npm run build` | Build JS bundles + `.d.ts` into `dist/` |
| `npm test` | Run the Vitest test suite |
| `npm run test:watch` | Run Vitest in watch mode (great for TDD) |

---

## Commit conventions

- Code, comments, and documentation in **English**.
- Commit messages must be **clear and specific** — not `fix` or `update`.
- Subject line ≤ 72 characters, imperative mood.
- TypeScript: Hungarian notation for interfaces/enums/types (`ITaskContext`, `EScheduleStrategy`).
- `camelCase` for variables and functions.
- TSDocs required on all public APIs.

---

## Pull Request checklist

- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (all existing tests + new ones)
- [ ] All new public APIs have TSDocs
- [ ] Commit messages are descriptive and in English

---

Thank you for contributing.
