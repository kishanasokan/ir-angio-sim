# M2 implementation plan

The owner asked Claude to finish M2 and to choose with best practice (2026-10-06). This plan sequences the build of [`prompts/M2-core-systems.md`](../prompts/M2-core-systems.md) and records every decision the owner did not make, so each can be revisited. Specs: [03](../spec/03-anatomy.md), [04](../spec/04-device-mechanics.md), [07](../spec/07-flow-contrast.md), [08](../spec/08-imaging.md), [10](../spec/10-input.md). Groundwork measured before the plan: [M2-notes.md](M2-notes.md).

## Phases

| Phase | Builds | Done when |
| --- | --- | --- |
| A · Device mechanics | Full junction coupling, device-in-device friction, contact fallback, per-section diameters, four rod models, three-device setup, rail tier | Golden scenes 13–17 and every M1 scene pass; unit tests for the new pure code |
| B · Anatomy | Base-anatomy schema and validator, generator, visceral tree with one variant, sandbox option | Spec 03 §6 tests pass; a wire reaches T12 from the right CFA inside the lumen |
| C · Flow and contrast | Network, Windkessel calibration, waveform, transport, injections, cap, totals | Golden flow scenes F1–F7 pass |
| D · Imaging | Iodine in fluoro, body and skeleton, DSA, peak image, roadmap, dose | Spec 08 §7 tests pass; DSA runs in the browser on both backends |
| E · Input, UI and demos | `triggers.dsa`, commands, injector console, HUD, setup stacks, two visceral demos | Spec 10 §7 tests; both demos finish headless and in the browser |
| Gate | Every check, an independent review, the summary | The prompt's Done-when |

Each phase ends with its checks pasted into the Progress log and a commit named after the phase.

## Decisions (made by Claude at the owner's request, 2026-10-06)

**D1 · Keep the composite coaxial model; couple the junction fully.** Real-time interventional simulators combine coaxial devices into one beam (SOFA BeamAdapter, read for method only). M1's composite is that model, except that its junction followed the outer tip only laterally inside the solve. Full coupling removes the soft-device instability (stretch from 20% to below 0.001%; docs/M2-notes.md §3) and improves M1's scene 12 (0.262% → 0.012%) with every golden scene passing. Rejected: a separate rod per device with sliding constraints (issue #5's option 2) — it breaks the block-tridiagonal solve into a banded one and needs two-way implicit coupling, for no gain in what the learner sees.

**D2 · Device-in-device friction is a hub-force term.** With the composite, sliding between devices is kinematic (the hub sets the rate), so friction shows as the resistance the hand feels: the capstan term for a loaded device plus a bending term for curvature changes (spec 04 §2.3). An undriven device stays pinned (M1's stack rule). Torsional coaxial friction is deferred (spec 04 §8.1).

**D3 · Degenerate contact falls back in three steps** (spec 04 §3.2): contact normals tilted toward `d1` with one re-linearization at the wall, then compliant contact rows, then projection back into the lumen. A failed substep never leaves a device outside the vessel. (Planned as a nudge of the node positions; phase A found that a nudge cannot help, because the stretch rows' Jacobians depend on the segment frames, so the normals tilt instead.)

**D4 · Rod models gain per-section outer diameters** (`outerDiameterFrom`), a spec 02 §11.1 extension, so tapered microcatheters have the right tip and shaft.

**D5 · The rail tier is built in M2** as spec 01 §9 says, behind the same snapshot format.

**D6 · Anatomy is generated from a base description** (`ir-sim/anatomy-base@1`, a spec 02 §2 and §9 extension). Calibers cite `reference.json` so sourced values keep their provenance; geometry and unsourced calibers are `estimated` with notes.

**D7 · Variants are graph edits**, and each base file lists the instances (base plus variants) the generator registers as anatomy graphs, so cases, loaders and the validator treat them like phantoms.

**D8 · Flow: Poiseuille edges, calibrated two-element Windkessel beds, a pressure inlet** (spec 07 §2). Calibrating each bed's resistance to a target mean flow makes the flow split a data choice, which the medical reviewer can check bed by bed.

**D9 · An injection is a volume source at the tip** (spec 07 §3), so reflux emerges from the network instead of a rule, and the catheter's Poiseuille cap teaches why a microcatheter cannot take a flush injection.

**D10 · Contrast moves in upwind cells with well-mixed beds; no recirculation in M2** (spec 07 §4).

**D11 · The simulation owns imaging timing and dose; the renderer owns pixels** (spec 08 §1). Settings that change the simulation become logged commands.

**D12 · Spec 02 §13 changes:** `InputFrame.triggers.dsa`; commands `set-imaging` and `set-injector`; logs without `dsa` read it as 0.

**D13 · Case schema v0 changes** (spec 02 §12): `stackOptions` (alternative starting stacks for setup) and base-anatomy instance ids in `anatomy.options`.

**D14 · Flow and transport run at their own fixed rate** (`tuning/flow → rate`), every k-th physics step on each tier, so both tiers simulate the same blood.

## Progress log

### Phase A · Device mechanics (2026-10-06)

Built: full junction coupling (spec 04 §2.1); the degenerate-contact fallback chain (§3.2); device-in-device friction on the hub forces (§2.3, `src/sim/rod/friction.ts`); per-section outer diameters (`outerDiameterFrom`, spec 02 §11.1); rod models for the Cobra C2 5F 65 cm, the 5F pigtail 90 cm, the Progreat 2.4F 130 cm and the GT 0.016 in angled microwire 180 cm; the three-device sandbox stack (case `stackOptions`, setup, picker, HUD roles and the active pair); the rail fallback tier (§6, `src/sim/rail/rail.ts`) with the benchmark chain high → standard → rail.

Checks at the end of the phase: `npm run lint` clean; `npm test` 49 files, 247 tests passed; `npm run validate-data` OK; `npm run test:e2e` 22 passed (11 on each backend, the build included).

Measured:
- **Fallback (golden scene 15).** A straight rod pushed end-on into phantom A's cap makes the first solve at the cap singular. The tilt angle sets how far the tip slides sideways in that substep, about (advance per substep)/tan(angle): 0.05° slid it 11 mm and stretched segments by 150%; 1° needed 5–7 fallbacks and left 0.15–0.34 mm excursions; 3° left 0.07 mm on the standard tier; 6° held on both tiers (one fallback, excursion 0.022 mm high / 0.026 mm standard, stretch 0.018% / 0.112% at 10 mm past contact). The refresh at the wall's own plane matters: without it the tip slid across the curved cap and left it by 0.17 mm. Solving the refreshed system repeatedly diverged, because each solve re-imposes the whole push on a rod whose first-order shortening is zero. Pushed further, the rod locks up as a helix in the rigid tube: at 20 mm the standard tier reaches 0.44% stretch at over 30 N, and beyond 30 mm the single linearization per substep no longer holds 0.5% (hub forces of 40 N for wire W, up to 1 kN for the stiffest wire). Those loads are 50 to 1,000 times `hubForceDanger`; the hand-force ceiling of spec 04 open question 2 (M3) bounds them. The scene therefore pushes 10 mm past contact. No M1 golden scene ever reaches the fallback.
- **Coaxial junction (scene 13).** Catheter K + microcatheter M, K + wire V, M + V and K + M + V in phantom C: largest stretch 7.4e-5%, 2.8e-4%, 1.2e-5% and 4.2e-4%; no failed solve; every inner device within its clearance.
- **Friction (scene 14).** Microcatheter M advanced through K's 60° tip: 9.9 mN at μ 0.1, exactly twice that at μ 0.2, zero at μ 0, zero through the straight catheter and zero once held; the catheter's hub feels it equal and opposite.
- **Rail (scene 16).** Branch choice by rotation, re-choice after a pull-back, the catheter following the wire, and the cap's hub force all hold, with every node on a centerline to 1 nm. The three M1 demos finish on the rail tier (c-left, b-bend, and a-buckle with 1.21 N at the hub).

Decisions taken in the phase:
- **Friction acts on both hubs**, equal and opposite (spec 04 §2.3 as built): the driven hand feels resistance and the pinning hand feels drag, as Newton's third law requires; the plan's wording named only the driven device.
- **The input log records the starting stack** (`stackId`, `innerDevice`; spec 02 §13). M1 never logged the setup's wire choice, so a replay of a session with a non-default wire started with the default one; fixed here, and logs without the fields replay with the case's defaults.
- **The HUD names devices by role** (catheter, microcatheter, wire) and, in a stack of three or more, marks the pair each stick drives.
- **Settings offers every tier**, the rail fallback included.

Changed expectation (with reason): `tests/unit/viewData.test.ts` lists the inventory's wires; the GT microwire joined the inventory for the three-device stack, so the list gained it. No golden expectation changed.

New design values: `solver.symmetryBreak` 6°, `solver.contactFallbackCompliance` 0.001 mm/N, `rail.capStiffness` 0.025 N/mm (matched to the Glidewire's buckled stiffness in golden scene 12).

New placeholders, for the medical reviewer (each with its note in `data/tuning/physics.json` or `data/cases/sandbox.json`):
- Cobra C2: inner diameter 0.039 in; soft-tip length 20 mm and modulus 0.3 GPa; body modulus 1.0 GPa; primary curve 0–8 mm at 30° and secondary curve 25–45 mm at 60° (spec 04 open question 4).
- Pigtail 5F: wire compatibility 0.038 in; inner diameter 0.039 in; loop section 50 mm at 0.3 GPa; body 1.0 GPa; curl of 360° over the distal 45 mm.
- Progreat 2.4F: length of the 2.4F distal segment 150 mm; distal modulus 0.3 GPa; shaft modulus 1.0 GPa.
- GT 0.016 in: nitinol core assumed; softest tip 30 mm at 5% of the body; linear ramp to the body over the sourced 25 cm flexible length; angled-tip length 2 mm (the 45° angle is the sourced option).

