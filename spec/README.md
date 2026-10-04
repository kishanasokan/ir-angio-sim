# Specification set

The simulator is specified as 19 documents plus one build prompt per milestone. Each document keeps the bones of the original cath lab build guide: an exact stack, pure functions for simulation logic, one data source with real numbers, a suggested file structure, a named test list and a Done-when. Each spec is written just ahead of the build phase that needs it, so working code tests every document within weeks.

## Documents

| # | Document | Defines | Written in | Status |
| --- | --- | --- | --- | --- |
| 00 | [Product brief](00-product-brief.md) | Vision, audience, modes, scope, case catalog, controls, scoring, platform, decision log | Phase 1 | Drafted |
| 01 | [Architecture and stack](01-architecture.md) | Stack, module map, threads, determinism, units, rendering, tiers, budgets, testing, CI | Phase 1 | Drafted |
| 02 | [Data layer and schemas](02-data-schemas.md) | Confidence levels, fact shapes, units, sources, devices, rules, anatomy graph, tuning, cases, runtime records, validator | Phase 1 | Drafted |
| 03 | Anatomy and variant generator | Base tree from the intracranial circulation to the feet, visceral branches, variant edits and frequencies, disease modifiers, meshes | Phase 2 | Planned |
| 04 | Device mechanics | Rod model, per-class parameters, coaxial coupling, contact and friction, damage thresholds, tuning protocol | Phase 2 | Planned |
| 05 | Device library and compatibility | Catalog of 150–300 items, naming policy, compatibility engine | Phase 3 | Planned |
| 06 | Access and closure | Ultrasound and landmark puncture, needle forces, micropuncture, sheaths, closure sequences, access complications | Phase 3 | Planned |
| 07 | Flow, contrast and embolics | Network flow, hand and power injection, contrast transport, extravasation, each embolic's behavior, endpoints | Phase 2 | Planned |
| 08 | Imaging chain and C-arm | Fluoro, DSA, roadmap, bolus chase, cone-beam CT, 3D overlay, gantry and table kinematics, collimation, dose | Phase 2 | Planned |
| 09 | Patient and pharmacology | Vitals, hemorrhage, sedation, anticoagulation, kidney limits, reactions, drug cart, labs | Phase 3 | Planned |
| 10 | Input and haptics | Two-mode controller map, keyboard and mouse parity, remapping, response curves, rumble cues | Phase 2 | Planned (M1 builds the subset in its prompt) |
| 11 | UI, suite and audio | X-ray-first screen, Siemens-style conventions without branding, roadmap and side-by-side, 3D toggle, HUD, sounds, visual style | Phase 4 | Planned |
| 12 | Case engine and authoring | Case file format, step graph, triggers, complication injection, autopilot scripts | Phase 4 | Planned |
| 13 | Case library | One spec per case, the random-case generator, the optional cardiac track | Phases 3–5 | Planned |
| 14 | Assessment and debrief | Metrics, rubrics, weights, scores, local high scores, replay timeline | Phase 3 | Planned |
| 15 | Teaching layer | Step lists, learn-more panels, hints that highlight targets and suggest tools, anatomy labels, citations | Phase 4 | Planned |
| 16 | Validation and QA | Golden scenes, expert review, performance budgets, browser matrix | Phase 5 | Planned |
| 17 | Platform | Repository and license, static hosting, local saves, trademark notice | Phase 5 | Planned |
| 18 | Milestone build prompts | One prompt per milestone, in `prompts/` | Continuous | M1 ready |

## Milestones and gates

| Milestone | Phase | Builds | Specs it needs | Gate to pass |
| --- | --- | --- | --- | --- |
| [M1 Foundations](../prompts/M1-foundations.md) | 1 | Repository scaffold, data validators, rod-in-a-tube sandbox with a gamepad | 00, 01, 02 | Sample device, anatomy and case files validate; the sandbox holds 60 fps |
| M2 Core systems | 2 | Visceral tree, wire and catheter mechanics with a three-device stack, fluoro, DSA, flow network | 03, 04, 07, 08, 10 | Golden physics scenes pass; an IR reviewer calls the wire feel credible |
| M3 First slice | 3 | Upper GI bleed with GDA embolization end to end, debrief and replay | 05, 06, 09, 13 (GDA), 14 | Autopilot and a human both finish the case; expert face-validity review |
| M4 Second slice | 4 | Uterine fibroid embolization: particles and reflux, guided and exam modes | 11, 12, 13 (UFE), 15 | Reviewers find flow-directed embolics plausible |
| M5 Launch set | 5 | The remaining launch cases, local saves, GitHub release on static hosting | 13, 16, 17, 18 | At least 12 cases pass their autopilots and human play-throughs |

## Conventions

- Specs cite data by id (`gw-amplatz-super-stiff-bsc`) and sources by registry id (`harrison2011`); they never restate a number without its id.
- Each spec ends with open questions. Answers go into the spec and, when they change scope, into the decision log of spec 00.
- A spec is "Drafted" when written, "Built" when its milestone's Done-when passes, and "Validated" after expert review.
