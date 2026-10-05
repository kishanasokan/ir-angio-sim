# M1 in Claude Code: session prompts

M1 is too big for one conversation, so it runs as a planning session, four build phases and a final gate. Each phase starts in a fresh conversation (`/clear`, or quit and run `claude` again). `docs/M1-plan.md` and the git history carry everything from one session to the next, so nothing depends on chat memory.

In Claude Code you can paste a prompt below, or type the short form: *"Run session 2 from prompts/M1-sessions.md."*

| Session | Mode | What it builds | Commit |
| --- | --- | --- | --- |
| 1 Plan | Plan mode | `docs/M1-plan.md` | M1: implementation plan |
| 2 Phase A | Auto mode | Scaffold, tooling, data layer, validator | M1 phase A: scaffold and data layer |
| 3 Phase B | Auto mode | Headless simulation core and golden physics scenes | M1 phase B: simulation core |
| 4 Phase C | Auto mode | Worker, commands, replay, input, autopilot, rumble | M1 phase C: worker, input, autopilot and replay |
| 5 Phase D | Auto mode | Rendering, UI, end-to-end tests, CI, README | M1 phase D: rendering, UI and end-to-end tests |
| 6 Gate | Auto mode | All checks green, independent review, summary | M1: done |

## Session 1 · Plan (start with `claude --permission-mode plan`)

```text
We're starting milestone M1. Read CLAUDE.md, spec/README.md, spec/00-product-brief.md, spec/01-architecture.md, spec/02-data-schemas.md and prompts/M1-foundations.md in full, and skim the data/ files the prompt references. Don't write code yet.

Propose an implementation plan for M1 in four phases:
- Phase A: scaffold, tooling and the data layer (prompt sections Stack, Scripts and §1), with unit tests 1, 2, 3, 8 and 9 and the validator fixtures.
- Phase B: the headless simulation core (§2, §3 and src/sim/imaging/carm.ts from §6), with unit tests 4, 5, 6, 7, 11, 13 and 14 and golden scenes 1, 2, 3, 5, 6, 7, 8, 9 and 10.
- Phase C: worker, commands, replay, input, autopilot and rumble (§4 and §5), with unit tests 10, 12 and 15 and golden scenes 4, 11 and 12.
- Phase D: rendering, UI, end-to-end tests, bench script, CI workflows and README (§6 to §9), with end-to-end tests 1 to 4.

For each phase list the files you will create in build order, the tests that prove the phase is done, and the riskiest part with how you will de-risk it. Then list anything in the specs, the prompt or the data that is contradictory, ambiguous or impossible, with your proposed resolution. Never change data/ or spec/ without asking me.

When I approve, your only action is to save the plan as docs/M1-plan.md (a checklist per phase, a "Decisions" section with the resolutions we agreed, an empty "Progress log"), commit it as "M1: implementation plan", and stop.
```

## Session 2 · Phase A (fresh conversation)

```text
Start M1 Phase A. Read docs/M1-plan.md, then the Stack, Scripts and §1 sections of prompts/M1-foundations.md, and spec/02 where you need detail.

Build Phase A as planned: scaffold the project in place without touching data/, spec/, CLAUDE.md, LICENSE or .gitignore; TypeScript strict settings, ESLint with the src/sim rules, Prettier, Vitest and every npm script; a minimal start screen that shows the exact disclaimer from spec/00 §2; and the data layer (Zod schemas, units, the validator and CLI with every error code, catalog, rest-shape distribution, loaders).

Phase A is done when: npm run validate-data passes on the repository data; every invalid fixture fails with its expected code; unit tests 1, 2, 3, 8 and 9 pass; lint and the typecheck pass; npm run dev serves the start screen. Run each check and paste the output. Fix failures at the root cause. Then tick the Phase A boxes in docs/M1-plan.md, add a Progress log entry (what you built, any deviation and why, every placeholder you added) and commit as "M1 phase A: scaffold and data layer". Don't start Phase B.
```

## Session 3 · Phase B (fresh conversation)

```text
Start M1 Phase B. Read docs/M1-plan.md including its Progress log, then §2, §3, the C-arm paragraph of §6 and the golden scene conventions in §8 of prompts/M1-foundations.md.

Build the headless simulation core exactly to that text: math and core utilities (detTrig, quaternions, PRNG, hash), rod state with the documented frame convention, XPBD constraints, insertion and the sheath, lumen contact with translational and torsional friction, coaxial coupling, the device stack, the order rule, the compatibility engine, the engine API and carm.ts. Nothing in src/sim may touch the DOM, three.js or React.

Phase B is done when unit tests 4, 5, 6, 7, 11, 13 and 14 and golden scenes 1, 2, 3, 5, 6, 7, 8, 9 and 10 pass, and lint passes including no-magic-numbers in src/sim. If a golden scene fails, find the physics cause. Never loosen a tolerance or change an expected value without asking me first and explaining why. Paste the test output, update docs/M1-plan.md (ticks and a Progress log entry) and commit as "M1 phase B: simulation core". Don't start Phase C.
```

## Session 4 · Phase C (fresh conversation)

```text
Start M1 Phase C. Read docs/M1-plan.md including its Progress log, then §4 and §5 of prompts/M1-foundations.md.

Build the worker loop and protocol, step-stamped commands, the input log and replay, the pure input mappers for gamepad, keyboard and mouse, the input sources and arbiter, the three worker-run autopilot scripts (parameters from data/cases/sandbox.json, default input settings) and the rumble scheduler and adapter.

Phase C is done when unit tests 10, 12 and 15 and golden scenes 4, 11 and 12 pass, and every earlier test still passes. Paste the output, update docs/M1-plan.md and commit as "M1 phase C: worker, input, autopilot and replay". Don't start Phase D.
```

## Session 5 · Phase D (fresh conversation)

```text
Start M1 Phase D. Read docs/M1-plan.md including its Progress log, then §6 to §9 of prompts/M1-foundations.md.

Build the renderer (WebGPU with WebGL 2 fallback, backend reported), the fluoro view with the C-arm projection and display mirror, the 3D view, and the UI: start screen with the controls reference and settings, sandbox setup with blocked combinations, HUD, device picker with swap-device, device inspector with confidence badges, perf overlay and pause menu. Keep the look sleek and uncluttered: game-like, but clinical. Then add the Playwright tests (fake gamepad through addInitScript, ?fast=1, SwiftShader flags if WebGL is missing), scripts/bench.ts, the ci.yml and pages.yml workflows, and the README sections.

Phase D is done when end-to-end tests 1 to 4 pass along with every earlier test and npm run build succeeds. Take screenshots of the start screen, the fluoro view and the 3D view with Playwright and check them against the prompt. Paste the outputs, update docs/M1-plan.md and commit as "M1 phase D: rendering, UI and end-to-end tests".
```

## Session 6 · Gate (fresh conversation)

First set a goal so Claude keeps going until every check is green:

```text
/goal npm run build, npm run lint, npm test, npm run validate-data and npm run test:e2e each exit 0 in this session's output, with no test skipped, deleted or weakened and no golden-scene expected value changed without a written reason; then all three autopilot demos run headless with no console errors. Or stop after 30 turns.
```

When the goal is met, ask for an independent review:

```text
Use a subagent with fresh context to review the whole M1 implementation against prompts/M1-foundations.md and CLAUDE.md. It should check every Done-when item, that every named test exists and tests what the prompt says, that src/sim stays pure and deterministic, and that no clinical, device or physical number is hard-coded outside /data. Report only gaps that affect correctness or the stated requirements. Then fix the gaps, rerun every check, and commit.
```

Then the summary:

```text
Write the M1 summary at the end of docs/M1-plan.md and show it to me: what was built, the test count, perf numbers you could measure (and which ones I must measure on my laptop), every placeholder added during M1, any data you think is wrong, and what is left for M2. Commit as "M1: done".
```

## After the gate · Your hands-on check

Run `npm run dev`, open the link in Chrome or Edge, and connect your controller. Watch the three demos, drive the wire and catheter yourself, press P for the perf overlay and I for the inspector. Then tell Claude the numbers and anything that feels wrong, with the tuning prompt:

```text
In the sandbox, [describe what feels wrong, for example: the Glidewire tip flops too much in phantom B / the catheter doesn't hold its curve / rotation lags too long]. Adjust only placeholder or design values in data/tuning/ or data/physics/materials.json, never sourced data and never code. Tell me which values you changed, from what to what, rerun the golden scenes, and commit. Also record my perf numbers in the README: [FPS], [physics ms per frame], [browser], [laptop].
```
