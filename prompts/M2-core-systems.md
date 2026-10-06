# M2 · Core systems: visceral anatomy, three-device stack, flow, contrast and DSA

**How this milestone was run.** The owner asked Claude to finish M2 and to choose with best practice (2026-10-06), so Claude drafted specs 03, 04, 07, 08 and 10 for M2's scope and this prompt, then built it in phases recorded in [`docs/M2-plan.md`](../docs/M2-plan.md). Every choice the owner did not make is a numbered decision there, open to revision.

---

## The prompt

Extend the M1 sandbox into M2: a visceral arterial tree generated from sourced calibers, wire, catheter and microcatheter mechanics with a three-device coaxial stack, a 1D flow network with contrast transport and injections, and an imaging chain with iodine, DSA, the roadmap and patient dose. Keep every M1 rule: the exact disclaimer, no invented numbers (golden rule 2: missing values go into `/data` as `placeholder` or `estimated` with a note and appear in the inspector and the summary), pure and deterministic simulation code, SI inside the simulation, one input path, explained blocks, tests with code, golden scenes green, permissive licenses, no runtime network calls.

### 1. Device mechanics (spec 04)

1. Couple the coaxial junction fully in the solve (spec 04 §2.1).
2. Device-in-device friction on the hub force (spec 04 §2.3), with `fr-device-in-device`.
3. The degenerate-contact fallback chain (spec 04 §3.2), with design values `solver.symmetryBreak` and `solver.contactFallbackCompliance`, and counters for each step.
4. Per-section outer diameters in rod models (`outerDiameterFrom`, spec 04 §5) and per-segment stiffness, mass and contact radius from them.
5. Rod models for the Cobra C2 (5F, 65 cm), the 5F pigtail (90 cm), the Progreat 2.4F (130 cm) and the GT 0.016 in angled microwire (180 cm), placeholders where unsourced.
6. The rail fallback tier (spec 04 §6), chosen by the startup benchmark when the standard tier is over budget.
7. Sandbox setup offers two stacks: catheter and wire (M1), or catheter, microcatheter and microwire, with the compatibility rules (`fit-micro-parent`, `fit-wire-microcatheter`) checked in setup and the picker.

### 2. Anatomy (spec 03)

1. Schema `ir-sim/anatomy-base@1` in the validator, and the generator in `src/data/anatomy/`.
2. `data/anatomy/base/visceral.json` with the vessels, beds, access, spine levels and the `hepatic-rrha-sma` variant; instances `visceral-standard` and `visceral-replaced-rha`.
3. The sandbox case lists both instances; the right CFA is the access.

### 3. Flow and contrast (spec 07)

1. The flow network, the Windkessel calibration and the tree solve; the inlet waveform.
2. Contrast transport in cells with junction mixing and bed compartments.
3. Injections as volume sources at the device tip, the catheter cap, hand injection (RT) and the power injector; contrast totals.
4. New data: blood and cardiac values in `patient/physiology.json`, contrast viscosity and hand-injection rate in `imaging.json`, `tuning/flow.json`.

### 4. Imaging (spec 08)

1. Iodine in fluoro from the snapshot's cell concentrations; the body outline and the skeleton for base anatomies.
2. DSA runs (mask, subtraction, peak image) at the acquisition rate; the power injector fires after its delay.
3. The roadmap from the last run, cleared by any pose change.
4. Dose: Ka,r and PKA per pulse and frame, SIR notifications, and the HUD readouts.

### 5. Input and UI (spec 10)

1. `triggers.dsa` (LB, F), the plunger (RT, E), commands `set-imaging` and `set-injector`, the injector console (J; the pause menu), arming (K).
2. HUD: DSA state, injector, roadmap, contrast totals, dose.
3. Demos: `visceral-aortogram` (pigtail over the Glidewire to T12, pull the wire, a DSA run with the mesenteric survey protocol) and `visceral-sma` (Cobra over the Glidewire into the SMA, hand-injected DSA run). Each is a closed-loop autopilot like M1's.

### 6. Tests

Everything in spec 04 §7 (golden scenes 13 to 17), spec 03 §6, spec 07 §7 (F1 to F7), spec 08 §7 (D1, D2) and spec 10 §7, plus:
- the validator: the base anatomy passes; one invalid fixture each for a base-anatomy `bad-reference` and `graph` error;
- golden: both visceral demos finish within their step budgets, their devices stay in the lumen (0.05 mm) and their segments within 0.5%;
- end-to-end: the visceral sandbox loads; the aortogram demo runs DSA and leaves a held image; the three-device stack shows three devices in the HUD and the D-pad moves the active pair; the injector console arms the injector.

### Done when

- `npm run build`, `npm run lint`, `npm test`, `npm run validate-data` and `npm run test:e2e` all pass, with no test skipped or weakened and no golden expectation changed without a written reason.
- Every M1 and M2 demo runs start to finish headless with no console errors.
- Physics per frame on the standard tier stays within the 4 ms budget in the visceral demos headless on the build machine (`npm run bench`), or the summary says by how much it does not and why.
- Every value the simulation uses appears in the inspector with its confidence badge; the summary lists every placeholder and estimate added in M2.
- The M2 summary at the end of `docs/M2-plan.md`; the IR reviewer's verdict on wire feel (the spec README's gate) waits for the final stage with the owner's test drive (M1 decision D31).
