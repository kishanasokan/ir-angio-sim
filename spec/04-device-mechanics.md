# 04 · Device mechanics

Status: drafted 2026-10-06 for milestone M2. Decisions marked "(M2)" were made by Claude at the owner's request to choose with best practice; the owner and an IR reviewer can revisit any of them. Depends on 01 (§6 physics overview), 02 (§7 devices, §11 rod models) and the M1 build (docs/M1-plan.md, D3, D9, D10, D29).

## 1. Rod model (built in M1)

Every wire, catheter and microcatheter is a Cosserat rod: node positions plus one quaternion per segment, with stretch-shear constraints (zero compliance) and bend-twist constraints with energy-consistent compliance (l̄/EI, l̄/GJ in angle form). Each step runs the tier's substeps; each substep solves every constraint of every chain together with a direct block-tridiagonal Cholesky (D3, D29), lumen contact rows included. Friction against the wall is implicit Coulomb friction (D29). Insertion is a moving boundary at the sheath tip (D10). The frame convention is in `src/sim/rod/state.ts`.

## 2. Coaxial stack

### 2.1 Composite coupling (M2)

Devices in a coaxial stack are coupled as one combined beam, the approach of real-time interventional simulators such as SOFA BeamAdapter (`sofa-beamadapter`, read for method only):

- Where devices overlap, the outermost device is the chain; inner devices ride on its centerline, adding their bending stiffness, mass and rest curvature (turned by their own hub rotation) to its joints. A stiff wire straightens a curved catheter; pulling it back lets the curve re-form (golden scene 9).
- Beyond an outer device's tip, the inner device continues as its own chain. Its first node, the **junction**, sits on the outer device's tip segment, a lever `e` behind the outer tip, where `e` is set by the two insertion depths each substep, so relative sliding is kinematic.
- **The junction is coupled fully (M2).** Inside the solve the junction follows the outer tip node in every direction (Jacobian −I/l) and the outer tip segment's rotation through the lever, exactly as it is placed after the solve. M1 coupled it only laterally, which let the outer tip's axial correction reappear each substep as a length error. For soft, light inner devices that error fed an oscillation: a microcatheter beyond a 5F catheter stretched its junction segment by 20% (docs/M2-notes.md §3). With full coupling the stretch stays below 0.001% for every stack measured, and M1's golden scene 12 falls from 0.262% to 0.012%.
- Consequence: an inner device's axial load at the junction flows into the combined beam and to the clamp at the sheath, as it does through a combined beam. Each device's hub force (§4) is still read from its own first free segment.

### 2.2 Stack rules (built in M1, extended)

Movable devices are ordered outermost first. The active pair moves with the D-pad when three or more devices exist; lock moves the pair as one; an undriven device keeps its insertion depth and hub rotation — the operator's other hand pins it. The order rule (`order-catheter-over-wire`) keeps every outer device behind the innermost tip.

### 2.3 Device-in-device friction (M2, closes issue #5's design question)

Because relative sliding inside the combined beam is kinematic, friction between devices acts on the **hub force** of the device that slides, not on its motion (the hand supplies whatever force the rate needs; pinned devices hold). For each overlapping pair (outer `o`, inner `i`) whose insertion rates differ, the sliding friction force is

```
F = μ_io · ( |T_i| · Σ θ_j  +  EI_i · Σ |κ_{j+1} − 2κ_j + κ_{j−1}| / l )
```

over the joints `j` of the overlap, where `μ_io` is the inner device's `lumenFrictionId` coefficient against the outer device (`physics/materials → fr-device-in-device`), `θ_j` the joint angle, `κ_j = θ_j / l̄_j`, `EI_i` the inner device's bending stiffness and `T_i` the inner device's axial load (its hub force without this term, from the last step). The first term is the capstan law for a loaded device sliding round bends; the second is the contact force a stiff device needs to follow changes of curvature. `F` opposes the relative motion: it adds to the hub force of each device that is driven, with the sign of its own relative motion. Torsional device-in-device friction is not modeled in M2 (open question 1).

## 3. Contact

### 3.1 Lumen contact (built in M1)

A node must stay within `max(0, R − r − margin)` of some lumen capsule axis; nodes at or beyond it get a push-only contact row in the direct solve (D29).

### 3.2 Degenerate contact (M2)

A perfectly straight rod pushed end-on into a cap makes the contact row a combination of the stretch rows, so the factorization finds a pivot that is not positive (docs/M2-notes.md §2). When a substep's solve fails, the solver:

1. breaks the symmetry: every node with an active contact row moves `solver.symmetryBreak` (design) along its segment's material axis `d1`, a deterministic direction perpendicular to the rod, and the substep is assembled and solved again;
2. if that also fails, gives the contact rows a compliance `solver.contactFallbackCompliance` (design) and solves again;
3. if that also fails, counts a solve failure, keeps the prediction, and projects every dynamic node that left the lumen back onto its allowed surface, so a failed substep never leaves a device outside the vessel.

Real wires are never perfectly straight, so step 1 stands in for the imperfection that makes them buckle sideways.

## 4. Feedback

- **Hub force** (M1): the axial reaction at a device's first free segment, plus (M2) the device-in-device friction of §2.3 while the device slides relative to another.
- **Tip normal force**, **wall stress**, `hub-force-warning` and `hub-force-danger` events, as in M1 (`tuning/physics → feedback`).

## 5. Devices in M2

Each needs a rod model in `tuning/physics.json`; values a source does not give are `placeholder` with a note (golden rule 2).

| Rod model | Item | Use |
| --- | --- | --- |
| `rm-glidewire-035-angled-150`, `rm-bentson-035-145`, `rm-amplatz-bard-035-180` | M1 wires | Unchanged |
| `rm-berenstein-5f-65` | M1 catheter | Unchanged |
| `rm-cobra-c2-5f-65` | `cath-cobra` | Selective visceral catheter (celiac, SMA) |
| `rm-pigtail-5f-90` | `cath-pigtail` | Flush catheter for aortograms |
| `rm-progreat-2.4-130` | `mc-progreat-2.4` | Microcatheter: 2.4F distal, 2.9F proximal |
| `rm-gt-016-angled-180` | `mw-glidewire-gt` | Microwire, 0.016 in, 45° tip |

**Per-section outer diameter (M2).** A rod model section may name the item property that gives its outer diameter (`outerDiameterFrom`, an item path such as `geometry.outerDiameterDistal`). Sections without it use the item's outer diameter. Stiffness, mass and the contact radius follow each segment's own diameter. A tapered microcatheter therefore has its 2.4F tip and 2.9F shaft, while the compatibility rule `fit-micro-parent` keeps reading the proximal diameter.

## 6. Tiers (spec 01 §9)

| Tier | Model | Step rate | Segments |
| --- | --- | --- | --- |
| High | Rods | 1 kHz | 2 mm |
| Standard | Rods | 500 Hz | 4 mm |
| Fallback (M2) | **Rail** | 250 Hz | 5 mm |

**Rail model (M2).** On machines too slow for rods, each device is a sequence of points along vessel centerlines. Insertion moves the tip along the path. At a junction the tip enters the daughter whose direction best matches the tip's bend direction (rest shape turned by the hub rotation), as golden scene 8 expects of rods. An inner device follows its outer device's path and extends beyond its tip. A cap stops the tip and raises the hub force with the extra push at `rail.capStiffness` (design). The startup benchmark (D17) moves on to the rail model when the standard tier is also over budget; Settings can force any tier. Snapshots keep the rod format, so rendering, the HUD and the flow model need no change.

## 7. Tests (added in M2)

Golden scenes (headless; high tier unless stated):

13. **Coaxial junction stays inextensible.** In phantom C, each of these stacks advances its inner device 60 mm, follows with the outer one 40 mm, then pulls the inner one back 30 mm while rotating: catheter K + microcatheter fixture; catheter K + 0.014 in wire fixture; microcatheter + wire; and the three together (with pair moves and lock). Every segment stays within 0.5% of its length, with no failed solve, and every inner device stays within its outer device's clearance.
14. **Device-in-device friction.** The microcatheter fixture advanced 30 mm through catheter K: its hub force gains the friction term only while it slides, the term is zero at μ = 0, larger through K's 60° tip than through a straight catheter, and it rises with μ.
15. **End-on push into a cap.** A straight 0.035 in rod pushed 50 mm past contact with phantom A's cap at sandbox-a-buckle's push speed: no node leaves the lumen by more than 0.05 mm, segments stay within 0.5%, the tip advances less than 2 mm after contact, and at most `solver.maxFallbackSubsteps` substeps fall back past step 1 of §3.2.
16. **Rail branch selection.** On the fallback tier, golden scene 8's setup puts the tip in `c-left` at hub rotation 0 and in `c-right` at 180°; a rail device never leaves the centerline.
17. **Stiffest rail wire** (added after M1): the stiffest wire in `/data` passes scene 1's cantilever and scene 3's push-pull criteria on both rod tiers (`tests/golden/rail-wire.golden.test.ts`).

Unit tests: per-section diameters and stiffness in the catalog; the friction term on a hand-built overlap; the rail path builder and branch choice; the solve fallback chain on a singular system.

## 8. Open questions

1. Torsional friction between devices (torque windup of a microwire inside a microcatheter) needs either torsional degrees of freedom for carried devices or a lag model; deferred.
2. Damage and kink thresholds (spec 00 §8: failure only when the learner causes it): a curvature limit per rod model and a hub-force ceiling, with consequences, belong with the case engine (M3).
3. Adaptive discretization (coarser segments far from the tip, as BeamAdapter does) if deep visceral work exceeds the physics budget.
4. Catheter curves (Cobra, pigtail) are placeholders until built from manufacturer drawings and tuned with an IR reviewer.
