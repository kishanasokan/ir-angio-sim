# M1 implementation plan

Milestone M1 (Foundations) as specified in `prompts/M1-foundations.md`, built in four phases and a gate (`prompts/M1-sessions.md`). Planned in session 1 on 2026-10-04 and approved by the owner on 2026-10-05.

Each build session reads this file, including the Progress log, and builds one phase. It pastes the output of every check, ticks the boxes and adds a Progress log entry: what was built, any deviation and why, and every value added to `/data`. Then it commits. Where the prompt is silent or ambiguous, the Decisions section applies. Anything else that is unclear stops the session, which asks before going on.

Checked at planning time: Apple M2 laptop (8 GB), macOS 26.4, Node 24.12, npm 11.6, git 2.52, gh installed. A provenance and units scan of the seed data finds zero issues. It covers 21 files: 818 sourced, 17 derived, 42 estimated, 66 placeholder and 117 design facts, matching the README.

## Phase A · Scaffold, tooling and data layer (session 2)

Build order:

- [x] `package.json`: latest stable versions pinned exactly. Scripts: `dev`, `build` (validate-data, then `tsc --noEmit`, then `vite build`), `preview`, `test`, `test:e2e`, `validate-data`, `bench`, `lint`, `format`. Confirm each direct dependency is MIT, BSD, Apache-2.0 or similar.
- [x] `tsconfig.json`, plus a config for scripts and tooling: `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`
- [x] `vite.config.ts` (React, Tailwind, `base` from `BASE_PATH`, ES-module workers), `index.html`
- [x] `eslint.config.js`: typescript-eslint and react-hooks.
  - In `src/sim/`, `src/input/mapping/` and `src/worker/session.ts`: ban `Math.random`, `Date.now`, `performance.now` and `crypto` with `no-restricted-globals` and `no-restricted-properties`, plus the trig and power functions (D27).
  - `no-magic-numbers` in `src/sim/`, ignoring −1, 0, 0.5, 1, 2 and array indexes, with the `src/sim/math/` and `src/sim/core/` override.
  - Prettier config.
- [x] `vitest.config.ts` (unit and golden folders), `playwright.config.ts` skeleton
- [x] `src/app/main.tsx`, `App.tsx`, `src/app/disclaimer.ts` (D26), `src/ui/StartScreen.tsx` (minimal), Tailwind entry CSS
- [x] `src/data/units.ts` → unit test 1
- [x] `src/data/schemas/`: fact, sources, devices, rules, materials, anatomy graph, anatomy reference, imaging, physiology, drugs, tuning with rod models, case v0, and the schema-id map (D24)
- [x] `src/data/quantity.ts`: value, options with a selection, range with a selection, single bounds → unit test 2
- [x] `src/data/validate.ts`: the spec 02 §14 checks in order, the 14 error codes and the report. `scripts/validate-data.ts`: the CLI, exit 1 on any error.
- [x] `tests/fixtures/data-invalid/<code>/`: one small self-contained data folder per error code → unit test 3
- [x] `src/data/provenance.ts`: how computed values inherit confidence (D13)
- [x] `src/data/restShape.ts`: per-joint angle distribution → unit test 9
- [x] `src/data/catalog.ts`: device instances from rod models for a tier (D21). Per-segment radii, E, I, EI, J, G, mass per length, friction and rest-shape joint angles, each with provenance. Also generic item instances with selections for the sheath, needles and anything else a rule reads. → unit test 8
- [x] `src/data/loaders.ts`: anatomy graphs and the sandbox case, for Node (fs) and the browser (Vite imports)
- [x] Extra unit test: the disclaimer string equals spec 00 §2 and the README

Done when (paste the output of each):

- [x] `npm run validate-data` passes on the repository data and reports the counts above
- [x] every invalid fixture fails with its expected code
- [x] unit tests 1, 2, 3, 8 and 9 pass
- [x] `npm run lint` and `tsc --noEmit` pass
- [x] `npm run dev` serves the start screen with the exact disclaimer

Riskiest part: schemas that accept all 21 files unchanged yet still catch every fixture. To de-risk it, build the generic fact walker first: provenance, units, quantity shape and orphan quantities. Run it on all files and reproduce the counts above with zero errors before writing per-file schemas. Then add one fixture per code and confirm each fails for the right reason.

## Phase B · Headless simulation core (session 3)

Build order:

- [x] `src/sim/core/`: `types.ts` (array strides), `records.ts` (InputFrame, Command, InputLog, Snapshot, virtual pad), `rng.ts`, `hash.ts` (FNV-1a), `clock.ts`, `events.ts` → unit test 5
- [x] `src/sim/math/`: `detTrig.ts`, `vec3.ts`, `quat.ts` → unit tests 6 and 7 (`vec3.ts` was dropped as unused; see the Progress log)
- [x] `src/sim/rod/state.ts`: typed arrays, with the frame convention documented in the file. `build.ts`: node layout, masses, inertias, and rest Darboux vectors from the catalog's joint angles (D9).
- [x] `src/sim/rod/constraints.ts`: stretch-shear and bend-twist, with the clamp joint per D10. `insertion.ts`: sheath valve, kinematic nodes, hub rotation through detTrig, hub force.
- [x] Minimal `src/sim/engine.ts` (free space, `step`, `hash`, `applyExternalForce`), then the solver spike described under the risk below
- [x] `src/sim/anatomy/graph.ts`, `lumen.ts`: capsules, uniform grid, queries → unit test 14
- [x] `src/sim/rod/contact.ts`: projection, translational and torsional friction, tip normal force, `tipSegment`
- [x] Golden scenes 1, 2, 3 and 5, then 6, 7 and 8. One scene per file in `tests/golden/`, with shared measurement helpers that follow §8's definitions (D15).
- [x] `src/sim/rod/coaxial.ts` → golden scene 9, and the scene 9 part of scene 10 (D14)
- [x] `src/sim/devices/instance.ts`, which turns a catalog instance into a runtime rod. `stack.ts`: active pair, lock, undriven devices hold L and φ, one-device stacks per D11. → unit test 11
- [x] `src/sim/rules/compatibility.ts`, `reasons.ts`, and the named state predicates (D12) → unit test 4
- [x] The order rule in the engine: `blocked-action` events and a debounced message
- [x] The full engine API:
  - `load`, `step`, `command` (`swap-device`, `set-anatomy`, `reset`, `set-tier`), `snapshot`, `hash`
  - per-device L, φ, tip segment, tip normal force, hub force and wall stress (D16)
  - the five events
- [x] `src/sim/snapshot.ts`: Float32 millimetre buffers plus device and C-arm scalars
- [x] `src/sim/imaging/carm.ts` (D18) → unit test 13

Done when:

- [x] unit tests 4, 5, 6, 7, 11, 13 and 14 pass
- [x] golden scenes 1, 2, 3, 5, 6, 7, 8 and 9, and the scene 9 part of 10, pass with the prompt's tolerances
- [x] `npm run lint` passes, including `no-magic-numbers` in `src/sim/`
- [x] nothing in `src/sim/` imports three.js, React, the DOM, `src/input/` or browser globals

The riskiest part is solver accuracy with one Gauss–Seidel iteration per substep and 2 substeps at 1 kHz. Each wire node weighs about 8 mg, so a force F needs a position correction of roughly F·h²/m per substep, which is about 1.6% of a 2 mm segment per newton. That makes two cases likely to stretch the segment at the sheath clamp past the 0.5% limit: a full-speed push–pull reversal (scene 3) and the multi-newton load of a wire buckling against a cap (scene 12).

- To de-risk it, build the bare rod before contact, coaxial coupling or rules. Run scenes 1, 3 and 5 plus a scripted push into phantom A's cap, logging per-step stretch error and hub force. If the limit fails, switch to the direct solver (D3) and rerun.
- Second risk: at μ = 0, scene 6 requires the tip to advance within 2 mm of the hub. Part of any difference is geometric, because the wire cuts the inside of the bend or rides the outer wall instead of following the centerline. I estimate 1 to 2 mm. If the scene fails, I report the measured path difference and ask before touching the test.
- Third risk: physics cost. The budget is 4 ms per 16.7 steps, about 120 µs per substep for roughly 250 dynamic nodes. Time the step headless once contact and coaxial coupling exist. Keep the step loop allocation-free before Phase C.

## Phase C · Worker, commands, replay, input, autopilot and rumble (session 4)

Build order:

- [x] `src/input/mapping/`: `curves.ts`, `settings.ts` (defaults from `tuning/input`), `mapPad.ts`, `mapKeyboard.ts`, `mapPointer.ts`. Pure functions, with the previous raw state passed in so press edges are detected. → unit test 10
- [x] `src/sim/autopilot/`: `types.ts`, `sandboxCLeft.ts`, `sandboxBBend.ts`, `sandboxABuckle.ts`. Each is a pure `(step, stateView, params, memo) → (virtual pad, memo)` (D1, D6, D7).
- [x] `src/worker/session.ts`: the pure session runner, which the worker and the golden tests both use (D6, D8). It handles the step-stamped frame queue, applies commands at their step, routes the autopilot through `mapPad` with the default settings and records the input log.
- [x] `src/data/dataHash.ts` and `src/input/log.ts`: record changed frames and commands, round-trip through JSON, refuse a log with a different `dataHash` → unit test 15
- [x] `src/worker/protocol.ts` and `physics.worker.ts`: at most `maxStepsPerMessage` steps per message, `?fast=1`, snapshots as transferred buffers, perf messages, and the startup tier benchmark (D17)
- [x] `src/worker/client.ts`: wall time to target step, pause, frames stamped with their first step (D19)
- [x] `src/input/sources/`: `gamepad.ts`, `keyboard.ts`, `pointer.ts`, `replay.ts`, and `arbiter.ts`, which merges live sources and sends `stop-autopilot` on takeover
- [x] `src/input/rumble.ts`: pure scheduler plus a thin adapter → unit test 12
- [x] Golden scenes 4, 11 and 12, and the sandbox-c-left part of scene 10

Done when:

- [x] unit tests 10, 12 and 15 pass
- [x] golden scenes 4, 10 (both parts), 11 and 12 pass
- [x] every earlier test and lint still pass

Riskiest part: replays must stay deterministic across the worker boundary, and the closed-loop autopilots must always finish.

- To de-risk determinism, the worker is a thin shell around the same session runner the golden tests drive, so scene 11 exercises the real loop.
- To de-risk the autopilots, each runs headless early with a step budget and a phase trace, so a stall shows up as a failing test rather than a frozen demo.

## Phase D · Rendering, UI, end-to-end tests, bench, CI and README (session 5)

Build order:

- [x] `src/render/renderer.ts`: `WebGPURenderer` with `await init()`, the backend reported, and a test flag that forces WebGL 2
- [x] Fluoro view:
  - `src/render/scenes/fluoro.ts`: C-arm projection from `carm.ts` and the display mirror
  - `devices/deviceMesh.ts`
  - `post/fluoroPost.ts` in TSL: gray background, pulses, noise, blur, vignette, collimation, last-image hold
  - the phantom band, contrast puff and roadmap outline
- [x] `src/render/scenes/anatomy3d.ts`: translucent phantom, tube meshes, orbit camera
- [x] `src/state/`: Zustand stores for settings (`irsim:settings`), the session, and the HUD at 15 Hz
- [x] `src/ui/`:
  - StartScreen: title, disclaimer, Enter sandbox, Watch a demo, the controls reference with detected glyphs, Settings
  - SandboxSetup, with blocked combinations
  - HUD: mode, fine and lock indicators, device stack, resistance meter, tip force, wall stress, imaging readouts, DEMO badge
  - Toasts
  - DevicePicker, with swap-device
  - DeviceInspector: every value the sim uses, with its confidence badge, source link and note. One tab per device, plus sheath and phantom, and solver and feedback.
  - PerfOverlay, PauseMenu, ControlsOverlay
- [x] `src/audio/tones.ts` (D22)
- [x] `tests/e2e/`: end-to-end tests 1 to 4 (D23, D25). A fake-gamepad helper through `addInitScript`, `?fast=1`, and a console-error guard in every test; SwiftShader flags when WebGL is missing.
- [x] `scripts/bench.ts`: runs golden scene 8 on each tier and prints physics ms per simulated second
- [x] `.github/workflows/ci.yml` and `pages.yml`
- [x] README: Build status, Run it, Tests, the confidence counts from the report, perf numbers
- [x] Playwright screenshots of the start screen, fluoro view and 3D view, checked against the prompt

Done when:

- [x] end-to-end tests 1 to 4 pass
- [x] every earlier test, lint and `npm run validate-data` pass
- [x] `npm run build` succeeds

Riskiest part: two rendering backends in headless CI, and the rule of no console errors.

- To de-risk it, before any UI work: boot the renderer, report the backend, and get end-to-end test 1 green on both WebGPU and forced WebGL 2.
- Run the console-error guard from the first test, and keep the perf overlay on while building the post pass.
- I can read the perf overlay in the in-app browser on this M2. The owner then confirms 60 fps in Chrome with the controller.

## Gate (session 6)

- [x] `/goal` from `prompts/M1-sessions.md`: build, lint, test, validate-data and test:e2e exit 0, and the three demos run headless with no console errors
- [x] an independent review subagent; fix the gaps it finds, rerun every check, commit
- [x] the M1 summary at the end of this file; commit "M1: done"
- [ ] the owner's test drive: at least 60 fps and at most 4 ms physics per frame in phantom C with the wire and the 5F catheter, recorded in the README. Deferred by the owner to the final stage (D31).

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

### The owner's call during session 3 (agreed 2026-10-05)

**D29 · The full direct design.** One Gauss–Seidel iteration per substep cannot hold the rod at physical masses: at h = 0.5 ms a 2 mm wire segment's ω·h is about 30, and in the solver spike the scene 1 cantilever sagged 57 mm instead of 1.43 mm while segments stretched 75%. D3's direct solver fixes the rod, and the rest of the core follows it:

- Lumen contacts are rows in the same direct solve as the rod, so a stiff rod cannot spring back through the wall. Contact only pushes: a row that would pull its node onto the wall is released and the substep solved again.
- Coulomb friction, sliding and twisting, uses the last substep's contact force. It is applied as implicit (backward-Euler) damping, so it resists sliding with μ·N but can never reverse it, even on a wire's 8 mg nodes.
- A wire inside a catheter is one composite rod: the stiffnesses add, so the stiffer member sets the shared curve (scene 9's 31.9°). Beyond the catheter tip the wire continues as its own rod, attached at the tip.
- Every test, tolerance, step rate and substep count stays as specified.

### The owner's call during session 4 (agreed 2026-10-05)

**D30 · The buckling demo pushes 50 mm past the stall.** With a stable solve, the Glidewire's 30 mm floppy tip (placeholder) folds back into a J at the cap at about 0.4 N. Within the 20 mm the prompt names, the hub force therefore never reaches `feedback.hubForceDanger`. Pushing on, the body buckles and passes 0.8 N at about 33 mm.

- The case's `sandbox-a-buckle.extraPush` is now 50 mm (it was 20).
- Golden scene 12 measures over the demo's extra push instead of a fixed 20 mm. Its other checks are unchanged: tip advance below 2 mm (D2), hub force above danger, a danger event, and segments within 0.5%.

### The owner's call during session 6 (agreed 2026-10-06)

**D31 · The test drive and the medical review wait for the final stage.** The owner will do the hands-on test drive (the gate's 60 fps and ≤4 ms on their laptop, recorded in the README) and the medical review of the placeholders (issue #4) at the project's final stage, not at the M1 gate.

- M1 is declared done with those two items open. Everything else in the gate passes.
- The build itself keeps the startup benchmark (D17), so a laptop where the high tier is over budget runs the standard tier.

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

### 2026-10-05 · Phase A (session 2): scaffold and data layer

**Built**

- Scaffold: Vite 8, React 19, Tailwind 4, TypeScript 6.0 (strict), ESLint 10 with type-aware typescript-eslint and react-hooks, Prettier, Vitest 5, Playwright 1.63 (config only; the tests arrive in Phase D) and tsx.
  - Every npm script from the prompt is in place, plus `typecheck`.
  - Every direct dependency is MIT or Apache-2.0, and `npm install` reports 0 vulnerabilities.
- Purity lint:
  - `src/sim/`, `src/input/mapping/` and `src/worker/session.ts` ban DOM, wall-time, randomness, storage and network globals.
  - `src/sim/` and `session.ts` also ban the Math functions that are not correctly rounded, and the `**` operator.
  - `src/sim/` may not import three.js, React or Zustand, the app layers, `src/input` or `src/worker` (D6). From `src/data` it may import only types.
  - `no-magic-numbers` covers `src/sim/` outside `math/` and `core/`.
  - Throwaway probe files confirmed all of this: 13 deliberate violations were caught, while the `core/` constants and `Math.pow` in mapping were allowed.
- Start screen showing the exact disclaimer. The text lives in `src/app/disclaimer.ts`, and a test keeps it identical to spec 00 §2 and the README. Production builds get the strict CSP meta tag (D23).
- Data layer in `src/data/`:
  - units, facts, quantity resolution and provenance (D13)
  - Zod schemas for all 11 schema ids (D24)
  - the validator with its 14 error codes and its report, plus the CLI in `scripts/validate-data.ts`
  - rest-shape distribution
  - the catalog: rod instances per tier, with per-segment properties and provenance, plus item instances and path resolution for the rules
  - loaders for the repository and for anatomy graphs and cases in SI
  - the bundled copy of `/data` for the browser
- Tests: 64 in 9 files, covering unit tests 1, 2, 3, 8 and 9 plus the disclaimer, provenance, loaders and CLI. There are 14 invalid-data fixtures, one per error code; each fails with only its own code.

**Deviations, and why**

1. TypeScript is pinned at 6.0.3, not the latest 7.0.2. The stack requires typescript-eslint 8.71, which supports only TypeScript below 6.1, and TypeScript 7, the native compiler, ships without the compiler API that linters use. `@types/node` is pinned at 24.19.1 to match the Node 24 LTS runtime instead of the 26.x line.
2. A device item needs a `genericName` or a `brandName`. Spec 02 §7.1 makes `genericName` required, but nine coil and plug items in `embolics.json` have only a brand name: emb-concerto, emb-interlock, emb-prestige, emb-azur, emb-ruby, emb-pod, emb-packing-coil, emb-avp4 and emb-mvp.
3. Ids may contain dots between letters or digits, because twelve microcatheter ids carry decimal sizes, such as `mc-progreat-2.0`. Spec 02 says ids are kebab-case.
4. The quantity-shape and unit checks apply to every object that holds a value, options or a range, not only to facts. The repository data passes.
5. Lint goes slightly beyond the prompt in `src/sim/`:
   - It also bans numbers in variable declarations, because `no-magic-numbers` lets `const SPEED = 30` through, and it bans the `**` operator.
   - D27's Math bans cover `src/sim/` and `src/worker/session.ts`. `src/input/mapping/` keeps `Math.pow` for the response curve sign(x)·|x|^n.
6. Two readings where the spec is silent:
   - A rest-shape joint sits at the node the two segments share: joint j at node j+1.
   - A `{min, max}` modulus ratio ramps from min at `fromTip` to max at `toTip`.
7. Added `.claude/launch.json` so the in-app browser can start the dev server.

**Values added to `/data`:** none. **Placeholders added:** none.

**For the planning chat:** deviations 2 and 3, where the seed data and spec 02 disagree.

**Checks** (output pasted in session 2):

- `npm run validate-data`: exit 0 with no errors; counts 818 / 17 / 42 / 66 / 117.
- Each of the 14 fixtures exits 1 with only its own code.
- 64 of 64 tests pass.
- `npm run typecheck` and `npm run lint` (ESLint and Prettier): exit 0.
- `npm run dev` serves the start screen with the exact disclaimer and no console errors.
- `npm run build` also succeeds, and the CSP tag appears only in production.

### 2026-10-05 · Phase B (session 3): headless simulation core

**Built**

- `src/sim/core/`: strides and shared constants, records (InputFrame, Command, InputLog, virtual pad), the mulberry32 PRNG, FNV-1a hashing, the step clock and the five events.
- `src/sim/math/`: detTrig (fdlibm-style sin, cos and atan2, at most 4.4e-16 from `Math` on [−4π, 4π]), quaternions, 3×3 helpers, cylinder inertia and the block-tridiagonal solver.
- `src/sim/rod/`: rod state with the frame convention documented in `state.ts`, rod building with D9 rest chords, insertion and the sheath clamp (D10), the direct XPBD solve with contact rows (D29), lumen contact with implicit friction, and coaxial coupling as a composite rod.
- `src/sim/anatomy/`: graph helpers and the capsule lumen with its uniform grid.
- `src/sim/devices/`: the device instance shape and the stack (active pair, lock, D11, D20).
- `src/sim/rules/`: the compatibility engine, failure modes and messages (D12), and the state predicate `wire-leads-catheter`, which the engine's order rule uses. `src/data/ruleEnvironment.ts` resolves rule paths against device instances, the case and `ruleParameters`, so `src/sim` stays free of `/data`.
- `src/sim/engine.ts`: the full API — load, step, step-stamped commands (`reset`, `set-anatomy`, `set-tier`, `swap-device`, plus the autopilot start and stop flags), snapshot, hash and `applyExternalForce`. It tracks L, φ, tip segment, tip normal force, hub force and wall stress (D16) per device, and emits the five events. `blocked-action` fires once per block; the debounced message is the toast's job in Phase D.
- `src/sim/snapshot.ts` with Float32 millimetre buffers, and `src/sim/imaging/carm.ts` (D18).
- `src/data/simConfig.ts`: engine configurations in SI, built from `/data`.
- Tests: 137 in 29 files. These are unit tests 4, 5, 6, 7, 11, 13 and 14, golden scenes 1, 2, 3, 5, 6, 7, 8 and 9 with the scene 9 part of 10, and new unit tests for the core, the math, the rod modules and the engine API.

**Deviations, and why**

1. **The direct design (D29).** The owner chose it once the solver spike showed one Gauss–Seidel iteration could not hold the rod. Consequences:
   - Lumen contacts are rows in the rod's solve. Each substep solves again while contacts are added (a node ended beyond the wall) or released (the row pulled its node onto the wall), up to `contactSolvePasses` solves; the sandbox averages 1.03 to 1.13 solves per substep.
   - A node starts a substep with a contact row only if it is predicted beyond the wall or it pressed on the wall last substep and is still within `contactActivationDistance`. Penetrations below 1e-12 m count as rounding. Without these two rules a node resting on the wall with no load flipped in and out of contact on rounding noise, and the extra solves tripled the cost.
2. **Friction is force-based, not the prompt's position rule.** The prompt cancels tangential displacement below μ·d. Here Coulomb friction μ·N (sliding) and μ·N·r (twist) opposes the motion, using the last substep's normal force, regularized below `frictionSlipSpeed` and `frictionSlipSpin`.
   - It is applied implicitly: the predicted sliding and spin are damped, and the node is made heavier along the wall for that solve. An explicit force made scene 6 blow up at μ = 0.1, because the damping-to-mass ratio of 8 mg nodes far exceeds the stability limit.
   - A second instability, in scene 7 at μ = 0, came from contact rows that pulled nodes onto the wall and then released them a substep later. Push-only contact (deviation 1) removed it.
3. **Coaxial coupling is a composite rod (D29), not the prompt's distance constraint with split corrections.** Inner-device nodes inside the catheter ride exactly on its centerline, so scene 10's gap is 7e-14 mm against a limit of 0.1008 mm. Axially each device follows its own hub, so the wire slides freely inside the catheter and `lumenFriction` is unused in M1.
   - The inner device's mass, bending stiffness and rest curve, turned by ψ = φ_inner − φ_outer − the catheter's accumulated twist, add to the catheter's joints.
   - Beyond the catheter tip the wire is its own chain. Its first node is held laterally on the catheter's tip segment, and its first joint uses half length, like the clamp (D10).
4. **Two additions the prompt does not name, both needed for pre-shaped tips:**
   - **Release ramp.** Where a chain starts (at the sheath tip or an outer device's tip), the first segment's rest bend grows with the length that has emerged. A curved tip leaving the sheath therefore unfolds instead of snapping.
   - **Load relax.** At load and reset, the devices relax for `loadRelaxSteps` zero-input steps before step 0, because pre-shaped tips start straight in the sheath. Without it, the first steps stretched the Glidewire's angled tip by 16%; with it, by 5e-8.
5. **Hub force** is the stretch-row λ of the first free segment projected on the access axis, as force λ/(l·h²), averaged over the step's substeps. For an inner device whose chain starts at a catheter tip, the projection axis is the catheter's tip tangent.
6. **Scene setup choices.**
   - Scene 7 feeds the wire at 10 mm/s, the speed of scenes 6 and 8, because the scene names no feed speed (D15).
   - Scene 9 pulls the wire back at full speed.
   - Scene 8 also checks that a `tip-entered-segment` event names the branch.
   - Scene speeds come from `tuning/input` through a helper instead of literals.
7. **Test runner.** Vitest's default module runner reaches every imported binding through a getter on a slow-mode object, which made the solver's loops about 7× slower: 14.5 s against 2.1 s for the same 2000 steps. `vitest.config.ts` now loads unit and golden tests through Node's own `import`, with tsx as the loader. The one suite that needs `import.meta.glob` (`loaders.test.ts`) keeps the Vite runner. The test timeout is 300 s.
8. **Small structural changes.** `math/vec3.ts` and `smallMatrix.ts` were removed as unused; the block solve does its own small-matrix work. `MIN_DEVICES_TO_MOVE_PAIR` (3, from prompt §2) and `PLACEMENT_VALUES` live in `core/types.ts`.

**Performance** (headless Node 24 on this M2, physics per 16.7 ms frame, sandbox in phantom C with the 5F Berenstein and the Glidewire):

| Position | High tier | Standard tier |
| --- | --- | --- |
| Start: catheter 20 mm and wire 30 mm past the sheath tip | 3.3 ms | 0.7 ms |
| Wire advancing to 150 mm | 7.7 ms | 1.7 ms |
| Catheter advancing to 110 mm | 13.3 ms | 2.9 ms |
| Deep, still or rotating (75 free nodes) | 8.9 to 9.4 ms | 2.2 ms |

- Changes this session cut the cost 3 to 4×:
  - The far kinematic part of each device is placed once per step, and only when L, φ or a rate changed.
  - Prediction and twist accumulation cover only the free part.
  - The block solve uses L⁻¹·U with a symmetric update and drops a unit's contact row when it has no contact.
  - Assembly uses unrolled products and only the lower triangle.
- **Open risk:** the high tier exceeds 4 ms per frame once about 30 nodes are free; the standard tier stays within it. The startup benchmark (D17) therefore needs a representative state. In Phase C it will run its 300 steps of phantom C with the devices at depth, so this machine picks the standard tier. Getting the high tier under budget would need hand-derived block formulas for the rod's fixed constraint structure; that is a candidate for Phase D's bench work.

**Values added to `/data`** (design, `data/tuning/` only, per D4; each note says "Added in M1 phase B"):

- `physics.json → solver`:
  - `contactActivationDistance` 0.005 mm
  - `contactSolvePasses` 4
  - `frictionSlipSpeed` 1 mm/s
  - `frictionSlipSpin` 10 deg/s
  - `loadRelaxSteps` 500
- `render.json → carm` (D18): `defaultSourceToImageDistance` 100 cm, `defaultZoomField` 30 cm and `defaultTableHeight` 88 cm.

The tuning schema requires them, and the selection-mismatch fixture gained the five solver values so it still fails only with its own code.

**Placeholders added:** none.

**For the planning chat:**

- Deviations 2 and 3: friction is force-based, and no friction acts between wire and catheter in M1.
- The high-tier performance risk above.

**Checks** (output pasted in session 3):

- `npx vitest run`: 137 of 137 pass in 29 files.
- Golden values:
  - scene 1: 1.4300 mm, expected 1.4305
  - scene 2: 360.000°
  - scene 3: largest stretch 6.1e-13%
  - scene 5: 10.0000 mm
  - scene 6: hub force 0.1273, 0.1767 and 0.2278 N; at μ = 0 the tip advances 61.43 mm for a 60 mm hub advance
  - scene 7: largest lag 0.129°, 1.020° and 1.718°
  - scene 8: c-left at 0°, c-right at 180°
  - scene 9: 31.92° against 31.94° expected, and 60.00° after pull-back
  - scene 10 (scene 9 part): gap 6.9e-14 mm
- `npm run lint` (ESLint, including `no-magic-numbers` and the purity rules in `src/sim/`, and Prettier) and `npm run typecheck`: exit 0.
- `npm run validate-data`: OK.
- `src/sim/` imports nothing from outside `src/sim/`; ESLint enforces the purity and layering rules.

### 2026-10-05 · Phase C (session 4): worker, input, autopilot and replay

**Built**

- `src/input/mapping/`: radial dead zone and response curve with their inverse, `InputConfig` and settings, and `mapPad`, `mapKeyboard` and `mapPointer` to the prompt's tables.
  - All three mappers share one mapper state (mode and fine), so Y and C toggle the same mode.
  - `virtualPadToRaw` turns an autopilot's requested rates into raw stick deflections that `mapPad` maps back exactly. It lives here because it needs `Math.pow`, which is banned in `src/sim`.
- `src/sim/autopilot/`: the three closed-loop scripts.
  - sandbox-c-left follows D1, turns the short way, and backs off and turns again if the tip enters the right daughter.
  - sandbox-b-bend leads with the wire, locks the pair (R3), advances both, unlocks and pulls the wire back.
  - sandbox-a-buckle stalls on the tip's advance along the centerline, then pushes the extra length.
  - The engine gives scripts a read-only view: L, φ, tip position and velocity, tip tangent, the bend direction of a pre-shaped tip, the tip segment and the hub force.
- `src/worker/session.ts`: the session runner the worker and golden tests share (D6, D8).
  - Frames hold from their step to the next one, and their buttons act on the first step only.
  - Commands are logged and applied at their step. The starting tier is logged as a step-0 `set-tier` command, so a replay runs on the same tier on any machine.
  - Autopilot frames go through `mapPad` with the default settings. When a script finishes, the runner emits `autopilot-done` and logs a `stop-autopilot`.
  - A replay feeds a log's frames and commands, with the autopilot off.
- `src/input/log.ts` and `src/data/dataHash.ts`: changed-frame logging, a JSON round trip, and refusal of a log that is malformed or was made with different data (FNV-1a over `/data`, with line endings normalized).
- `src/worker/`:
  - `protocol.ts`, and `physics.worker.ts`, a thin shell around the session. It runs at most `maxStepsPerMessage` steps per message (`maxStepsPerMessageFast` with `?fast=1`), transfers snapshot buffers, and posts events and perf.
  - `benchmark.ts`, the D17 startup benchmark with an injected clock.
  - `timing.ts`, a pure wall-time-to-step clock with pause.
  - `client.ts`, which stamps each frame with the first step not yet requested (D19).
- `src/input/sources/`: the gamepad (glyph sets, non-standard notice), keyboard, pointer and replay sources, and the arbiter. The arbiter takes the largest request per axis, keeps every button and detects takeover. `inputLoop.ts` wires one animation frame and sends `stop-autopilot` on takeover. The UI mounts it in phase D.
- `src/input/rumble.ts`: the pure scheduler (patterns, contact buzz, strength, clamping, the update-rate cap) and the `dual-rumble` adapter.
- Tests: 173 in 37 files. These include unit tests 10, 12 and 15, and golden scenes 4, 10 (both parts), 11 and 12. There are also new tests for the sources, the arbiter, the timing, the benchmark and the session runner.

**Physics fixes found by the new scenes** (no tolerance or expected value changed except D30):

1. **Stall detection.** At the rounded cap the tip keeps sliding sideways at 1 to 40 mm/s, so its speed never stays below `stallSpeed`. The script instead counts a stall when the tip advances along the centerline less than `stallSpeed·stallTime` over a window of `stallTime`.
2. **Rotational inertia.** When the buckled wire snapped through, its floppy tip's segments spun up to about 1000 rad/s. At that rate one linearization per substep diverged: 356% stretch and a 450 N hub force. A new design value, `rotationalInertiaScale` = 1000, multiplies every segment's rotational inertia.
   - In the hard-push test, 300 still diverged and 500 held, so 1000 leaves a factor of two.
   - Static shapes are unchanged. The scale slows only short bending and twisting waves.
   - Measured effects: scene 1 moved from 1.4300 to 1.4325 mm, and scene 7's lag at μ = 0 from 0.13° to 1.27°, which stays strictly increasing with μ.
   - Linear damping, more contact passes and no friction did not help.
3. **The joint where a chain starts.** Each time a node crossed the sheath tip or the catheter tip, the clamp joint's stiffness doubled and its pivot jumped 2 mm. That kicked the catheter tip about 0.8 mm and stretched the junction segment by up to 1.5%.
   - The first two joints of a chain now share the bend at the clamp. The first segment's node sits `b` behind the clamp; the clamp joint has length (l − b)/2 and the next joint l − b/2. Stiffness and bend position are therefore continuous across a crossing. A node exactly at the clamp keeps D10's l/2, so scene 1 still sits on whole segments.
   - Bend rows are solved in the equivalent angle form (C = joint angle, compliance l̄/EI), so a joint of zero length is rigid rather than ill-conditioned.
   - Nodes carried inside a catheter now sit on the line the junction anchor uses, its tip segment's own axis.
   - Release spikes fell from 1.5% to 0.26%.
4. **Long pushes are now stable.** At 100 mm past the stall the hub force reaches 3.1 N with stretch at 0.05% and no solve failures.

**Deviations, and why**

1. **Script memory lives in the session runner and is not hashed.** D7 asked for an engine-owned, hashed memo. D8 replays run with the autopilot off, so a hashed memo would make every replay's hash differ from the live run, and scene 11 could never pass. The memo only shapes frames, and those are logged. It is cleared when a demo starts or the session resets.
2. **Autopilot speeds.** Scripts ask for rates (`advanceSpeed` and `rotateSpeed` from tuning/input, `pushSpeed` from the case), not raw deflections, and the runner inverts the response curve.
3. **The tier benchmark runs at depth.** At the starting pose the high tier looks cheap: 4 ms per frame, against 8 to 14 ms at depth. The benchmark therefore places the devices `benchmarkDepth` past the sheath tip. On this M2 it measures 8 to 14 ms for the high tier and picks the standard tier, which costs 0.7 to 2.6 ms per frame through the sandbox.

**Performance** (headless, this M2, physics per 16.7 ms frame):

| Tier | Starting pose | Deep (75 free nodes) |
| --- | --- | --- |
| High | 4.0 ms | 9.3 to 11 ms |
| Standard | 0.7 ms | 2.2 to 2.6 ms |

The demos finish in 36.9 s (c-left), 24.6 s (b-bend) and 16.2 s (buckle) of simulated time.

**Values added to or changed in `/data`:**

- Design values added (D4):
  - `input.json → autopilot.advanceSpeed` 10 mm/s and `autopilot.rotateSpeed` 90 deg/s
  - `render.json → targetFrameRate` 60 Hz (D17)
  - `physics.json → solver.rotationalInertiaScale` 1000
  - `physics.json → tiers[high].autoSelect.benchmarkDepth` 140 mm
  - The schemas require them, and the selection-mismatch fixture gained `rotationalInertiaScale`.
- Changed with the owner's approval (D30): `cases/sandbox.json → sandbox-a-buckle.extraPush`, from 20 to 50 mm, with a note.

**Placeholders added:** none.

**For the planning chat:**

- D30, and the Glidewire's floppy-tip placeholders (30 mm at 2%), which decide where the fold happens.
- The rotational inertia scale.
- The high tier is over budget at depth on this machine; standard is chosen.

**Checks** (output pasted in session 4):

- `npx vitest run`: 173 of 173 pass in 37 files.
- Golden values:
  - scene 4: worst excursion past the allowed surface 0.000, 0.000 and 0.010 mm, against a 0.05 mm limit
  - scene 10 (c-left part): largest wire offset 3.9e-5 mm, against 0.1008 mm
  - scene 11: identical hashes, `9e0d3d89` after 10 s; the replay matches; a frame changed by 1% gives a different hash
  - scene 12: hub 49.98 mm, tip −36.96 mm (the tip folds back), largest hub force 2.09 N, 2 danger events, largest stretch 0.26%
- Scenes 1 to 3 and 5 to 9 still pass: 1.4325 mm, 360.0°, 6e-13%, 10.0000 mm, hub forces 0.128 / 0.177 / 0.228 N, lags 1.27° / 1.68° / 2.12°, branch selection both ways, and 31.92° then 60.00°.
- `npm run lint`, `npm run typecheck`, `npm run validate-data` and `npm run build`: exit 0.

### 2026-10-06 · Phase D (session 5): rendering, UI and end-to-end tests

**Built**

- `src/render/`:
  - `renderer.ts`: `WebGPURenderer` on a canvas it owns, `await init()`, and the backend actually used, reported to the HUD and the perf overlay. `?webgl=1` forces WebGL 2.
  - `scenes/fluoro.ts`, `post/fluoroPost.ts` (TSL) and `scenes/carmCamera.ts`. The camera sits at the focal spot from `carm.ts`, with the zoom field at the SID as its field of view, and the post pass mirrors the image: in AP the left daughter shows on screen right.
    - Each object adds optical depth to a half-float target (multiplicative transmittance). A device's depth is the chord the ray cuts through the rod or tube wall, found from the surface normal, so a catheter shows two walls around a lighter lumen; the distal section takes the rod model's `radiopacity.tipBoost`.
    - The soft-tissue band is a faint cylinder around the phantom. The lumen shows only under the contrast puff (RT or E, with its fade) and always writes a vessel mask, which the roadmap outline (X or R) edge-detects live.
    - The frame pass runs once per pulse at the chosen pulse rate: transmission × the unattenuated gray, a 3×3 blur, quantum noise ∝ √T, vignette and collimator blades. The image holds between pulses and after fluoro stops (LIH); the monitor is black before the first pulse.
  - `devices/deviceMesh.ts` and `geometry/tube.ts`: tube meshes rebuilt each frame in place from the snapshot's nodes (parallel-transport frames, dome caps), from the sheath valve to the tip.
  - `scenes/anatomy3d.ts`: the lit translucent phantom, devices, the sheath and an orbit camera (Alt + mouse). It opens looking along the C-arm's beam from the detector side, so it starts oriented like the fluoro image.
  - `scenes/phantom.ts`: the phantom in millimetres, the D18 isocenter at the lumen's bounding-box center, and the band.
- `src/state/`: Zustand stores for settings (`irsim:settings`; invalid or missing fields fall back to defaults, and blocked storage is tolerated), the session (screen, launch choice, panels, view, roadmap, toasts) and the HUD, written at `hud.uiRefreshRate`.
- `src/ui/`:
  - start screen: title, disclaimer, Enter sandbox, Watch a demo with the three scripts, a controls reference with the detected glyphs and both mode maps, and Settings
  - sandbox setup: phantom, sheath size and wire, with the 5F catheter fixed. Each pairing runs the static rules; a block shows the rule's message and linked source and disables Start.
  - HUD: CATH/CONTROL, FINE and LOCK, the device stack from sheath to wire (depth past the sheath tip, rotation, "Tip in: …"), the resistance meter with amber and red marks, tip force and wall stress, the monitor's readouts (FLUORO/LIH, p/s, "LAO 25 CRA 10", SID, FOV, collimation, fluoro time), the DEMO badge and a hint bar
  - toasts: later-milestone features, blocked actions with message and source (debounced per rule), and demo completion
  - device picker: the inventory with each wire's compatibility with the catheter; picking another wire issues `swap-device`
  - device inspector: a tab per device, then sheath, phantom, and solver and feedback. Each value shows as written and in SI, with its confidence badge, linked source and note; placeholder rows are highlighted.
  - perf overlay, pause menu (resume, change phantom, settings, controls, quit), and controller navigation of panels and menus
- `src/app/`:
  - `sandboxRuntime.ts`: owns the renderer, both views, the physics client, input, rumble (`rumbleStep`/`playRumble` on the tip force and events), tones and toasts.
  - `appData.ts`: loads and validates `/data` once on the main thread.
  - `hudView.ts`: past-the-carina (D25), the puff fade and frame statistics.
  - `flags.ts`: `?fast=1` and `?webgl=1`.
  - The sandbox screen is loaded on demand, so the start screen does not pull in three.js.
- `src/audio/tones.ts` (D22): an alarm tone with the hub-force-danger rumble and a softer one on blocked actions, with a mute switch.
- `src/data/`: `renderConfig.ts` (display values converted once, device looks), `sandboxChoices.ts` (labels with brand next to generic name, static pairing checks, rule sources) and `inspector.ts` (the inspector's rows).
- `tests/e2e/`: end-to-end tests 1 to 4, a fake standard gamepad through `addInitScript`, `?fast=1`, and a console-error guard on every test. Two Playwright projects run every test: `webgpu` (SwiftShader's software Vulkan) and `webgl2` (forced).
- `scripts/bench.ts`: golden scene 8 at hub 0° and 180°, and the sandbox-c-left demo, on each rod tier, in physics ms per simulated second and per frame.
- CI: `ci.yml` installs Playwright's Chromium and runs `test:e2e` after the build, uploading traces on failure. `pages.yml` builds with `BASE_PATH=/<repo-name>/` and deploys `dist/` to GitHub Pages from `main`; the owner enables Pages once.
- Tests: 206 in 40 files, 33 more than phase C (`appLoop`, `viewData` and `uiState` cover the new pure code), plus 4 end-to-end tests on 2 backends.

**Deviations, and why**

1. **The renderer probes WebGPU.** three r186 always sends a texture-view `swizzle`, and Chromium 141 (installed in this container) throws a TypeError on it, which would blank the view. After `init()` the renderer draws one probe frame through a render target; if that throws, it rebuilds on WebGL 2 with a fresh canvas and reports WebGL 2.
   - The `webgpu` test project adds a test-only shim that drops the identity swizzle, so the WebGPU path is exercised here too. It changes nothing on newer Chromium.
   - That project also needs `--use-vulkan=swiftshader`; without it, SwiftShader's WebGPU device is lost after a few frames.
   - Each test asserts the backend the browser can actually offer: WebGL 2 when forced or when no adapter exists, otherwise WebGPU.
2. **Snapshot additions** (not hashed; every golden value is unchanged, scene 11 still hashes `9e0d3d89`):
   - `input`: the mode, fluoro and inject of the last step, so the HUD and monitor show what the simulation ran, demo or live.
   - `fluoroLastStep`: with `?fast=1` one message covers 2 s of simulated time, exactly one fluoro-tap period of the demo, so the last step alone always fell between taps. The monitor counts fluoro as on if any step since the last snapshot ran with it.
   - `anatomyId`: `set-anatomy` changes the phantom the views must draw.
3. **The loop keeps one input message in flight.** Frames that pass while the worker is busy merge into one: the newest axes, plus every button pressed. When the per-message cap binds, the clock slips, so the simulation runs in slow motion without racing to catch up afterwards. Input is dropped while paused.
   - Without this, a slow worker built an unbounded queue, and frames stamped ahead of the engine waited ever longer to apply.
4. **One input path for the UI too.** `createInputLoop` returns the frame it sends and the mapper state, and the UI acts on that frame's buttons (picker, inspector, pause, view, roadmap, toasts).
   - The keyboard source now latches a key pressed and released between two polls for one poll; a quick tap was being lost.
   - The pointer source ignores Alt, which belongs to the 3D orbit camera.
   - The D-pad and A move DOM focus in menus and panels; that never reaches the simulation.
5. **Setup's wire choice.** `sandboxConfig` takes `innerDevice`, an inventory rod model for the stack's inner slot, which starts where the case starts that slot. Spec 02 §13's log header has no field for it, so input logs do not record the choice yet; replays arrive with spec 14.
6. **Variant facts reach the rules.** A rod model's variant selection that is itself a fact now supplies its property to the rules as `geometry.<key>`, as `innerDiameter` already did (spec 02 §4.4). `limit-wire-length` therefore evaluates for the Bentson (145 cm) and Amplatz (180 cm) wires, whose lengths are placeholders, instead of returning unknown. The picker shows "Not checked" for any unknown result.
7. **Contrast in its own channel.** Where the phantom's tubes overlap at a junction, added contrast depth drew a dark star. Contrast now uses a separate channel with max blending, so it counts once.
8. **No N·s unit** in spec 02 §5, so the wall-stress bar's full scale is a time: `hud.wallStressFullScaleTime` at `hud.tipForceFullScale`.
9. **Smaller choices.**
   - The meters show the largest hub force, tip force and wall stress in the stack.
   - The picker does not offer catheter exchange, because `swap-device` swaps the inner device only.
   - Demo titles are UI copy; the descriptions come from the case.
   - The audio context starts on the first key press or click, as browsers require.
   - Tones are skipped until then and while muted.

**Values added to `/data`** (design, `data/tuning/render.json` only, per D4; each note says "Added in M1 phase D"; the schema requires them):

- `fluoro`:
  - `wireOpacity` 0.55
  - `catheterOpacity` 0.5
  - `softTissueBandOpacity` 0.22
  - `softTissueBandMargin` 15 mm
  - `collimatedGray` 0.06
  - `roadmapOutlineGray` 0.92
  - `roadmapOutlineWidth` 1.5 px
- `tubeRadialSegments` 12
- `threeD`:
  - `vesselColor` #c9736d
  - `sheathColor` #7d8a97
  - `backgroundColor` #0a0f14
  - `cameraFov` 40°
  - `cameraDistance` 1.6 bounding-box diagonals
  - `hemisphereLightIntensity` 1.6
  - `keyLightIntensity` 2.2
  - `surfaceRoughness` 0.45
- `hud`:
  - `toastDuration` 3.5 s
  - `blockedMessageDebounce` 2.5 s
  - `tipForceFullScale` 0.5 N
  - `wallStressFullScaleTime` 5 s
- `audio`:
  - `alarmToneFrequency` 880 Hz, `alarmToneDuration` 220 ms, `alarmToneGain` 0.12
  - `blockedToneFrequency` 330 Hz, `blockedToneDuration` 120 ms, `blockedToneGain` 0.06

The report now counts 818 sourced, 17 derived, 42 estimated, 66 placeholder and 156 design facts. Design went from 130 to 156 with these 26.

**Placeholders added:** none.

**Performance** (`npm run bench`, headless Node 24 in this Linux x64 container, not the M2; physics per 16.7 ms frame):

| Run | High tier | Standard tier |
| --- | --- | --- |
| Golden scene 8 (wire alone, hub 0° and 180°) | 6.9 and 7.0 ms | 1.8 and 1.8 ms |
| sandbox-c-left demo, wire and 5F catheter | 9.9 ms | 2.5 ms |

The startup benchmark picks the standard tier here, as on the M2. Browser frame rates in this container mean nothing, because it renders in software (SwiftShader). The gate's 60 fps and ≤4 ms test drive on the owner's laptop still has to be measured and recorded in the README.

**For the planning chat:**

- Setup's sheath and wire choices are not in the input log header (deviation 5): a header field for spec 14.
- Variant facts now reach the rules (deviation 6), extending the `innerDiameter` supply of spec 02 §11.1.
- Spec 02 §5 has no N·s unit (deviation 8).
- WebGPU in older Chromium with this three.js release (deviation 1).
- The high tier stays over budget at depth (issue #3).

**Checks** (output pasted in session 5):

- `npm run lint` (ESLint and Prettier) and `npm run typecheck`: exit 0.
- `npm run validate-data`: OK, with the counts above.
- `npm test`: 206 of 206 pass in 40 files. The golden values are unchanged from phase C:
  - scene 1: 1.4325 mm
  - scene 2: 359.987°
  - scene 3: 6.1e-13%
  - scene 4: 0.0000, 0.0000 and 0.0103 mm
  - scene 5: 10.0000 mm
  - scene 6: 0.1275, 0.1766 and 0.2276 N
  - scene 7: 1.270°, 1.684° and 2.120°
  - scene 8: c-left and c-right
  - scene 9: 31.92° then 60.00°
  - scene 10: 7.0e-13 mm and 3.9e-5 mm
  - scene 11: `9e0d3d89`
  - scene 12: hub 49.98 mm, tip −36.96 mm, 2.088 N, 2 danger events, 0.262%
- `npm run build`: exit 0 (validate, typecheck, Vite).
- `npm run test:e2e`: 8 of 8 pass, the 4 tests on both `webgpu` and `webgl2`; the demo takes 11 to 13 s with `?fast=1`.
- CI on the phase commit (19ed780): everything passed except end-to-end test 3 on both backends, which never saw the Y press. The Gamepad API is read once per animation frame. Software rendering gives about 215 ms per frame here and slower frames on the CI runner, so the test's fixed 250 ms press could fall between two reads.
  - The test now holds Y until the HUD shows CONTROL (one press edge, so one toggle) and prints the frame interval it measures. The follow-up commit carries the fix.
  - At the 60 fps the app targets, a press lasts several frames, so the app itself is unchanged.
- In the browser: all three demos ran with no console errors. A `BASE_PATH=/ir-angio-sim/` build served from that path loads with no failed requests. sandbox-a-buckle buckles the wire in the 3D view and turns the meter red at 1.22 N. Screenshots of the start screen, fluoro view and 3D view were checked against §6 and §7.

### 2026-10-06 · Gate (session 6)

The session moved from the owner's desktop to a cloud container mid-way (Linux x64, Node 24.21, Chromium 141 from `/opt/pw-browsers`). The desktop's uncommitted work, `tests/e2e/05-demos.spec.ts`, came along and is part of this gate.

**Checks before any change**

- `npm run lint`, `npm run typecheck`, `npm run validate-data` and `npm run build`: exit 0.
- `npm test`: 206 of 206 pass in 40 files.
- `npm run test:e2e`: 12 of 12 pass. That is end-to-end tests 1 to 4 plus the two other demos (`05-demos.spec.ts`: sandbox-b-bend and sandbox-a-buckle run start to finish), on `webgpu` and `webgl2`, with the console-error guard on every test.

**The independent review.** A subagent with fresh context reviewed the build against `prompts/M1-foundations.md` and `CLAUDE.md`. It found no blocking defect and listed these gaps; all are fixed except where noted.

1. **No friction between the wire and the catheter** (prompt §2, coaxial coupling). Known since phase B (deviation 3) and tracked in issue #5. Not fixed here: issue #5's two designs are a spec 04 choice for the owner. The inspector row now reads "Lumen friction coefficient (not applied in M1)", so it no longer suggests the sim uses the value.
2. **The inspector left out values the sim uses** (Done-when). A new "Case and demos" tab shows each starting device's depth and hub rotation, the target distance, the rule parameters, every demo parameter, and the autopilot's speeds and takeover threshold. The solver tab adds the mouse rates and the high tier's auto-select values. Device tabs add where each section and rest-shape region starts.
3. **A placeholder showed a design badge.** An assumed core material (the Bentson's and the Amplatz's "Stainless steel core assumed") now keeps the assumption's own confidence and note, so the row reads placeholder.
4. **Replays** (prompt §4). The worker now builds a replay from the log's own seed, case and phantom, checks the log against the current data hash (`checkLog`, shared with `parseLog`), and skips the tier benchmark for it. Still open: the setup's wire choice has no field in the input log (phase D deviation 5; spec 14). This is latent, because nothing sends a replay in M1.
5. **An end-to-end check for every screen flow** (rule 8, and the Done-when's "fires rumble"):
   - new `06-panels.spec.ts`: the inspector, the perf overlay, the pause menu (resume, change phantom, quit) and the picker's wire exchange (`swap-device`);
   - the buckle demo now runs with a fake pad whose actuator records each effect, and asserts `dual-rumble` effects with a strong part (hub-force-danger) and a weak part (contact).
6. **A unit assertion that could never fail** (unit test 10's dead zone). It now requires exactly 0 inside the dead zone and a nonzero output outside it, plus the radial case: a diagonal whose components each lie inside the dead zone still moves both axes.
7. **"Autopilot frames ignore user settings" on the real path.** A session test runs sandbox-c-left with the default settings and with skewed learner settings, and requires identical frames and hash.
8. **Feel values in code** (rule 3). The Settings sliders' ranges and steps moved to `tuning/input → settingsLimits`, and a saved setting outside its range falls back to the default. `PIXELS_PER_NOTCH` stays in code: it is the browser's pixel-to-notch convention, a unit conversion. The feel value is `mouse.wheelAdvancePerNotch`.
9. **Two UX bugs.**
   - While a panel is open, the D-pad, A and B (Tab, Enter and Backspace on the keyboard) move through it, but the same presses also changed the field of view, and in Control mode moved the table or saved an angle. The input loop now keeps panel-navigation actions, and the held D-pad's table height and collimation, out of the simulation's frame while a panel is open. The UI still reads the whole frame (`withoutPanelNavigation`).
   - A button press on the start screen did not count in the sandbox, which asked again. The start screen and the sandbox now share one flag in the gamepad source.
10. **README counts** are refreshed.

**Found while testing.** The new perf-overlay test pressed P twice within one frame of the ~10 fps software renderer, so no poll saw the key released between the presses. Input acts on press edges by design, as with the gamepad, and no learner double-taps that fast at 60 fps. The test now lets two frames pass between repeated presses of one key.

**Performance** (issue #3). A profile of the high tier in the sandbox-c-left demo splits the cost into three parts: the block Cholesky 26%, assembling J·W·Jᵀ 30%, and building the chains 25% (capsule tests 7%). The rest is small.

- Two changes keep every result bit for bit: the six demo runs (three demos on two tiers) hash exactly as before, and every golden value is unchanged.
  - The block solve skips the coupling blocks' structural zeros. Forward substitution keeps a column's leading zeros, so it finds them at run time and skips only exact-zero products.
  - The solve skips the external-force terms when no force acts, which is every run outside the cantilever scene.
- High tier: 3–5% faster in three alternated A/B runs of the demos, and 11–18% in `npm run bench`.
- It stays about twice its 4 ms budget, so issue #3 stays open. Its remaining options (hand-derived block formulas, unrolled kernels, WebAssembly) each change code across the hot path, not one kernel, because the cost is spread over all three parts.

**Values added to `/data`** (design, `data/tuning/input.json` only; each note says "Added at the M1 gate"): `settingsLimits.deadZone` 0–0.4, `deadZoneStep` 0.01, `responseExponent` 1–3, `responseExponentStep` 0.1 and `rumbleStrengthStep` 0.05. These are the values the sliders already used. The schema requires them. The report now counts 818 sourced, 17 derived, 42 estimated, 66 placeholder and 161 design facts.

**Placeholders added:** none.

**Checks after the fixes**

- `npm run lint` (ESLint and Prettier), `npm run typecheck`, `npm run validate-data` and `npm run build`: exit 0.
- `npm test`: 213 of 213 pass in 40 files, 7 more than before the gate. The golden values are unchanged from phase D:
  - scene 1: 1.4325 mm
  - scene 2: 359.987°
  - scene 3: 6.1e-13%
  - scene 4: 0.0000, 0.0000 and 0.0103 mm
  - scene 5: 10.0000 mm
  - scene 6: 0.1275, 0.1766 and 0.2276 N
  - scene 7: 1.270°, 1.684° and 2.120°
  - scene 8: c-left and c-right
  - scene 9: 31.92° then 60.00°
  - scene 10: 7.0e-13 mm and 3.9e-5 mm
  - scene 11: `9e0d3d89`
  - scene 12: hub 49.98 mm, tip −36.96 mm, 2.088 N, 2 danger events, 0.262%
- `npm run test:e2e`: 20 of 20 pass, the 10 tests on `webgpu` and `webgl2`. All three demos finish with no console errors, and sandbox-a-buckle turns the meter red and fires rumble.
- `npm run bench` (this container; physics ms per 16.7 ms frame):

| Run | High tier | Standard tier |
| --- | --- | --- |
| Golden scene 8, hub 0° and 180° | 5.2 and 5.8 ms | 1.4 and 1.4 ms |
| sandbox-c-left demo, wire and 5F catheter | 8.2 ms | 2.2 ms |

## M1 summary

**What M1 built.** A browser app, `npm ci && npm run dev`, with no backend:

- **The data layer.** Zod schemas for every schema id in spec 02; a validator with all 14 error codes, a report and a fixture per code; units converted once at load; device instances with per-segment properties and provenance on every value; rest shapes; and loaders for the phantoms and the sandbox case.
- **A pure, deterministic simulation** (`src/sim/`):
  - Cosserat rods solved directly with a block-tridiagonal Cholesky, with contact rows, implicit Coulomb friction and the sheath clamp (D29);
  - coaxial coupling as a composite rod;
  - the device stack and the order rule;
  - the compatibility engine;
  - C-arm kinematics;
  - three closed-loop autopilots;
  - hashing, snapshots and replays.
  ESLint enforces its purity, `no-magic-numbers` and the banned Math functions.
- **Input on one path.** Gamepad, keyboard, mouse, autopilot and replay all become one `InputFrame` through pure mappers, with rumble and sounds.
- **A physics worker** with step-stamped commands, input logs and the startup tier benchmark (D17).
- **Rendering.** WebGPU with a WebGL 2 fallback, a fluoro view with a TSL post pass (pulses, last-image hold, noise, blur, collimation, contrast puff, roadmap outline), and a 3D view.
- **The UI.** The start screen with the exact disclaimer, sandbox setup with blocked pairings, the HUD, the device picker and inspector, the perf overlay, the pause menu and settings.
- **Tooling.** CI with lint, data validation, tests, the build and end-to-end tests; a GitHub Pages deploy; and `npm run bench`.

**Tests.** 213 Vitest tests in 40 files: unit tests 1 to 15, golden physics scenes 1 to 12, and module tests. There are also 10 end-to-end tests, each run on WebGPU and on WebGL 2.

**Performance measured.** Headless physics in this container (table above): the standard tier costs 1.4–2.2 ms per frame, within the 4 ms budget, and the high tier 5–8 ms, over it. The startup benchmark therefore picks the standard tier here, as it did on the owner's M2.

**Still to measure on the owner's laptop** (D31, at the final stage): FPS and physics ms per frame in the perf overlay, in phantom C with the wire and the 5F catheter, plus the tier, backend, browser and machine, recorded in the README. Frame rates in this container mean nothing, because it renders in software.

**Placeholders added during M1:** none. The 66 placeholders all came with the seed data. `npm run validate-data` lists them, and issue #4 holds them for the medical review (D31).

**Data to check** (none is known to be wrong; each shapes how M1 behaves):

1. The sandbox's three wires have body moduli of 8 GPa (Glidewire, estimated), 9 GPa (Bentson, placeholder) and 9.5 GPa (Amplatz, sourced). These differ by under 20%, so the wires will feel alike apart from their tips. The Glidewire's note already says "tune with faculty".
2. The Glidewire's floppy tip (30 mm at 2% of the body stiffness, placeholders) decides where it folds at a cap. That is why the buckling demo needed 50 mm of extra push (D30).
3. `fr-device-in-device` (0.1, placeholder) is resolved but unused until wire-in-catheter friction exists (issue #5).
4. The sheath length (11 cm, placeholder) sets how far every device reaches. For example, a 400 mm device cannot reach phantom A's cap.
5. `solver.rotationalInertiaScale` (1000, design) keeps snap-through stable but slows short bending and twisting waves: scene 7's lag at μ = 0 went from 0.13° to 1.27°. It is worth a look in the wire-feel review.
6. Spec 02 and the seed data disagree in two places (phase A deviations 2 and 3): nine embolic items have no generic name, and twelve microcatheter ids contain dots.

**Left for M2**

- **The M2 specs and prompt.** Specs 03, 04, 07, 08 and 10, and an M2 build prompt, are written in the planning chat before any M2 build session. None exists yet.
- **Carried over from M1:**
  - wire-in-catheter friction (issue #5, spec 04);
  - high-tier performance (issue #3);
  - the rail fallback tier (spec 01 §9; its details belong to spec 04);
  - an input-log field for the setup's wire (spec 14);
  - the spec 02 versus data mismatches above;
  - the owner's test drive and the placeholder review (D31).
- **Open questions to measure in M2:** spec 01 §15's question 1, whether the solver holds the stiffest rail wires (up to 158 GPa, `harrison2011`) at 1 kHz.
