# 01 · Architecture and stack

Status: drafted 2026-10-04. Depends on 00 (scope) and 02 (data). Every later spec builds on the module boundaries, threading model and determinism rules here.

## 1. Stack

Use the latest stable release of each at scaffold time and pin exact versions in `package.json`.

| Layer | Choice | Why |
| --- | --- | --- |
| Build | Vite, npm, Node.js LTS | Fast dev server, native workers and JSON imports |
| Language | TypeScript, `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch` | Simulation code is numeric and index-heavy |
| UI | React, Tailwind CSS, Zustand | HUD, menus, picker, inspector and debrief are many small panels; React renders them, never the canvas |
| Rendering | three.js `WebGPURenderer` imported from `three/webgpu`, `await renderer.init()`; it falls back to WebGL 2 automatically (`ics-three-webgpu`). Custom shaders in TSL so one shader runs on both backends | WebGPU ships in Chrome, Edge, Firefox 141+ and Safari 26 (`webdev-webgpu`); WebGL 2 covers the rest |
| Physics | TypeScript in a module Web Worker on typed arrays, behind a `SimEngine` interface so a Rust or C++ WebAssembly engine can replace it later | Keeps the main thread free; one language until profiling says otherwise |
| Schemas | Zod | One schema for validation, types and the `validate-data` CLI |
| Audio | Web Audio API | Monitor tones, alarms, injector |
| Input | Gamepad API (polled each frame, `mdn-gamepad`), keyboard and pointer events; rumble through `vibrationActuator.playEffect("dual-rumble")` where supported (`mdn-haptic`) | Standard mapping covers Xbox, DualSense and 8BitDo |
| Tests | Vitest (unit and golden physics scenes), Playwright (end-to-end, Chromium) | Pure functions and deterministic replays make both cheap |
| Quality | ESLint (typescript-eslint, react-hooks, `no-magic-numbers` in `src/sim/`), Prettier | Golden rules 3 and 4 enforced by tooling |
| Scripts | `tsx` for TypeScript scripts (`validate-data`, `bench`) | No separate build for tooling |
| Hosting | Static files (GitHub Pages or similar), no backend | Decision 7.11 |

Cross-origin isolation (COOP and COEP headers) is required for `SharedArrayBuffer` (`mdn-sab`), and GitHub Pages cannot set those headers. The design therefore never requires shared memory: snapshots move as transferable `ArrayBuffer`s, and a shared-memory fast path may be added later behind feature detection.

## 2. Module map

```
src/
  app/          main.tsx, App.tsx, screens (start, sandbox; later case, debrief), boot sequence
  ui/           React components: HUD, DeviceStackPanel, ResistanceMeter, DevicePicker,
                DeviceInspector, ControlsOverlay, PauseMenu, PerfOverlay, StartScreen, Toasts
  state/        Zustand stores for UI state (settings, session, latest HUD view of the snapshot)
  data/         Zod schemas, loaders, units.ts (clinical <-> SI), catalog.ts (typed, SI-converted
                device instances), validate.ts (shared by the CLI and tests)
  sim/          PURE, deterministic simulation; no DOM, three.js, React or Web Audio
    core/       rng.ts (seeded PRNG), clock.ts (step counter), hash.ts (FNV-1a), events.ts, types.ts
    math/       vec3.ts, quat.ts, detTrig.ts (polynomial sin, cos, atan2)
    anatomy/    graph.ts (anatomy graph), lumen.ts (capsule-union queries, spatial grid)
    devices/    instance.ts (item + rod model -> device instance), stack.ts (ordering, active pair, lock)
    rod/        state.ts (typed arrays), build.ts, constraints.ts (stretch-shear, bend-twist),
                insertion.ts (hub feed), contact.ts (lumen, friction), coaxial.ts
    rules/      compatibility.ts (check evaluator), reasons.ts
    imaging/    carm.ts (gantry and table kinematics, view matrices as plain numbers)
    engine.ts   SimEngine: load, step, snapshot, hash
    snapshot.ts packs state into transferable Float32 buffers (millimetres for rendering)
    autopilot/  closed-loop scripts run inside the worker: (step, state) -> virtual pad -> mapPad
  input/
    mapping/    PURE: mapPad.ts, mapKeyboard.ts, mapPointer.ts, curves.ts -> ControlIntent
    sources/    gamepad.ts, keyboard.ts, pointer.ts, replay.ts, arbiter.ts (merges live sources; detects autopilot takeover)
    rumble.ts   pure scheduler plus a thin actuator adapter
  worker/       physics.worker.ts (fixed-step loop), protocol.ts (message types)
  render/       renderer.ts (backend init and fallback), scenes/fluoro.ts, scenes/anatomy3d.ts,
                devices/deviceMesh.ts (tube geometry from rod nodes), post/fluoroPost.ts (TSL)
  audio/        tones.ts
scripts/        validate-data.ts, bench.ts
tests/
  unit/         *.test.ts
  golden/       *.golden.test.ts (physics scenes, headless)
  e2e/          *.spec.ts (Playwright)
  fixtures/     invalid data files for validator tests
```

Dependency direction: `app → ui, state, render, input, worker-client → data, sim`. `sim` depends only on itself and on plain data passed in at `load`. `input/mapping` is pure and shared by every input source.

## 3. Threads and the loop

```
Main thread                                         Physics worker
-----------                                         --------------
requestAnimationFrame:
  poll gamepad, read key and pointer state
  arbiter merges live sources (replay replaces them)
  mapper -> InputFrame stamped with targetStep  -->  queue by step index
  live input during a demo -> command(stop-autopilot)  autopilot (if running) makes each step's frame
                                                     run fixed steps up to targetStep
                                                     (at most solver.maxStepsPerMessage per message;
                                                      beyond that slow motion, never skipping)
  <-- snapshot (transferable buffers), events, perf --
  render latest snapshot (fluoro or 3D)
  HUD store updated at 15 Hz (data/tuning/render.json)
  rumble scheduler, audio
```

- **Fixed step.** `dt = 1 / stepRate` (1 kHz on the high tier, 500 Hz standard; `data/tuning/physics.json`). Each step runs the configured substeps.
- **Input timing.** Inputs are sampled once per animation frame (the Gamepad API must be polled) and held constant until the next frame (zero-order hold). Rate control makes this smooth; interpolation would need future input and break replays.
- **Target step.** The main thread converts elapsed wall time into a target step. Wall time never enters the simulation; it only decides how far to advance. Pausing stops the target.
- **Protocol** (`src/worker/protocol.ts`): main → worker `init(config)`, `input(frames[])`, `command(cmd)` (step-stamped `swap-device`, `set-anatomy`, `reset`, `set-tier`, `start-autopilot`, `stop-autopilot`; spec 02 §13), `pause`, `resume`; worker → main `snapshot(step, buffers)`, `events(list)`, `perf(physicsMsPerFrame, stepsPerFrame)`.
- **Snapshots** carry node positions (Float32, millimetres), segment frames for the rendered tips, per-device scalars (inserted length, hub rotation, tip segment id, tip normal force, hub force) and global scalars. Buffers are transferred, not copied.

## 4. Determinism

1. Fixed step, fixed substeps, fixed iteration counts; no adaptive time stepping.
2. Seeded PRNG (`src/sim/core/rng.ts`, a small counter-based generator such as mulberry32 or xoshiro128\*\*) with an explicit seed per session and per case. No other randomness in `src/sim/`.
3. Every input is an `InputFrame` with a step index (spec 02 §13). The input log of a session holds the seed, the settings, the frames that changed and every command; replaying it through `SimEngine` reproduces the session exactly.
4. Step code uses only `+ − × ÷`, `sqrt`, `abs`, `min`, `max`, `floor`, which IEEE 754 makes identical across engines. Trigonometry uses the polynomial `detTrig.ts`; for example the hub orientation is rebuilt each step from the accumulated rotation angle with `detTrig`, so no rounding drift accumulates.
5. Iteration order is fixed (devices by stack order, nodes by index, contacts by node index). No `Map` iteration over insertion-order-dependent keys inside a step.
6. `SimEngine.hash()` returns FNV-1a over the raw bytes of positions, orientations, velocities and key scalars. Golden tests compare hashes.
7. The autopilot runs inside the worker as a pure function of step and state and always maps through the default input settings, so demos and replays never depend on a learner's settings. Device swaps and other commands are step-stamped and logged with the frames.

Determinism is guaranteed within one JavaScript engine (all tests run in Node's V8). Cross-browser replays are expected to match because of rule 4, but only same-engine equality is tested.

## 5. Units

- `/data` stores clinical units with unit tags (spec 02 §5). `src/data/units.ts` converts to SI once, at load.
- The simulation runs in SI: metres, kilograms, seconds, newtons, pascals, radians. Internal arrays are Float64.
- Snapshots convert positions to millimetres (Float32) for rendering; the render scene uses 1 unit = 1 mm, as in the cath lab spec.
- The UI converts SI back to clinical units for display, showing US conventions with metric alongside (1.11): wires in inches, catheters in French, pressures in mmHg and atm, lengths in cm and mm.

## 6. Physics overview

Details belong to spec 04 (devices), 07 (flow, contrast, embolics) and 06 (access); milestone M1 implements the device core.

- **Devices are Cosserat rods**: node positions plus one quaternion per segment, so bending, twist, torque windup and whip are physical. Constraints follow the position-and-orientation formulation of Kugelstadt and Schömer (`kugelstadt-2016`): a stretch-shear constraint per segment and a bend-twist constraint (discrete Darboux vector against a rest Darboux vector that encodes tip shapes and catheter curves) per segment pair. The MIT-licensed PositionBasedDynamics library (`pbd-library`) is the reference implementation.
- **XPBD with small steps.** Compliance is energy-consistent (bending compliance 1 / (EI·l), twist 1 / (GJ·l)); one iteration per substep with several substeps (`macklin-small-steps-2019`). If very stiff rail wires (up to 158 GPa effective modulus, `harrison2011`) converge too slowly, the upgrade paths are a direct solver for stiff rods (`deul-stiff-rods-2018`) or Stable Cosserat Rods (`hsu-stable-cosserat-2025`, 4 iterations where XPBD needs over 1,000).
- **Insertion** is a moving boundary: nodes proximal to the sheath tip (inside the sheath or outside the patient) are kinematic on the access axis, so the sheath tip acts as a clamp; nodes distal to it are dynamic. Push and rotation inputs change each device's insertion depth and hub rotation.
- **Lumen contact.** Vessels are a union of capsules from the anatomy graph; a node must stay within lumen radius minus device radius of at least one capsule. Violations project back with Coulomb friction (static and kinetic) proportional to the normal correction, both translational and torsional, so twisting against the wall winds up torque.
- **Coaxial stack.** An inner device is matched to its outer device by insertion coordinate (both feed from the same hub), constrained within the radial clearance, with axial friction. The stiffer member dominates the shared curvature, which is how a wire straightens a catheter curve and how pulling it back lets the curve re-form.
- **Flow** (spec 07): a 1D network with Poiseuille segment resistances and lumped (Windkessel) outlet beds, a cardiac waveform, contrast advection and junction mixing, extravasation compartments. It runs in well under a millisecond per step on the worker.
- **X-ray** (spec 08): the image integrates attenuation along each ray (Beer–Lambert) over iodine in vessels, devices and anatomy; DSA is a log subtraction of a mask; noise scales with dose per pulse. gVirtualXRay (`gvxr`) is the reference for GPU projection.
- **Validation path.** VCSim3 (`vcsim3`) reached haptic rates with Cosserat rods and 1.34 ± 0.95 mm tip error against real wires, and a GPU version ran 13.5× faster (`korzeniowski-gpu-rods`), so a WebGPU compute path is a later option, not a requirement. SOFA BeamAdapter (`sofa-beamadapter`, LGPL) is a reference for validation only.

## 7. Rendering pipeline

1. `renderer.ts` creates `WebGPURenderer`, awaits `init()`, reports the backend actually used (WebGPU or WebGL 2) to the HUD and the perf overlay.
2. **Fluoro scene** (default view): a perspective projection from the X-ray focal spot toward the detector (angles, source-to-image distance, focal-spot-to-isocenter distance and field of view from `src/sim/imaging/carm.ts`), so objects nearer the source magnify as they do on a real system; the image is mirrored for display so it reads as if viewed from the detector side. Objects render their attenuation into a float target; a TSL post pass converts transmission to display gray, adds pulsed-frame timing, noise, blur, collimation and vignette, and holds the last image when fluoro stops. M1 uses multiplicative transmittance per object; spec 08 replaces it with ray-integrated iodine and anatomy.
3. **3D anatomy view** (toggle): lit translucent vessels, devices as tube meshes rebuilt each frame from rod nodes, orbit camera.
4. Display conventions: frontal images are viewed as if facing the patient, so patient left is on the viewer's right; angle readouts follow LAO/RAO and cranial/caudal naming.

## 8. Data flow

`/data/*.json` → `npm run validate-data` (also runs before `build` and in CI) → imported by Vite → `src/data/catalog.ts` resolves device instances (item plus rod model), converts to SI and attaches provenance for the inspector → `SimEngine.load(config)`. Cases are imported on demand (dynamic import), so first load stays small.

## 9. Hardware tiers

| Tier | Renderer | Device model | Step rate | Segment length |
| --- | --- | --- | --- | --- |
| High | WebGPU | Rods | 1,000 Hz | 2 mm |
| Standard | WebGPU or WebGL 2 | Rods | 500 Hz | 4 mm |
| Fallback (from M2) | WebGL 2 | Rail model: devices slide by arc length along centerlines and pick branches by tip angle, same controls and cases | 250 Hz | 5 mm |

A short startup benchmark picks the tier; Settings can override it. Values live in `data/tuning/physics.json`.

## 10. Performance budgets

| Budget | Target |
| --- | --- |
| Physics per rendered frame | 4 ms or less on a mid-range laptop |
| Render per frame | 8 ms or less at 1080p |
| Frame rate | 60 fps on the high tier; the sandbox gate requires it with a wire and a 5F catheter |
| Input to photon | Under 50 ms |
| First load | Under 30 s on broadband; cases stream on demand |
| Minimum hardware | 2020-or-newer laptop with integrated graphics, reduced tier (7.3) |

The perf overlay shows frame time, physics time per frame, steps per frame, tier and backend. `npm run bench` runs a golden scene headless and prints physics time per simulated second.

## 11. Testing strategy

| Layer | Tool | What |
| --- | --- | --- |
| Pure functions | Vitest | Units, quantity resolution, compatibility checks, input mapping, curves, rumble scheduling, C-arm kinematics, lumen queries, PRNG, deterministic trig, quaternions |
| Data | Vitest + `validate-data` | All repository data passes; each invalid fixture fails with its expected error |
| Physics | Vitest golden scenes, headless | Analytic checks (cantilever deflection, composite curvature), invariants (inextensibility, lumen containment), monotonic behaviors (friction, torque lag), branch selection, determinism and replay |
| App | Playwright, Chromium | Start screen and disclaimer, autopilot runs to completion, fake-gamepad input path, blocked-pairing messages, no console errors |

Physics tolerances are part of each golden scene and change only with a written reason (golden rule 9).

## 12. Continuous integration and deployment

GitHub Actions on every push and pull request: install, `lint`, `validate-data`, `test`, `build`, then `test:e2e` in Chromium. On `main`, a second workflow builds with `BASE_PATH=/<repo-name>/` and publishes `dist/` to GitHub Pages (the repository owner enables Pages once in its settings).

## 13. Coding standards

- No `any`; prefer readonly types at module boundaries; typed arrays inside the rod solver.
- Pure functions take state and return new values or write into caller-provided buffers; no hidden module state in `src/sim/`.
- Every constant in `src/sim/` comes from data or tuning; comments name the data id it came from.
- Files stay small and single-purpose; one golden scene per file.
- Errors that reach the learner are plain sentences; errors for developers include the data path.

## 14. Security and privacy

No runtime network requests beyond the app's own static assets. No analytics, no accounts, no cookies. Settings, high scores and replays live in `localStorage` or IndexedDB on the learner's device (spec 02 §13). A strict Content Security Policy is set through a meta tag in `index.html`.

## 15. Open questions

1. Whether XPBD with small steps holds the stiffest rail wires at 1 kHz on a 2020 laptop, or the direct stiff-rod solver is needed (measured in M2).
2. Whether the 3D overlay (5.4) uses the same anatomy meshes as the 3D view or a separate segmented-volume render (spec 08).
3. The body-IR flat-panel size for the default C-arm (the sourced Azurion panel is the 30 cm cardiac size).
