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

**D3 · Degenerate contact falls back in three steps** (spec 04 §3.2): a deterministic sideways nudge along `d1`, then compliant contact rows, then projection back into the lumen. A failed substep never leaves a device outside the vessel.

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
