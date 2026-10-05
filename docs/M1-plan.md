# M1 implementation plan

Milestone M1 (Foundations) as specified in `prompts/M1-foundations.md`, built in four phases and a gate (`prompts/M1-sessions.md`). Planned in session 1 on 2026-10-04 and approved by the owner on 2026-10-05.

Each build session reads this file, including the Progress log, and builds one phase. It pastes the output of every check, ticks the boxes and adds a Progress log entry: what was built, any deviation and why, and every value added to `/data`. Then it commits. Where the prompt is silent or ambiguous, the Decisions section applies. Anything else that is unclear stops the session, which asks before going on.

Checked at planning time: Apple M2 laptop (8 GB), macOS 26.4, Node 24.12, npm 11.6, git 2.52, gh installed. A provenance and units scan of the seed data finds zero issues. It covers 21 files: 818 sourced, 17 derived, 42 estimated, 66 placeholder and 117 design facts, matching the README.

## Phase A · Scaffold, tooling and data layer (session 2)

Build order:

- [ ] `package.json`: latest stable versions pinned exactly. Scripts: `dev`, `build` (validate-data, then `tsc --noEmit`, then `vite build`), `preview`, `test`, `test:e2e`, `validate-data`, `bench`, `lint`, `format`. Confirm each direct dependency is MIT, BSD, Apache-2.0 or similar.
- [ ] `tsconfig.json`, plus a config for scripts and tooling: `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`
- [ ] `vite.config.ts` (React, Tailwind, `base` from `BASE_PATH`, ES-module workers), `index.html`
- [ ] `eslint.config.js`: typescript-eslint and react-hooks.
  - In `src/sim/`, `src/input/mapping/` and `src/worker/session.ts`: ban `Math.random`, `Date.now`, `performance.now` and `crypto` with `no-restricted-globals` and `no-restricted-properties`, plus the trig and power functions (D27).
  - `no-magic-numbers` in `src/sim/`, ignoring −1, 0, 0.5, 1, 2 and array indexes, with the `src/sim/math/` and `src/sim/core/` override.
  - Prettier config.
- [ ] `vitest.config.ts` (unit and golden folders), `playwright.config.ts` skeleton
- [ ] `src/app/main.tsx`, `App.tsx`, `src/app/disclaimer.ts` (D26), `src/ui/StartScreen.tsx` (minimal), Tailwind entry CSS
- [ ] `src/data/units.ts` → unit test 1
- [ ] `src/data/schemas/`: fact, sources, devices, rules, materials, anatomy graph, anatomy reference, imaging, physiology, drugs, tuning with rod models, case v0, and the schema-id map (D24)
- [ ] `src/data/quantity.ts`: value, options with a selection, range with a selection, single bounds → unit test 2
- [ ] `src/data/validate.ts`: the spec 02 §14 checks in order, the 14 error codes and the report. `scripts/validate-data.ts`: the CLI, exit 1 on any error.
- [ ] `tests/fixtures/data-invalid/<code>/`: one small self-contained data folder per error code → unit test 3
- [ ] `src/data/provenance.ts`: how computed values inherit confidence (D13)
- [ ] `src/data/restShape.ts`: per-joint angle distribution → unit test 9
- [ ] `src/data/catalog.ts`: device instances from rod models for a tier (D21). Per-segment radii, E, I, EI, J, G, mass per length, friction and rest-shape joint angles, each with provenance. Also generic item instances with selections for the sheath, needles and anything else a rule reads. → unit test 8
- [ ] `src/data/loaders.ts`: anatomy graphs and the sandbox case, for Node (fs) and the browser (Vite imports)
- [ ] Extra unit test: the disclaimer string equals spec 00 §2 and the README

Done when (paste the output of each):

- [ ] `npm run validate-data` passes on the repository data and reports the counts above
- [ ] every invalid fixture fails with its expected code
- [ ] unit tests 1, 2, 3, 8 and 9 pass
- [ ] `npm run lint` and `tsc --noEmit` pass
- [ ] `npm run dev` serves the start screen with the exact disclaimer

Riskiest part: schemas that accept all 21 files unchanged yet still catch every fixture. To de-risk it, build the generic fact walker first: provenance, units, quantity shape and orphan quantities. Run it on all files and reproduce the counts above with zero errors before writing per-file schemas. Then add one fixture per code and confirm each fails for the right reason.

## Phase B · Headless simulation core (session 3)

Build order:

- [ ] `src/sim/core/`: `types.ts` (array strides), `records.ts` (InputFrame, Command, InputLog, Snapshot, virtual pad), `rng.ts`, `hash.ts` (FNV-1a), `clock.ts`, `events.ts` → unit test 5
- [ ] `src/sim/math/`: `detTrig.ts`, `vec3.ts`, `quat.ts` → unit tests 6 and 7
- [ ] `src/sim/rod/state.ts`: typed arrays, with the frame convention documented in the file. `build.ts`: node layout, masses, inertias, and rest Darboux vectors from the catalog's joint angles (D9).
- [ ] `src/sim/rod/constraints.ts`: stretch-shear and bend-twist, with the clamp joint per D10. `insertion.ts`: sheath valve, kinematic nodes, hub rotation through detTrig, hub force.
- [ ] Minimal `src/sim/engine.ts` (free space, `step`, `hash`, `applyExternalForce`), then the solver spike described under the risk below
- [ ] `src/sim/anatomy/graph.ts`, `lumen.ts`: capsules, uniform grid, queries → unit test 14
- [ ] `src/sim/rod/contact.ts`: projection, translational and torsional friction, tip normal force, `tipSegment`
- [ ] Golden scenes 1, 2, 3 and 5, then 6, 7 and 8. One scene per file in `tests/golden/`, with shared measurement helpers that follow §8's definitions (D15).
- [ ] `src/sim/rod/coaxial.ts` → golden scene 9, and the scene 9 part of scene 10 (D14)
- [ ] `src/sim/devices/instance.ts`, which turns a catalog instance into a runtime rod. `stack.ts`: active pair, lock, undriven devices hold L and φ, one-device stacks per D11. → unit test 11
- [ ] `src/sim/rules/compatibility.ts`, `reasons.ts`, and the named state predicates (D12) → unit test 4
- [ ] The order rule in the engine: `blocked-action` events and a debounced message
- [ ] The full engine API:
  - `load`, `step`, `command` (`swap-device`, `set-anatomy`, `reset`, `set-tier`), `snapshot`, `hash`
  - per-device L, φ, tip segment, tip normal force, hub force and wall stress (D16)
  - the five events
- [ ] `src/sim/snapshot.ts`: Float32 millimetre buffers plus device and C-arm scalars
- [ ] `src/sim/imaging/carm.ts` (D18) → unit test 13

Done when:

- [ ] unit tests 4, 5, 6, 7, 11, 13 and 14 pass
- [ ] golden scenes 1, 2, 3, 5, 6, 7, 8 and 9, and the scene 9 part of 10, pass with the prompt's tolerances
- [ ] `npm run lint` passes, including `no-magic-numbers` in `src/sim/`
- [ ] nothing in `src/sim/` imports three.js, React, the DOM, `src/input/` or browser globals

The riskiest part is solver accuracy with one Gauss–Seidel iteration per substep and 2 substeps at 1 kHz. Each wire node weighs about 8 mg, so a force F needs a position correction of roughly F·h²/m per substep, which is about 1.6% of a 2 mm segment per newton. That makes two cases likely to stretch the segment at the sheath clamp past the 0.5% limit: a full-speed push–pull reversal (scene 3) and the multi-newton load of a wire buckling against a cap (scene 12).

- To de-risk it, build the bare rod before contact, coaxial coupling or rules. Run scenes 1, 3 and 5 plus a scripted push into phantom A's cap, logging per-step stretch error and hub force. If the limit fails, switch to the direct solver (D3) and rerun.
- Second risk: at μ = 0, scene 6 requires the tip to advance within 2 mm of the hub. Part of any difference is geometric, because the wire cuts the inside of the bend or rides the outer wall instead of following the centerline. I estimate 1 to 2 mm. If the scene fails, I report the measured path difference and ask before touching the test.
- Third risk: physics cost. The budget is 4 ms per 16.7 steps, about 120 µs per substep for roughly 250 dynamic nodes. Time the step headless once contact and coaxial coupling exist. Keep the step loop allocation-free before Phase C.

## Phase C · Worker, commands, replay, input, autopilot and rumble (session 4)

Build order:

- [ ] `src/input/mapping/`: `curves.ts`, `settings.ts` (defaults from `tuning/input`), `mapPad.ts`, `mapKeyboard.ts`, `mapPointer.ts`. Pure functions, with the previous raw state passed in so press edges are detected. → unit test 10
- [ ] `src/sim/autopilot/`: `types.ts`, `sandboxCLeft.ts`, `sandboxBBend.ts`, `sandboxABuckle.ts`. Each is a pure `(step, stateView, params, memo) → (virtual pad, memo)` (D1, D6, D7).
- [ ] `src/worker/session.ts`: the pure session runner, which the worker and the golden tests both use (D6, D8). It handles the step-stamped frame queue, applies commands at their step, routes the autopilot through `mapPad` with the default settings and records the input log.
- [ ] `src/data/dataHash.ts` and `src/input/log.ts`: record changed frames and commands, round-trip through JSON, refuse a log with a different `dataHash` → unit test 15
- [ ] `src/worker/protocol.ts` and `physics.worker.ts`: at most `maxStepsPerMessage` steps per message, `?fast=1`, snapshots as transferred buffers, perf messages, and the startup tier benchmark (D17)
- [ ] `src/worker/client.ts`: wall time to target step, pause, frames stamped with their first step (D19)
- [ ] `src/input/sources/`: `gamepad.ts`, `keyboard.ts`, `pointer.ts`, `replay.ts`, and `arbiter.ts`, which merges live sources and sends `stop-autopilot` on takeover
- [ ] `src/input/rumble.ts`: pure scheduler plus a thin adapter → unit test 12
- [ ] Golden scenes 4, 11 and 12, and the sandbox-c-left part of scene 10

Done when:

- [ ] unit tests 10, 12 and 15 pass
- [ ] golden scenes 4, 10 (both parts), 11 and 12 pass
- [ ] every earlier test and lint still pass

Riskiest part: replays must stay deterministic across the worker boundary, and the closed-loop autopilots must always finish.

- To de-risk determinism, the worker is a thin shell around the same session runner the golden tests drive, so scene 11 exercises the real loop.
- To de-risk the autopilots, each runs headless early with a step budget and a phase trace, so a stall shows up as a failing test rather than a frozen demo.

## Phase D · Rendering, UI, end-to-end tests, bench, CI and README (session 5)

Build order:

- [ ] `src/render/renderer.ts`: `WebGPURenderer` with `await init()`, the backend reported, and a test flag that forces WebGL 2
- [ ] Fluoro view:
  - `src/render/scenes/fluoro.ts`: C-arm projection from `carm.ts` and the display mirror
  - `devices/deviceMesh.ts`
  - `post/fluoroPost.ts` in TSL: gray background, pulses, noise, blur, vignette, collimation, last-image hold
  - the phantom band, contrast puff and roadmap outline
- [ ] `src/render/scenes/anatomy3d.ts`: translucent phantom, tube meshes, orbit camera
- [ ] `src/state/`: Zustand stores for settings (`irsim:settings`), the session, and the HUD at 15 Hz
- [ ] `src/ui/`:
  - StartScreen: title, disclaimer, Enter sandbox, Watch a demo, the controls reference with detected glyphs, Settings
  - SandboxSetup, with blocked combinations
  - HUD: mode, fine and lock indicators, device stack, resistance meter, tip force, wall stress, imaging readouts, DEMO badge
  - Toasts
  - DevicePicker, with swap-device
  - DeviceInspector: every value the sim uses, with its confidence badge, source link and note. One tab per device, plus sheath and phantom, and solver and feedback.
  - PerfOverlay, PauseMenu, ControlsOverlay
- [ ] `src/audio/tones.ts` (D22)
- [ ] `tests/e2e/`: end-to-end tests 1 to 4 (D23, D25). A fake-gamepad helper through `addInitScript`, `?fast=1`, and a console-error guard in every test; SwiftShader flags when WebGL is missing.
- [ ] `scripts/bench.ts`: runs golden scene 8 on each tier and prints physics ms per simulated second
- [ ] `.github/workflows/ci.yml` and `pages.yml`
- [ ] README: Build status, Run it, Tests, the confidence counts from the report, perf numbers
- [ ] Playwright screenshots of the start screen, fluoro view and 3D view, checked against the prompt

Done when:

- [ ] end-to-end tests 1 to 4 pass
- [ ] every earlier test, lint and `npm run validate-data` pass
- [ ] `npm run build` succeeds

Riskiest part: two rendering backends in headless CI, and the rule of no console errors.

- To de-risk it, before any UI work: boot the renderer, report the backend, and get end-to-end test 1 green on both WebGPU and forced WebGL 2.
- Run the console-error guard from the first test, and keep the perf overlay on while building the post pass.
- I can read the perf overlay in the in-app browser on this M2. The owner then confirms 60 fps in Chrome with the controller.

## Gate (session 6)

- [ ] `/goal` from `prompts/M1-sessions.md`: build, lint, test, validate-data and test:e2e exit 0, and the three demos run headless with no console errors
- [ ] an independent review subagent; fix the gaps it finds, rerun every check, commit
- [ ] the M1 summary at the end of this file; commit "M1: done"
- [ ] the owner's test drive: at least 60 fps and at most 4 ms physics per frame in phantom C with the wire and the 5F catheter, recorded in the README

## Decisions

### The owner's calls (agreed 2026-10-05)

**D1 · How deep the wire goes in the sandbox-c-left demo.** Read `wireAdvanceIntoBranch` (80 mm) as the wire tip's distance past the carina. The wire then ends 80 mm into the 100 mm left daughter, and the catheter follows to 20 mm past the carina.

- The other reading fails: an 80 mm hub advance from 60 mm below the carina leaves the wire tip only about 20 mm past it. The order rule (the catheter never passes the wire tip) would then stop the catheter at or before the 20 mm that end-to-end test 2 requires.
- No data change. Golden scene 8 keeps its own wording, an 80 mm hub advance.

**D2 · What "the tip moves less than 2 mm" means in golden scene 12.** Measure the tip's signed advance along the centerline, the "tip advance" defined in §8.

- The scene passes when the tip advances less than 2 mm, so the hub's 20 mm minus the tip advance is at least 18 mm stored as buckling.
- A floppy tip that folds back at the cap is realistic and still counts as buckling.

**D3 · Solver upgrade if inextensibility fails.** If one Gauss–Seidel iteration per substep cannot hold segment length within 0.5% (scenes 3 and 12), use a direct solver.

- It replaces the stretch-shear sweep with an exact linear-time solve along each rod. This is the direct solver of Deul et al. 2018 that spec 01 §6 names as the upgrade path, and the MIT PositionBasedDynamics library implements it.
- Constraints, compliances, step rate, substeps and every tolerance stay as specified.
- Changing substeps or a tolerance still needs the owner's approval.

**D4 · Adding values to `/data` during the build.** New design values that the M1 prompt needs but `/data` lacks go into `data/tuning/`, as do placeholder values for any unsourced device claim. Each one is listed in the Progress log and the final summary; the expected ones are below.

- Ask the owner first before changing an existing value, any sourced or derived fact, anything outside `data/tuning/`, or `spec/`.

**D5 · Where colors live under golden rule 3.** Colors and gray levels that depict the simulation come from `data/tuning/render.json`: fluoro grays, attenuation, and device and vessel colors in the 3D view. UI chrome is presentation code in the Tailwind theme: panel and button palette, layout, spacing and type.

### Technical conventions

- **D6 · Autopilot dependency.** Spec 01 §2 says `src/sim/` depends only on itself, so the sim never imports `src/input/`. Scripts return a virtual pad. The pure session runner (`src/worker/session.ts`) maps the pad through `mapPad` with the default settings and steps the engine. The worker and the golden tests share that runner.
- **D7 · Autopilot memory.** Scripts are pure functions of `(step, stateView, params, memo)` that return `(pad, memo)`. The memo is plain numbers in engine-owned state, hashed and cleared on reset. sandbox-a-buckle needs it to remember when the stall began and where the hub was.
- **D8 · Logs and replays.** The input log keeps every changed frame the engine consumed, including autopilot frames (source `autopilot`), and every command.
  - A replay runs with the autopilot off and feeds the logged frames. `start-autopilot` and `stop-autopilot` only set the DEMO state.
  - Without this, a replay would drive the devices twice, and scene 11's "change one input frame" would have no effect.
- **D9 · Rest Darboux magnitude.** Use 2·sin(θ/2)/l̄ about d2, computed from the rest relative rotation, so each joint turns exactly its share of `bendAngle`. This matches the prompt's κ·d2 for small angles. Taken literally, κ·d2 would bend the Glidewire's single 45° joint to 46.2°.
- **D10 · Clamp discretization.** A node exactly at the sheath tip is kinematic. The bend-twist joint at the clamp uses half its Voronoi length (l/2), because its sheath side is rigid.
  - With a full-length clamp joint, scene 1's 25-segment cantilever deflects 6.1% too far, beyond its 5% tolerance. With half length the error is 0.08%.
- **D11 · One-device stacks** (golden scenes 1 to 8). The lone device is the inner device: right stick, `innerPush` and `innerRotate`. The outer slot is empty.
- **D12 · Compatibility results.**
  - Failure modes `block` and `block-or-friction` return block. `degrade`, `jam`, `rupture`, `fail-closure` and `warn` return degrade: the action is allowed and its consequence or warning shows. The result keeps the rule's mode.
  - Static checks in setup and the picker skip `state` rules; the engine evaluates those each step through named predicates.
  - A `device-specific` check with no named code yet returns unknown.
- **D13 · Provenance of computed values.** The weakest input confidence wins, ranked sourced > derived > estimated > placeholder. Design inputs never lower it, and a result built only from design inputs stays design. A formula result is at most derived, and it lists every input source with the formula as its note. Unit test 8 expects exactly this: an estimated Glidewire body EI and a placeholder tip.
- **D14 · Golden scene 10 splits across phases.** The scene 9 part runs in Phase B. The sandbox-c-left part runs in Phase C, where the autopilot exists.
- **D15 · Golden scene setup.**
  - Devices load straight along the access axis. A scene that starts with the tip past a bend (scene 7) first feeds the wire in at the scene's speed and μ, lets it settle, then measures.
  - Fixtures wire W and catheter K use μ = 0.1 for wire-in-catheter friction, the `fr-device-in-device` value. Each scene sets its own wall μ.
- **D16 · Wall stress.** Wall stress is ∫ max(0, tip normal force − `wallStressThreshold`) dt.
- **D17 · Tier choice.** In M1 the tier is chosen on physics alone, by the startup benchmark or Settings. The tiers' `renderer` field is informational until the M2 fallback tier. The benchmark's 16.7 ms frame comes from a new design value, the target frame rate.
- **D18 · C-arm.**
  - The pose is engine state: stepped, snapshotted, hashed and replayed.
  - Zoom fields are image diagonals, like `detectorDiagonal`.
  - Table travel is ± half the sourced travel around the start position.
  - The start pose is AP, with design defaults for SID, zoom field and table height.
  - The isocenter starts at the center of the phantom's bounding box.
- **D19 · Frame timing.** Each frame is stamped with its first step and applies until the next frame. The main thread therefore knows the interval when it builds a frame, so mouse-drag and wheel displacements convert exactly into rates for that interval, capped at full speed.
- **D20 · Control feel.**
  - Stick right, the D key and the right arrow rotate clockwise as seen from the hub (+φ).
  - Keyboard Shift applies fine mode while held, because Shift+Tab is also bound; L3 toggles fine mode.
  - While the pair is locked, both sticks' push and rotate inputs are summed, clamped, and drive both devices together.
- **D21 · Rod layout.** Segments are laid out from the tip at the tier's length. A remainder shorter than one segment is dropped at the handle end, which never enters the patient.
- **D22 · Sound in M1.** Play one short alarm tone with the hub-force-danger rumble, since spec 00 §9 requires rumble to be backed by sight and sound, and a softer tone on blocked actions. Settings gets a mute switch.
- **D23 · Browser hardening.**
  - The strict CSP meta tag goes only into the production build, because Vite's dev server needs inline scripts.
  - Zod runs `jitless`, so its eval probe never logs a CSP error.
  - Use a system font stack, with no external fonts.
  - End-to-end tests run against the production preview.
- **D24 · Validator layout.**
  - Strict Zod shapes where spec 02 defines them: sources, devices, rules, rod models, anatomy graphs and case v0.
  - Structural schemas for imaging, physiology, drugs, anatomy reference and materials; the generic walker checks their facts.
  - One self-contained fixture folder per error code, each declaring its expected code.
- **D25 · End-to-end reads.** End-to-end tests read numbers from `data-testid` attributes on HUD elements. The HUD shows depth past the sheath tip, so test 2 reads the catheter's distance past the carina from such an attribute.
- **D26 · Disclaimer source.** The disclaimer lives in one module, `src/app/disclaimer.ts`, and a unit test compares it with spec 00 §2 and the README.
- **D27 · Banned math in the sim.** ESLint in `src/sim/` also bans `Math.sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `pow`, `exp`, `log` and `hypot`. This enforces CLAUDE.md rule 4 through tooling; only tests compare detTrig against them.
- **D28 · Scripts created early.** The `bench` and `test:e2e` scripts exist from Phase A; the files they run arrive in Phase D.

### Expected data additions (design values, `data/tuning/` only; final names logged when added)

- `render`: `targetFrameRate` (60 Hz), used by the tier benchmark and the perf overlay
- `input`: `autopilot.advanceSpeed` and `autopilot.rotateSpeed`, for sandbox-c-left and sandbox-b-bend (sandbox-a-buckle uses its own `pushSpeed`)
- `render`: the starting C-arm pose: SID, zoom field and table height
- `render`: fluoro device attenuation and soft-tissue band opacity
- `render`: toast duration, blocked-message debounce, and the full scales of the tip-force and wall-stress bars
- `render`: 3D view camera and light values
- `render`: alarm and blocked tones (frequency, duration, gain)

### Not in M1 (left for later specs)

- replay UI and saved replays (spec 14)
- torque-device mode and position control (spec 10)
- DSA, contrast and flow physics (specs 07 and 08)
- drugs (spec 09)
- the rail fallback tier (M2)

## Progress log

_No entries yet._
