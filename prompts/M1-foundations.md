# M1 · Foundations: scaffold, data layer and the rod-in-a-tube sandbox

**How to run this milestone.** M1 is too big for one conversation. Run it as six Claude Code sessions (a plan, four build phases and a final gate) with the prompts in [`M1-sessions.md`](M1-sessions.md); each session reads this file for its section. If something breaks, paste the exact error back rather than rewriting this prompt.

---

## The prompt

Build milestone M1 of the IR Angio Suite Simulator: a browser app with the project scaffold, a validated data layer and a **device sandbox** where a real guidewire and a 5F catheter, modeled as Cosserat rods, are driven by a game controller (or keyboard and mouse) through three test phantoms and shown on a fluoroscopy-style view. It is an EDUCATIONAL simulation only, and the start screen must show the exact disclaimer from `spec/00-product-brief.md` §2.

The repository already contains `/data` (validated seed data), `/spec`, `CLAUDE.md`, `README.md`, `LICENSE` and `.gitignore`. Scaffold around them. Never delete or overwrite them, except to add the data this prompt asks for and to update the README sections named in §9.

### Stack

- Vite + TypeScript (`strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`) + React + Tailwind CSS + Zustand for UI. three.js `WebGPURenderer` from `three/webgpu` with `await renderer.init()` (automatic WebGL 2 fallback); custom shaders in TSL only. Zod for schemas. Web Audio for sound. Vitest for unit and golden tests, Playwright (Chromium) for end-to-end tests, ESLint + Prettier, `tsx` for scripts. Latest stable versions, pinned exactly.
- No backend. Must run with `npm install && npm run dev`.
- Physics runs in a module Web Worker (`new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' })`) behind a `SimEngine` interface (`load`, `step`, `snapshot`, `hash`). Snapshots are transferable `ArrayBuffer`s; do not require `SharedArrayBuffer`.
- Folders follow `spec/01-architecture.md` §2. Everything under `src/sim/` and `src/input/mapping/` is pure: no DOM, three.js, React or Web Audio. Ban `Math.random`, `Date.now`, `performance.now` and `crypto` there with ESLint `no-restricted-globals` and `no-restricted-properties`. Turn on `no-magic-numbers` for `src/sim/` (allow −1, 0, 0.5, 1, 2 and array indices) with an override that exempts `src/sim/math/` and `src/sim/core/` (polynomial, hash and PRNG constants, array strides).
- Every clinical, device or physical number comes from `/data`; every feel or solver number from `data/tuning/`. Data paths below are written as `file → key`, for example `tuning/physics → feedback.hubForceDanger`. If you need a value that is not there, add it to the right file as `placeholder` (claims about real devices) or `design` (engineering choices) with a note, and list it in your final summary.

### Scripts

`dev`, `build` (runs `validate-data`, then `tsc --noEmit`, then `vite build`), `preview`, `test` (Vitest), `test:e2e` (Playwright), `validate-data` (`tsx scripts/validate-data.ts`), `bench` (`tsx scripts/bench.ts`), `lint`, `format`.

### 1. Data layer (`src/data/`, `scripts/validate-data.ts`)

1. Zod schemas for every schema id in `spec/02-data-schemas.md` §2, written so the repository data passes unchanged: fact, quantity, text-fact and record-fact shapes (§4), selections (§4.4), tuning defaults (§4.5), rules with roles and aggregates (§8), anatomy graphs (§9.2), rod models (§11.1), case v0 (§12).
2. `units.ts`: the unit table in §5 with these factors: 1 Fr = 1/3 mm of diameter, 1 in = 0.0254 m, 1 psi = 6894.757293168 Pa, 1 atm = 101325 Pa, 1 mmHg = 133.322387415 Pa, 1 gf = 9.80665e-3 N, 1 GPa = 1e9 Pa. Export `toSI(quantity)` and `fromSI(value, unit)`; clinical-only units throw if converted.
3. `validate.ts` implementing every check in §14. Return structured errors `{code, path, message}` with these codes: `schema`, `confidence`, `quantity-shape`, `unknown-unit`, `missing-source`, `unknown-source`, `unopened-source`, `derived-note`, `estimated-note`, `orphan-quantity`, `duplicate-id`, `bad-reference`, `selection-mismatch`, `graph`. The CLI prints the errors, then a report (counts by confidence per file, the placeholder list, sources never cited) and exits 1 on any error.
4. `catalog.ts` builds **device instances** from rod models (`tuning/physics → rodModels`) and their device items. It applies the `variant` selections, converts to SI, and computes per-segment properties: outer and inner radius; Young's modulus from `youngsModulus`, or `youngsModulusRatio` times the item value at `bodyYoungsModulusFrom` (a ratio given as `{min, max}` is a linear ramp across the section); `I`, `EI`, `J = 2I`, `G = E / (2(1 + ν))` with ν from the material (`physics/materials → bulk`); mass per length from density; friction coefficients (`frictionId`, `lumenFrictionId`). It keeps provenance (confidence, source id, note) for every resolved value so the inspector can show it.
5. Rest shapes per `spec/02` §11.1: each `restShape` region turns the tip by exactly `bendAngle` toward material axis `d1` (or `d2` if `toward` says so). Share the angle equally among the joints whose midpoints fall inside `[fromTip, toTip]`; if none does, give it all to the nearest joint.
6. Loaders for the anatomy graphs in `data/anatomy/phantoms/` and the case `data/cases/sandbox.json`.

### 2. Simulation core (`src/sim/`)

**Math and core.** `vec3.ts` and `quat.ts` on plain numbers and Float64Array views; `detTrig.ts` with range-reduced polynomial `sin`, `cos` and `atan2` (error below 1e-12 against `Math`), used for every trigonometric need in `src/sim/`; `rng.ts`, a seeded PRNG (mulberry32 or xoshiro128\*\*); `hash.ts`, FNV-1a over typed-array bytes.

**Rod state and frame convention** (`rod/state.ts`; document it there and use it in every test). Per device: node positions (Float64Array, 3 per node), previous positions, velocities, inverse masses; per segment: quaternion (4 per segment), previous quaternion, angular velocity, inverse inertia, rest length, rest Darboux vector, bending and twist stiffness. Segment rest length is the tier's `segmentLength` (`tuning/physics → tiers`).
- Nodes run from the **handle end (index 0) to the tip (last index)**; segment `j` joins nodes `j` and `j+1`.
- Material frame `(d1, d2, d3)` is right-handed; `d3` points along the segment **toward the tip**.
- At hub rotation 0, `d1` is world +x projected perpendicular to the access direction. The phantoms run along +z, so there `d1 = +x`, `d2 = +y`, `d3 = +z`.
- A rest Darboux vector `Ω₀ = κ·d2` (κ = angle per unit length) turns the tip toward `d1`: `d3' = Ω₀ × d3 = κ·(d2 × d3) = κ·d1`. Worked example: in phantom C at hub rotation 0 the Glidewire's angled tip points toward +x, the left daughter; at 180° it points toward −x.

**Constraints (XPBD, small steps)**, following Kugelstadt and Schömer 2016 (`kugelstadt-2016`; the MIT PositionBasedDynamics library is the reference implementation):
- Stretch-shear per segment: `(x[j+1] − x[j]) / l − d3(q[j]) = 0` with zero compliance (inextensible, shear-stiff).
- Bend-twist per adjacent segment pair: discrete Darboux vector `Ω = 2·Im(conj(q[j])·q[j+1]) / l̄` against `Ω₀`, using the shortest-arc sign. Compliance is energy-consistent (`spec/01` §6): `α = 1 / (EI·l̄)` for the two bending components and `1 / (GJ·l̄)` for twist.
- Each step runs the tier's `substeps`, one iteration each: predict, solve constraints, project contacts with friction, update velocities, damp with `v *= 1 − c·h` (`solver.linearDamping`, `solver.angularDamping`). No gravity (`solver.gravity` = 0).

**Insertion and the sheath.** The words matter, so use them exactly:
- The **sheath valve** (entry point) sits at `access node − direction × sheath length`; the **sheath tip** is the access node. Sheath length is the selected `sheath-introducer` length (placeholder 11 cm).
- A device's **insertion depth L** is its length distal to the sheath valve; its **hub rotation φ** is the accumulated rotation input. Initial values come from the case: `L = sheath length + start.insertion[].tipBeyondAccess`, `φ = start.insertion[].hubRotation`.
- Nodes proximal to the sheath tip (inside the sheath or outside the patient) are **kinematic**: placed on the access axis at their arc distance from the valve, with segment orientations equal to the access frame rotated by φ about the access axis (built with `detTrig` each step, so no drift accumulates). Nodes distal to the sheath tip are dynamic. Nodes switch between kinematic and dynamic as L changes. The sheath tip therefore acts as a clamp, and the sheath itself is not part of the lumen.
- **Hub force** is the axial reaction at the first dynamic node (the constraint correction along the access direction, converted to force as `λ / h²`). **Tip normal force** sums the lumen contact forces on the `feedback.tipForceNodes` most distal nodes.

**Lumen contact** (`anatomy/lumen.ts`). Each segment's consecutive centerline points form capsules with linearly interpolated radius, indexed in a uniform grid with `solver.lumenGridCell`. For a node with device radius `r`, the allowed distance from a capsule axis is `max(0, R − r − solver.lumenContactMargin)`. A node is inside if it is within the allowed distance of any nearby capsule; otherwise project it to the nearest allowed surface. Friction at each correction, with `μ` from the device's `frictionId`:
- Translational: if the tangential displacement this substep is below `μ·d` (d = correction depth), cancel it (static); otherwise reduce it by `μ·d` (kinetic).
- Torsional: reduce the contacting segment's spin about its tangent this substep by up to `μ·d / r` (static below that), so twisting against the wall stores torque and releases it as whip.
- `tipSegment` is the segment whose capsule contains the tip most deeply (largest allowed distance minus actual distance).

**Coaxial coupling.** Inner and outer devices share the sheath valve, so match them by insertion coordinate: the wire node at distance `u` from the valve corresponds to the catheter centerline point at distance `u` while `u` is less than the catheter's L. Constrain `|x_wire − c(u)| ≤ (ID_cath − d_wire) / 2` (the catheter instance's inner diameter), splitting the correction between the wire node and the two catheter nodes by inverse mass, and apply axial and torsional friction with `lumenFrictionId`. A stiff wire then straightens a curved catheter, and pulling the wire back lets the curve re-form.

**Device stack** (`devices/stack.ts`). The sheath is fixed and not part of the movable stack. Movable devices are ordered outermost first, here (catheter, wire); the active pair is (outer, inner). D-pad up/down moves the active pair only when three or more movable devices exist, so it is disabled in M1. Lock (R3 or L) moves both devices of the pair as one. A device you are not driving keeps its L and φ, so it holds still relative to the patient; pushing only the outer device tracks it over a fixed inner device.

**Order rule.** Enforce `order-catheter-over-wire` (`rules/compatibility`): the catheter cannot advance past the wire tip. Show the rule's message (debounced) instead and emit `blocked-action`.

**Engine** (`engine.ts`): `load(config)` (anatomy graph or free space, device instances, stack, tier, seed, friction overrides for tests), `step(frame)` (one fixed step of `1 / stepRate`), `command(cmd)` (step-stamped; see §4), `snapshot()`, `hash()`, and a test-only `applyExternalForce(device, node, force)`. Per device per step track L, φ, tip segment, tip normal force, hub force and accumulated wall stress (time integral of tip normal force above `feedback.wallStressThreshold`). Emit events: `hub-force-warning`, `hub-force-danger` (thresholds in `feedback.*`), `tip-entered-segment`, `blocked-action` (with rule id), `autopilot-done`.

M1 has two tiers, high and standard (`tuning/physics → tiers`); the rail fallback arrives in M2. At startup run `autoSelect.benchmarkSteps` steps of phantom C on the high tier; if physics costs more than `autoSelect.maxPhysicsPerFrame` per 16.7 ms of simulated time, use the standard tier. Settings can override.

### 3. Compatibility engine (`src/sim/rules/`)

Evaluate the check types in `spec/02` §8 against device instances, mapping roles to kinds with the `roles` table and honoring `leftAgg`/`rightAgg`. Return `{status: "allow" | "block" | "degrade" | "unknown", ruleId, message, sourceTitle}`; a missing value gives `unknown`, never `allow`. `case.` paths read the case file; `tuning.` paths read `tuning/physics → ruleParameters`. Use the engine in sandbox setup (sheath size versus catheter) and in the device picker (wire versus catheter lumen, wire length).

### 4. Worker, commands and replay (`src/worker/`)

Protocol per `spec/01` §3. The main thread converts elapsed wall time to a target step and sends step-stamped input frames. The worker runs at most `solver.maxStepsPerMessage` steps per message (`solver.maxStepsPerMessageFast` when the page has `?fast=1`, used only by end-to-end tests), never skips steps, and posts a snapshot (positions in millimetres as a transferred Float32Array), events and perf (`physicsMs` per rendered frame, `stepsPerFrame`). Pause stops the target step.

Commands (`swap-device`, `set-anatomy`, `reset`, `set-tier`, `start-autopilot`, `stop-autopilot`) are step-stamped and applied by the engine at that step. The input log (`spec/02` §13) stores the seed, settings, changed frames and all commands, so a replay through a fresh engine reproduces the session exactly.

### 5. Input (`src/input/`)

**Pure mapping** (`mapping/`): `mapPad(raw, mode, settings) → InputFrame`, plus `mapKeyboard` and `mapPointer` producing the same `InputFrame`. Radial dead zone `sticks.deadZone`; response `sign(x)·|x|^n` with `sticks.responseExponent`; triggers become digital at `sticks.triggerThreshold`; device speeds from `devices.advanceSpeedMax` and `devices.rotationSpeedMax`, times `devices.fineScale` in fine mode; C-arm speeds capped by `imaging → gantry.rotationSpeedMax` and `gantry.angulationSpeedMax`; table, detector and collimation speeds from `control.*` (all in `tuning/input` unless named otherwise). Button actions fire on press edges only. Stick up means advance (the Gamepad API reports up as negative; invert it). Settings: dead zone, response exponent, invert Y per stick, mirror sticks, rumble strength (default `rumble.strengthDefault`), tier override; saved in `localStorage` under `irsim:settings` and recorded in input logs.

**Gamepad map (standard mapping indices).** Y (3) toggles Cath and Control mode in both modes. View (8) toggles the 3D view. Menu (9) pauses.

| Input | Cath mode | Control mode |
| --- | --- | --- |
| Left stick (axes 0, 1) | Outer device: up/down push and pull, left/right rotate | Up/down: cranial and caudal; left/right: detector height (source-to-image distance) |
| L3 (10) | Toggle fine mode | — |
| Right stick (axes 2, 3) | Inner device: up/down push and pull, left/right rotate | Table pan (x lateral, y longitudinal) |
| R3 (11) | Lock or unlock the pair | — |
| LT (6) | Fluoro (hold) | Rotate toward RAO, rate ∝ trigger |
| RT (7) | Contrast puff stand-in (hold; opacity ∝ trigger) | Rotate toward LAO, rate ∝ trigger |
| LB (4) | DSA: toast "Available in M2" | Fluoro while moving (hold) |
| RB (5) | Open the device picker | Cycle field of view through `imaging → gantry.zoomFields` |
| D-pad up/down (12, 13) | Active pair along the stack (disabled in M1) | Table height |
| D-pad left/right (14, 15) | Field of view wider / narrower | Collimation narrower / wider, within `control.collimationMin`–`collimationMax` |
| A (0) | Act: toast "Nothing to deploy in the sandbox" | Save the current angle (up to `control.savedViews`) |
| B (1) | Back / close panels | Back / close panels |
| X (2) | Roadmap outline stand-in (toggle) | Drugs and sedation: toast "Available in M3" |

Detect glyph sets from `gamepad.id` (Xbox, PlayStation, generic; 8BitDo in XInput mode reports as Xbox). If `gamepad.mapping !== "standard"`, show a notice and suggest the keyboard. Show "Press any button on your controller" until the first press, because Firefox exposes pads only after one.

**Keyboard and mouse (full parity).** Both modes: C switches mode, G toggles the 3D view, Esc pauses, I opens the device inspector, P toggles the perf overlay, Z/X change the field of view. Cath: W/S inner push and pull, A/D inner rotate, arrow keys outer device, Shift fine, L lock, Tab and Shift+Tab active pair, Space fluoro (hold), E contrast puff (hold), R roadmap outline, F DSA toast, B device picker, Enter act, Backspace back. Control: Q/E rotate RAO/LAO, W/S cranial/caudal, arrow keys table pan, Page Up/Page Down table height, [ and ] collimation, - and = detector height, Space fluoro, Enter save angle, D drugs toast. Mouse, Cath mode: left-drag drives the inner device (vertical push at `mouse.dragAdvancePerPixel`, horizontal rotate at `mouse.dragRotatePerPixel`), right-drag the outer device, wheel fine-advances the inner device (`mouse.wheelAdvancePerNotch`), middle click locks. Mouse, Control mode: left-drag rotates and angulates the C-arm (`mouse.dragCarmPerPixel`), right-drag pans the table (`mouse.dragTablePerPixel`), wheel changes the field of view.

**Sources and arbiter** (`sources/`): gamepad, keyboard, pointer and replay. The arbiter merges live sources into one frame per animation frame. During a demo, any live stick deflection above `autopilot.takeoverThreshold` or any button sends `stop-autopilot` and live control resumes.

**Autopilot** (`src/sim/autopilot/`). Each script is a pure function `(step, stateView, params) → virtual pad state`, run inside the worker every step and passed through the same `mapPad` with the **default** settings (dead zone and exponent from `tuning/input`, no inversion or mirroring), so it uses exactly the learner's input path and replays deterministically. Parameters come from `cases/sandbox → autopilot[].params`; scripts react to the state (closed loop), never to wall time.
1. `sandbox-c-left` (phantom C; the wire starts at hub rotation 180°): advance the wire until its tip is `wireStopBelowCarina` below the carina; rotate until the tip's bend direction is within `tipAlignTolerance` of +x; advance `wireAdvanceIntoBranch` into the left daughter; advance the catheter until its tip is `catheterPastCarina` past the carina; hold fluoro for `fluoroTapLength` every `fluoroTapEvery`; emit `autopilot-done`.
2. `sandbox-b-bend` (phantom B): advance the wire, then the catheter with the wire `wireLeadOverCatheter` ahead, until the catheter tip is `catheterPastBend` beyond the bend; pull the wire back until its tip is `wireWithdrawBehindCatheterTip` behind the catheter tip, so the catheter tip re-forms.
3. `sandbox-a-buckle` (phantom A, deliberately bad): advance the wire until the tip stalls at the cap (speed below `stallSpeed` for `stallTime`), then push `extraPush` more at `pushSpeed`. The wire buckles, the resistance meter goes red and rumble fires.

**Rumble** (`rumble.ts`): a pure scheduler maps tip normal force to the weak motor (`rumble.contactFullScaleForce`, `rumble.contactWeakMax`, scaled by the strength setting) and events to patterns (`rumble.events`, including `hub-force-danger`), never calling the actuator more than `rumble.updateRate` times per second. A thin adapter calls `gamepad.vibrationActuator?.playEffect("dual-rumble", …)` and does nothing when unsupported or disabled.

### 6. Rendering (`src/render/`)

- Boot the renderer and report the backend actually used (WebGPU or WebGL 2) in the HUD and perf overlay.
- **C-arm kinematics** (`src/sim/imaging/carm.ts`, pure, using `detTrig`). Rotation θ (positive = LAO) and angulation ψ (positive = cranial) are clamped to `imaging → gantry.rotation` and `gantry.angulation`; source-to-image distance stays within `gantry.sourceToImageDistance`; table height and travel within `table.*`. In the patient frame (LPS: x left, y posterior, z superior), the detector direction from the isocenter is `(sin θ·cos ψ, −cos θ·cos ψ, sin ψ)`, and the focal spot sits at `isocenter − direction × gantry.focalSpotToIsocenter`. Render a perspective projection **from the focal spot toward the detector** (so objects nearer the source magnify, as on a real system), with the field of view set by the selected zoom field at the source-to-image distance, then **mirror the image horizontally** so it reads as if viewed from the detector side: in AP, patient left appears on screen right. Phantoms start with their inlet at the table origin and the isocenter at the phantom's centroid.
- **Fluoro view** (default): devices render as attenuating tubes (wire darker, tip boosted by `radiopacity`), phantoms as a faint soft-tissue band whose lumen is invisible unless the contrast puff (RT, `render.fluoro.contrastPuffMaxOpacity` and `contrastPuffFade`) or the roadmap outline (X, `roadmapOutlineOpacity`) is on. A TSL post pass adds the gray background, pulsed frames at the chosen pulse rate (default `render.fluoro.defaultPulseRate`; options `imaging → rates.fluoroPulseRates`), noise, blur, vignette and collimation, and holds the last image when fluoro is released. The HUD shows FLUORO or LIH, pulse rate, angles in the form "LAO 25 CRA 10", source-to-image distance, field of view and cumulative fluoro time.
- **3D view** (View or G): translucent phantom (`render.threeD.vesselOpacity`), devices as tube meshes rebuilt each frame from snapshot nodes, orbit camera.

### 7. UI (`src/ui/`, `src/app/`)

- **Start screen:** title, the exact disclaimer, "Enter sandbox", "Watch a demo" (choose one of the three scripts), a controls reference showing the detected controller's glyphs and both mode maps, and Settings. Sleek, modern, game-like and uncluttered (spec 00 §9).
- **Sandbox setup:** phantom (A, B or C), sheath size (4, 5 or 6F), wire (inventory rod models). Invalid combinations are blocked with the rule's message and source: a 4F sheath with the 5F catheter shows the `fit-catheter-sheath` message and "Radiology Key", and Start stays disabled.
- **HUD:** mode badge (CATH or CONTROL), fine and lock indicators; a device stack panel from sheath to wire with insertion depth past the sheath tip (mm), hub rotation and "Tip in: …" (segment `tags.name`); a resistance meter for hub force with the amber and red thresholds; a tip force bar and the wall-stress accumulator; the imaging readouts from §6; a DEMO badge while the autopilot drives; toasts for features that arrive later.
- **Device picker** (RB on the controller, B on the keyboard): inventory rod models with their compatibility status; blocked entries are greyed out with the reason. Picking a new wire while one is inserted issues a `swap-device` command: the engine withdraws the current wire to the sheath valve at `devices.advanceSpeedMax`, then feeds the new one to the catheter tip. One press, physically animated, logged for replay.
- **Device inspector** (I): every resolved parameter of each active device, in clinical and SI units, with a confidence badge, the source title (linking to its URL) and the note. Placeholders stand out.
- **Perf overlay** (P): FPS, frame ms, physics ms per frame, steps per frame, tier, backend.
- **Pause menu** (Menu or Esc): resume, change phantom, settings, quit to start.

### 8. Tests

**Golden scene conventions.** All golden scenes run headless on the high tier (2 mm segments, 1 kHz, 2 substeps) unless stated. Fixtures are test data:
- **Wire W:** uniform straight rod, d = 0.035 in, E = 9.5 GPa (`gw-amplatz-bard`, sourced), ν = 0.3, density 7900 kg/m³, length 400 mm.
- **Catheter K:** uniform tube, OD 5F, ID 0.039 in, E = 1.0 GPa, ν = 0.4, density 1200 kg/m³, length 400 mm, straight except a 60° bend toward `d1` spread over the distal 15 mm.
- **Free space:** an anatomy with no segments (lumen off) and one access at the origin pointing +z; the sheath still holds the proximal part of each device.
- **Measurements:** *tip advance* is the change in the tip's arc coordinate along its segment's centerline; *bend angle* is the angle between the tangent of the segment just proximal to the curved region and the most distal segment; *tip rotation* is the unwrapped angle of the tip segment's `d1` about the local centerline tangent, relative to its start; *lag* is φ minus tip rotation; *past the carina* is the tip's arc distance along the daughter's centerline beyond the junction node; *settled* means total kinetic energy below `solver.settleKineticEnergy` for `solver.settleSteps` consecutive steps. Containment checks run after each full step.

Unit tests (Vitest, `tests/unit/`):
1. Units: every factor in `spec/02` §5; round trips within 1e-12 relative; clinical-only units throw.
2. Quantity resolution: value, options with a selection, ranges with a selection, single-bound ranges; out-of-options and out-of-range selections fail.
3. Data validation: repository data passes; each fixture in `tests/fixtures/data-invalid/` fails with its expected code (one fixture per code in §1.3).
4. Compatibility: the 5F catheter with a 4F sheath → block `fit-catheter-sheath`; with a 5F sheath → allow; a 0.035 in wire through a 21G needle → block `fit-needle-wire`; a 0.018 in wire through a 21G needle → allow; a 0.035 in wire into the Berenstein 5F → allow (`rightAgg: max` over 0.035 and 0.038 in); `limit-wire-length` for the Glidewire 150 cm → allow (65 + 30 + 15 = 110 cm); a rule whose value is missing → unknown.
5. PRNG: identical sequences for identical seeds, different sequences for different seeds.
6. `detTrig`: sin, cos and atan2 within 1e-12 of `Math` on a dense grid over [−4π, 4π].
7. Quaternions: normalize, multiply, rotate; the axis-angle quaternion built with `detTrig` matches one built with `Math` within 1e-12.
8. Stiffness and catalog: a 0.035 in wire at 9.5 GPa gives EI = 2.9127e-4 N·m² (±0.1%); a 5F tube with ID 0.039 in at 1.0 GPa gives EI = 3.3149e-4 N·m² (±0.1%); `rm-glidewire-035-angled-150` resolves a body EI of 2.4528e-4 N·m² (8 GPa, confidence `estimated`) and a tip section at 2% of it (confidence `placeholder`).
9. Rest shapes: per-joint angles of a region sum exactly to `bendAngle` for 2 mm and 4 mm segments, including the Glidewire's 3 mm region, which is shorter than one standard segment.
10. Input mapping: dead zone and curve are monotonic and sign-preserving; Y toggles mode on the press edge only; L3 toggles fine; R3 toggles lock; keyboard and mouse produce the same intents as the sticks; Control mode routes LT/RT to C-arm rotation; mirror swaps the sticks; autopilot frames ignore user settings.
11. Device stack: the active pair cannot move with two movable devices and can with three (synthetic stack); lock moves both devices; an undriven device keeps its L and φ.
12. Rumble scheduler: magnitudes clamp to [0, 1]; never more than `updateRate` calls per second; no calls when disabled or unsupported; each event produces its pattern.
13. C-arm: angles clamp to the sourced limits; rotation and angulation speeds never exceed 25°/s; LAO 90 gives detector direction (1, 0, 0); CRA 30 at LAO 0 gives (0, −cos 30°, sin 30°); in AP after the display mirror, a point at patient left (+x) lands on the right half of the image.
14. Lumen queries on phantom C for a 0.035 in device with the 0.02 mm margin (allowed distance 3.5355 mm in the parent, 2.0355 mm in the daughters): (3, 0, 150) inside the parent only; (3, 0, 152) inside the left daughter only; (0, 0, 154) inside both daughters; (5, 0, 150) and (0, 0, 160) outside every capsule.
15. Replay records: an input log with frames and commands round-trips through JSON unchanged, and a log whose `dataHash` differs from the current data is refused.

Golden physics scenes (Vitest, headless, `tests/golden/`):
1. **Cantilever.** Free space; wire W with 50 mm beyond the sheath tip (the clamp); tip load 0.01 N along +x on the most distal node via `applyExternalForce`. When settled, the tip deflection equals F·L³/(3·EI) = 1.43 mm within 5%.
2. **Twist transmission.** Wire W in phantom A with μ = 0, tip 150 mm past the sheath tip: turn the hub 360° at 180°/s; when settled, tip rotation is 360° ± 5°.
3. **Inextensibility.** Wire W in phantom B, tip 20 mm before the bend: for 2 s alternate full-speed push and pull every 0.25 s while rotating at full speed, reversing every 0.5 s. Segment length error stays below 0.5% at every step; no NaN.
4. **Lumen containment.** In all three autopilot scripts, every dynamic node stays within the allowed distance plus 0.05 mm of some capsule axis.
5. **Push transmission (sanity).** Wire W in phantom A with μ = 0.2, tip 50 mm past the sheath tip: advance 10 mm at 5 mm/s; the tip advances 10 ± 0.3 mm (no wall contact is expected; this checks insertion and inextensibility).
6. **Friction raises push force.** Wire W in phantom B, tip 10 mm before the bend: advance 60 mm at 10 mm/s with μ = 0, 0.1 and 0.2. The mean hub force over the last 20 mm strictly increases with μ; at μ = 0 the tip advance is within 2 mm of the hub advance.
7. **Torque lag.** Wire W in phantom B with its tip 40 mm beyond the end of the bend: rotate the hub at 180°/s for 2 s with μ = 0, 0.1 and 0.2. The largest lag strictly increases with μ.
8. **Branch selection.** Phantom C with `rm-glidewire-035-angled-150` alone, tip 60 mm below the carina: at hub rotation 0, advancing 80 mm at 10 mm/s puts the tip in `c-left`; at hub rotation 180°, in `c-right`.
9. **Coaxial bending.** Free space; catheter K with 100 mm beyond the sheath tip; wire W inside with its tip 10 mm beyond the catheter tip. When settled, the catheter's bend angle equals 60°·EIc/(EIc + EIw) = 31.9° within 15%. Pull the wire back until its tip is 50 mm proximal to the curve: when settled, the bend is at least 57°.
10. **Coaxial containment.** In scene 9 and in `sandbox-c-left`, every wire node inside the catheter stays within (ID − d)/2 + 0.05 mm of the catheter centerline.
11. **Determinism and replay.** Run `sandbox-c-left` for 10 simulated seconds twice: identical `hash()`. Change one input frame: a different hash. Record the input log (frames and commands) and replay it through a fresh engine: identical hash.
12. **Buckling (bad action).** `sandbox-a-buckle`: from the stall, the hub advances 20 mm while the tip moves less than 2 mm, so at least 18 mm is stored as buckling; the hub force exceeds `feedback.hubForceDanger`; a `hub-force-danger` event is emitted; inextensibility still holds.

End-to-end tests (Playwright, Chromium, `tests/e2e/`). If WebGL is unavailable in headless CI, launch Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader`. Load the app with `?fast=1`.
1. The start screen shows the exact disclaimer; no console errors on load.
2. "Watch a demo" → `sandbox-c-left` finishes within 180 s: the HUD shows "Tip in: left daughter" for the wire and the catheter at least 20 mm past the carina; the renderer backend is reported; no console errors.
3. A fake gamepad injected with `page.addInitScript` (overriding `navigator.getGamepads`): holding the right stick up increases the wire's insertion depth in the HUD; pressing Y shows CONTROL; holding RT changes the LAO readout.
4. Sandbox setup with a 4F sheath and the 5F catheter shows the `fit-catheter-sheath` message and does not start.

Also add `scripts/bench.ts` (runs golden scene 8 headless and prints physics milliseconds per simulated second for each tier) and two GitHub Actions workflows: `ci.yml` (install, lint, validate-data, test, build, then Playwright with browsers installed) and `pages.yml` (on `main`, build with `BASE_PATH=/<repo-name>/` and deploy `dist/` to GitHub Pages; the owner enables Pages once in the repository settings).

### 9. README

Update the README sections "Build status", "Run it" and "Tests" with the real commands, the test count, and the perf overlay numbers measured in phantom C with the wire and catheter (FPS, physics ms per frame, tier, backend, machine). Refresh the confidence counts table from the `validate-data` report.

### Done when

- `npm run build`, `npm run lint`, `npm test`, `npm run validate-data` and `npm run test:e2e` all pass.
- All three autopilot scripts run start to finish with no console errors; `sandbox-a-buckle` visibly buckles the wire in the 3D view, turns the resistance meter red and fires rumble when a controller is connected.
- In phantom C with the wire and the 5F catheter, the perf overlay shows at least 60 fps and at most 4 ms of physics per frame on the developer's laptop, and the README records the numbers.
- ESLint `no-magic-numbers` passes in `src/sim/` (with only the `math/` and `core/` override), and every value the sim uses appears in the device inspector with its confidence badge.
- The final summary lists every placeholder added during M1 and any data you found wrong.

### How you know you are done (for the human)

1. `npm install && npm run dev`, open the link, read the disclaimer.
2. Watch the `sandbox-c-left` demo: the wire turns toward the left branch, enters it, and the catheter follows.
3. Take the controller: push the right stick to feed the wire, twist it, and feel the rumble when the tip presses the wall; press Y and swing the C-arm with the triggers.
4. Run the bad demo and watch the wire buckle against the cap.
5. Open the inspector (I) and see which numbers are sourced and which are still placeholders.
