# CLAUDE.md — working rules for this repository

IR Angio Suite Simulator: a free, browser-based, controller-first interventional radiology simulator for medical students, residents and fellows. Educational only.

Before changing anything, read `spec/README.md`, then the spec for the area you touch. Build work comes from `prompts/`, one milestone at a time; a milestone is done only when its Done-when passes.

## Golden rules

1. **Keep the disclaimer.** The start screen shows the exact text in `spec/00-product-brief.md` §2, and every build that is shared keeps it.
2. **Never invent a number.** Every clinical, anatomical, device or physical value comes from `/data` with a unit, a confidence level and, when `sourced` or `derived`, a source id that exists in `data/sources.json`. If a value is missing, add it to `/data` as `placeholder` with a note, show it with a badge in the device inspector, and list it in the milestone summary. Never hard-code it.
3. **Design values live in `data/tuning/`** with confidence `design` (feel, speeds, colors, solver settings). Code holds no magic numbers beyond unit-conversion factors and mathematical constants; ESLint's `no-magic-numbers` enforces this in `src/sim/`, with an override only for `src/sim/math/` and `src/sim/core/` (polynomial, hash and PRNG constants, array strides).
4. **Simulation code is pure and deterministic.** Nothing under `src/sim/` imports three.js, React, the DOM, Web Audio or browser globals. It never calls `Math.random`, `Date.now`, `performance.now` or `crypto`: randomness comes from the seeded PRNG in `src/sim/core/rng.ts`, time from the fixed step counter. Step code uses only `+ − × ÷`, `Math.sqrt`, `Math.abs`, `Math.min`, `Math.max`, `Math.floor`; any trigonometry goes through `src/sim/math/detTrig.ts`.
5. **SI inside the simulation** (m, kg, s, N, Pa, rad). Clinical units exist only in `/data` and in the UI; conversion happens once at load (`src/data/units.ts`) and once at display. The render scene uses 1 unit = 1 mm.
6. **One input path.** Gamepad, keyboard and mouse, autopilot and replay all produce the same `InputFrame` and go through the same pure mapper; commands such as device swaps are step-stamped and logged the same way. Never add a control that bypasses it.
7. **Blocked actions explain themselves.** When a rule in `data/rules/` blocks or degrades an action, show its failure message and source; never fail silently.
8. **Tests come with code.** Every pure function gets a Vitest test, every physics behavior a golden scene, every screen flow an end-to-end check.
9. **Golden scenes stay green.** Change an expected value only with a written reason in the commit message.
10. **Respect licenses.** Dependencies must be MIT, BSD, Apache-2.0 or similar. LGPL or GPL code (for example SOFA BeamAdapter) is reference reading only; do not copy it.
11. **Trademarks.** Brand names appear next to generic names; the README and start screen carry the trademark notice. No vendor logos and no copied vendor screens; the UI follows general Siemens-style conventions only.
12. **No runtime network calls** except the app's own static assets. No analytics, no accounts, saves stay in the browser.

## Commands (available once milestone M1 scaffolds them)

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Typecheck, validate data, production build |
| `npm test` | Vitest unit tests and golden physics scenes |
| `npm run test:e2e` | Playwright end-to-end tests (Chromium) |
| `npm run validate-data` | Schema and provenance validation of `/data` |
| `npm run lint` | ESLint and Prettier check |

## When unsure

Ask before guessing anything clinical. Otherwise mark the gap as `placeholder` with a note, keep going, and list every new placeholder in the milestone summary so the medical reviewer can close it.
