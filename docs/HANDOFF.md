# Handoff: picking up the work

This page gets a new contributor, or a new AI chat session, productive without the history of earlier conversations. The repository carries everything: rules, specs, plans, decisions and a log of what each phase built.

## Current state (2026-10-05)

| Milestone M1 (Foundations) | Status | Commit |
| --- | --- | --- |
| Session 1 · Plan | Done | `M1: implementation plan` |
| Session 2 · Phase A: scaffold and data layer | Done | `M1 phase A: scaffold and data layer` |
| Session 3 · Phase B: headless simulation core | Done | `M1 phase B: simulation core` |
| Session 4 · Phase C: worker, input, autopilot and replay | Done | `M1 phase C: worker, input, autopilot and replay` |
| Session 5 · Phase D: rendering, UI, end-to-end tests, bench, CI, README | **Next** | `M1 phase D: rendering, UI and end-to-end tests` |
| Session 6 · Gate | After D | `M1: done` |

- All 173 unit and golden tests pass.
- The simulation runs headless: three demos (`sandbox-c-left`, `sandbox-b-bend` and `sandbox-a-buckle`) and replays through `src/worker/session.ts`.
- Nothing renders yet. The start screen shows only the disclaimer.

## Read in this order

1. [CLAUDE.md](../CLAUDE.md): the twelve golden rules. They are not optional.
2. [spec/README.md](../spec/README.md), then the spec for your area. M1 uses specs 00, 01 and 02.
3. [docs/M1-plan.md](M1-plan.md) in full. Its **Decisions** (D1 to D30) settle everything the prompt leaves open, and its **Progress log** says what each phase built, every deviation and why, the values added to `/data`, and the measured results.
4. [prompts/M1-foundations.md](../prompts/M1-foundations.md): the build prompt. Its §8 lists every required test.
5. [prompts/M1-sessions.md](../prompts/M1-sessions.md): the prompt for each session. To continue, run session 5.

## How the work flows

- **Planning** happens in a claude.ai chat with the owner (an MS4 who is also the current medical validator). It writes and revises `spec/` and `prompts/`.
- **Building** happens in Claude Code, one phase per session: read the plan, build to the prompt, paste the output of every check, tick the plan's boxes, add a Progress log entry, then commit with the phase's message.
- **Owner's calls.** Anything clinical, any change to an existing value in `data/` (outside new design values in `data/tuning/`), any change to `spec/`, and any loosened tolerance or changed golden expectation needs the owner's approval first. The approval is recorded as a Decision in the plan.
- **Commits** go to `main` for the owner's sessions. Outside contributors open pull requests; see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Where things live

```
src/data/        loads and validates /data, converts to SI once, builds engine, input and session configs
src/sim/         pure, deterministic simulation: rods, contact, coaxial coupling, stack, rules, C-arm, autopilot
src/input/       mappers (pure), sources, the arbiter, rumble, input logs
src/worker/      session runner (pure), protocol, physics worker, client, tier benchmark
src/app, src/ui  React app shell; phase D builds the UI and rendering
tests/unit       Vitest unit tests (the prompt's numbered tests plus module tests)
tests/golden     golden physics scenes 1 to 12, one per file, with shared helpers
data/            every number, with units, confidence and sources
docs/            implementation plans and this page
```

## Things that will bite you

- **Vitest loads code natively.** `vitest.config.ts` loads unit and golden tests with Node's own `import` (through tsx), not Vite's module runner. The runner reaches every imported binding through a slow getter, which made the solver about 7× slower. Only `tests/unit/loaders.test.ts` needs Vite (it uses `import.meta.glob`).
- **The solver is direct, not Gauss–Seidel (D3, D29).** Each rod chain is solved exactly with a block-tridiagonal Cholesky, contact rows included. Contacts only push. Friction is implicit damping. A wire inside a catheter is a composite rod.
- **Stability settings matter.** `solver.rotationalInertiaScale` (1000) keeps a buckled wire's snap-through stable. The first two joints of a chain share the bend at the sheath tip or catheter tip, so nodes cross it smoothly. Both are explained in the plan's phase C entry. Rerun golden scenes 3, 4 and 12 after touching contact, insertion or the junction.
- **Performance.** On an M2 laptop the high tier costs 8 to 14 ms of physics per frame once the devices are deep, so the startup benchmark (D17) picks the standard tier (0.7 to 2.6 ms). Making the high tier fit its 4 ms budget is open work.
- **Determinism.** Nothing in `src/sim/` may read wall time or `Math.random`, or use trigonometry outside `detTrig`. Golden scene 11 compares hashes; a replay must match the live run exactly.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server (the start screen for now) |
| `npm test` | Unit tests and golden scenes, about a minute |
| `npx vitest run tests/golden/scene06` | One golden scene |
| `npm run lint` | ESLint and Prettier |
| `npm run typecheck` | TypeScript |
| `npm run validate-data` | Schema and provenance validation of `/data` |
| `npm run build` | Validate, typecheck and build for production |

## Open items for review

- Placeholder values in `/data` are listed by `npm run validate-data`. The medical validator closes them.
- The Glidewire's floppy-tip placeholders (30 mm at 2% stiffness) decide where it folds at a cap (D30).
- There is no friction between a wire and a catheter in M1 (composite coupling; phase B deviation 3).
- High-tier performance, above.
