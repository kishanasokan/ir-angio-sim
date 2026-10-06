# Handoff: picking up the work

This page gets a new contributor, or a new AI chat session, productive without the history of earlier conversations. The repository carries everything: rules, specs, plans, decisions and a log of what each phase built.

## Current state (2026-10-06)

| Milestone M1 (Foundations) | Status | Commit |
| --- | --- | --- |
| Session 1 · Plan | Done | `M1: implementation plan` |
| Session 2 · Phase A: scaffold and data layer | Done | `M1 phase A: scaffold and data layer` |
| Session 3 · Phase B: headless simulation core | Done | `M1 phase B: simulation core` |
| Session 4 · Phase C: worker, input, autopilot and replay | Done | `M1 phase C: worker, input, autopilot and replay` |
| Session 5 · Phase D: rendering, UI, end-to-end tests, bench, CI, README | Done | `M1 phase D: rendering, UI and end-to-end tests` |
| Session 6 · Gate | Done | `M1: done` |

- All 213 unit and golden tests pass, and the 10 end-to-end tests pass on both WebGPU and WebGL 2.
- The app is playable: start screen, sandbox setup, the fluoro and 3D views, the HUD, the device picker and inspector, the perf overlay, the pause menu and the three demos.
- The gate's independent review found no blocking defect; its gaps are fixed or tracked (the gate entry in [docs/M1-plan.md](M1-plan.md) lists them). The plan ends with the **M1 summary**.
- Deferred by the owner to the final stage (D31): the 60 fps and ≤4 ms test drive on the M2 laptop, and the medical review of the placeholders (issue #4).

## Next: plan M2 in the planning chat

M2 (core systems: visceral tree, three-device stack, fluoro and DSA, flow network) needs specs 03, 04, 07, 08 and 10 and an M2 build prompt. None exists yet, and they are written with the owner in the planning chat ([spec/README.md](../spec/README.md)). Bring them:

- the M1 summary's "Data to check" and "Left for M2" ([docs/M1-plan.md](M1-plan.md));
- issue #5 (wire-in-catheter friction, two designs to choose from) and issue #3 (high-tier performance) for spec 04;
- phase D deviation 5 (the setup's wire is not in the input log) for spec 14.

What M1 left in place:

- **The app:** `src/app/sandboxRuntime.ts` runs one sandbox session on the main thread. It owns the renderer, both views, the physics client, input, rumble and tones, and writes the HUD store. React (`src/ui/`) draws only the HUD and the panels.
- **Rendering:** `src/render/`. The fluoro view adds optical depth per object into a float target, and a TSL post pass turns it into the image once per pulse. The 3D view shares the device geometry. The phase D Progress log entry in the plan explains the model.
- **Tests:** `npm run test:e2e` builds, serves the production preview and runs every test in two Chromium projects, `webgpu` (SwiftShader's software Vulkan) and `webgl2` (forced with `?webgl=1`).
- **Bench:** `npm run bench` prints physics cost per tier for golden scene 8 and the sandbox-c-left demo.
- **CI and Pages:** `ci.yml` runs everything, end-to-end tests included. `pages.yml` deploys `main` to GitHub Pages once the owner enables Pages (Settings → Pages → source "GitHub Actions").

## GitHub

The repository is public at [github.com/kishanasokan/ir-angio-sim](https://github.com/kishanasokan/ir-angio-sim).

- CI runs lint, the typecheck, data validation, every test, the build and the end-to-end tests on each push and pull request. A second workflow deploys `main` to GitHub Pages.
- The milestone **M1 Foundations** and issues #1 to #5 track phase D, the gate, high-tier performance, the placeholder review and the missing wire-in-catheter friction.
- Dependabot ignores the deliberate TypeScript and @types/node pins (phase A deviation 1).

## Read in this order

1. [CLAUDE.md](../CLAUDE.md): the twelve golden rules. They are not optional.
2. [spec/README.md](../spec/README.md), then the spec for your area. M1 uses specs 00, 01 and 02.
3. [docs/M1-plan.md](M1-plan.md) in full. Its **Decisions** (D1 to D30) settle everything the prompt leaves open, and its **Progress log** says what each phase built, every deviation and why, the values added to `/data`, and the measured results.
4. [prompts/M1-foundations.md](../prompts/M1-foundations.md): the build prompt. Its §8 lists every required test.
5. [prompts/M1-sessions.md](../prompts/M1-sessions.md): the prompt for each M1 session. M1 is done; M2 starts in the planning chat (above).

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
src/app/         boot, the sandbox runtime (renderer, client, input, rumble, tones), URL flags, HUD helpers
src/ui/          React screens, HUD and panels (start, setup, sandbox, picker, inspector, pause, perf)
src/state/       Zustand stores: settings (irsim:settings), session, HUD
src/render/      renderer boot and fallback, fluoro view and TSL post pass, 3D view, tube geometry
src/audio/       tones
tests/e2e/       Playwright end-to-end tests 1 to 4, the other demos (05), the panels (06), fake gamepad, console guard
tests/unit/      Vitest unit tests (the prompt's numbered tests plus module tests)
tests/golden/    golden physics scenes 1 to 12, one per file, with shared helpers
data/            every number, with units, confidence and sources
docs/            implementation plans and this page
```

## Things that will bite you

- **Vitest loads code natively.** `vitest.config.ts` loads unit and golden tests with Node's own `import` (through tsx), not Vite's module runner. The runner reaches every imported binding through a slow getter, which made the solver about 7× slower. Only `tests/unit/loaders.test.ts` needs Vite (it uses `import.meta.glob`).
- **The solver is direct, not Gauss–Seidel (D3, D29).** Each rod chain is solved exactly with a block-tridiagonal Cholesky, contact rows included. Contacts only push. Friction is implicit damping. A wire inside a catheter is a composite rod.
- **Stability settings matter.** `solver.rotationalInertiaScale` (1000) keeps a buckled wire's snap-through stable. The first two joints of a chain share the bend at the sheath tip or catheter tip, so nodes cross it smoothly. Both are explained in the plan's phase C entry. Rerun golden scenes 3, 4 and 12 after touching contact, insertion or the junction.
- **Performance.** On an M2 laptop the high tier costs 8 to 14 ms of physics per frame once the devices are deep, so the startup benchmark (D17) picks the standard tier (0.7 to 2.6 ms). Making the high tier fit its 4 ms budget is open work.
- **Determinism.** Nothing in `src/sim/` may read wall time or `Math.random`, or use trigonometry outside `detTrig`. Golden scene 11 compares hashes; a replay must match the live run exactly.
- **WebGPU in old Chromium.** three r186 sends a texture-view `swizzle` that Chromium 141 rejects. The renderer then falls back to WebGL 2 by itself, after a probe frame. The `webgpu` test project adds a test-only shim (`tests/e2e/fixtures.ts`) so that path still runs, and needs `--use-vulkan=swiftshader`, or SwiftShader's WebGPU device is lost.
- **A preinstalled Chromium.** Where Playwright's own browser is not installed, set `PLAYWRIGHT_CHROMIUM_PATH` (for example `/opt/pw-browsers/chromium`). CI installs Playwright's own.
- **`?fast=1` covers seconds per message.** One message runs 1000 steps, so anything sampled once per snapshot can alias. The fluoro state therefore uses `fluoroLastStep`.
- **One input path.** The UI acts on the frame the input loop builds. Do not read the keyboard or the pad separately for anything that reaches the simulation. Menu navigation by D-pad only moves DOM focus, and while a panel is open the loop keeps the navigation presses out of the frame the worker gets (`withoutPanelNavigation`).
- **Press edges.** Input is polled once per animation frame and buttons act on press edges. Headless software rendering runs near 10 fps, so an end-to-end test that presses the same key twice must let a frame or two pass in between (`06-panels.spec.ts`), and one that needs a pad press held must hold it until the HUD reacts (test 3).
- **Bit-identical solver changes.** The solve skips only exact-zero products; a unit test compares it with the plain loops bit for bit. To check a change to the hot path, compare the three demos' final hashes on both tiers before and after (the gate entry in the plan describes the run).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server; add `?webgl=1` to force WebGL 2 |
| `npm test` | Unit tests and golden scenes, about a minute |
| `npx vitest run tests/golden/scene06` | One golden scene |
| `npm run lint` | ESLint and Prettier |
| `npm run typecheck` | TypeScript |
| `npm run validate-data` | Schema and provenance validation of `/data` |
| `npm run build` | Validate, typecheck and build for production |
| `npm run test:e2e` | Build, serve the preview and run the Playwright tests on both backends |
| `npm run bench` | Physics cost per tier: golden scene 8 and the sandbox-c-left demo |

## Open items for review

- Placeholder values in `/data` are listed by `npm run validate-data`. The medical validator closes them.
- The Glidewire's floppy-tip placeholders (30 mm at 2% stiffness) decide where it folds at a cap (D30).
- There is no friction between a wire and a catheter in M1 (composite coupling; phase B deviation 3; issue #5). The inspector labels the value "not applied in M1".
- High-tier performance, above.
- Sandbox setup's sheath and wire choices are not yet recorded in input logs (spec 02 §13 has no header field; replays are spec 14). A replay does use its own log's seed, case and phantom, and refuses a log made with different data.
