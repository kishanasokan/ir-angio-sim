# M2 notes: what M1's engine shows before M2 is specified

M2 (core systems: visceral tree, wire and catheter mechanics with a three-device stack, fluoro, DSA, flow) needs specs 03, 04, 07, 08 and 10 and an M2 build prompt. None exists yet; the planning chat writes them with the owner ([spec/README.md](../spec/README.md)). This page records measurements made with M1's engine after the M1 gate (2026-10-06), as input for those specs, mostly spec 04 (device mechanics).

Nothing here changes how M1 behaves. The stiff-wire check (§1) is a golden test; the other findings name their exact setup so they can be repeated or turned into golden scenes once spec 04 says what the right behavior is.

## 1. The stiffest rail wires hold on both tiers (spec 01 §15, question 1)

**Question.** Does the solver hold the stiffest rail wires (up to 158 GPa effective modulus, `harrison2011`) at 1 kHz, or is the direct stiff-rod solver needed?

**Answer: yes, and the direct solver is already in use (D3, D29).** Wire R is golden-scene wire W (0.035 in, 400 mm, ν 0.3, 7900 kg/m³) with the flexural modulus of the stiffest wire in `/data`: the Lunderquist Extra Stiff at 158.4 GPa (sourced, `harrison2011`). `tests/golden/rail-wire.golden.test.ts` applies the M1 golden criteria to it on both rod tiers:

| Check (M1 criterion) | High tier (1 kHz, 2 mm) | Standard tier (500 Hz, 4 mm) |
| --- | --- | --- |
| Scene 1's cantilever, the load scaled by the stiffness ratio so 1.4305 mm is expected (within 5%) | 1.4304 mm | 1.4407 mm |
| Scene 3's push-pull with full-speed rotation in phantom B (segments within 0.5%) | 6.1e-13% | 2.6e-13% |
| Failed solves | 0 | 0 |

The direct solve is exact for any stiffness, so its cost does not depend on stiffness either.

## 2. A straight rod pushed end-on into a cap makes the solve singular

**Setup.** A uniform straight 0.035 in rod, 600 mm long, starts with its tip 50 mm short of phantom A's cap and is pushed at sandbox-a-buckle's `pushSpeed` (20 mm/s) for 50 mm plus `extraPush` (50 mm). With the 11 cm sheath, wire W's 400 mm cannot reach the cap, hence the longer rod.

**Result.** At every modulus tried, 9.5, 30, 60.3 and 158.4 GPa, the first failed solve comes at the same step, just as the tip reaches the cap surface (z = 303.54 mm). From then on every substep fails: 4,647 on the high tier and 2,324 on the standard tier. Segments stretch by 99%, and on the high tier the tip ends 10 mm inside the cap.

**Mechanism.** In a perfectly straight, perfectly aligned rod, the tip's contact row is an exact linear combination of the axial rows of the stretch constraints, which telescope from the kinematic clamp to the tip. With every row at zero compliance, J·W·Jᵀ is then only semidefinite, and the block Cholesky meets a pivot that is not positive. A failed substep keeps its predicted state, which is how the tip passes into the cap. A real wire is never perfectly straight, so it buckles sideways instead.

**Not reachable in M1.** The sandbox always has the 5F Berenstein's curved tip in the stack, which breaks the symmetry. With the catheter in the stack, each sandbox wire pushed at full speed for 20 s (600 mm, about 330 mm of it against phantom A's cap) never fails a solve on the standard tier.

**Reachable in M2:** straight catheters, wires without an angled tip, and occlusions. Options for spec 04:

- give rods a tiny deterministic imperfection, for example a seeded rest-curvature jitter far below anything visible;
- when the factorization fails, solve again with a small compliance on the contact rows, which restores positive definiteness;
- make the failure path keep nodes inside the lumen instead of keeping the predicted state.

The same push also shows the size of the forces involved. The Bentson and the Amplatz reach a 37 N hub force, and the Amplatz's segments stretch by up to 0.88%, beyond the 0.5% golden limit. M1 has no kinking or damage model; spec 04 lists damage thresholds.

## 3. The catheter-tip junction is unstable for soft, light inner devices

**What M1 does** (D29, phase B deviation 3, phase C fix 3). An inner device is carried on its owner's centerline as a composite rod. Beyond the owner's tip, its chain starts at a junction node held on the owner's tip segment.

**Setup.** Fixture devices, which are test data, not device claims:

- catheter K, the golden-scene catheter: 5F, 1.0 GPa, a 60° tip;
- microcatheter M: 2.4F outer diameter, 0.021 in lumen, 0.5 GPa, 1200 kg/m³;
- wire V: 0.014 in, 40 GPa, 6450 kg/m³, a 45° tip over 3 mm.

They run in phantom C on the high tier. The outer device starts 30 mm past the sheath tip and the inner one 40 mm. The inner device advances 60 mm at 10 mm/s, the outer one follows 40 mm, and then the inner one pulls back 30 mm while rotating. The table gives the largest segment length error; the M1 golden limit is 0.5%.

| Stack (outer + inner) | Largest stretch | Note |
| --- | --- | --- |
| Microcatheter M + wire V | 0.0009% | A soft owner: fine |
| Catheter K + 0.035 in, 8 GPa wire | 0.51% | At the limit; the sandbox's own pair reaches 0.26% (scene 12) |
| Catheter K + wire V, wire density × 6 | 3.0% | |
| Catheter K + wire V, wire modulus × 8 | 1.2% | |
| Catheter K + wire V, both | 0.56% | |
| Catheter K + wire V | 11.7% | Already 1.05% at step 1 |
| Catheter K + microcatheter M | 20.3% | Already 3.6% at step 1: the classic coaxial pair |
| K + M + V, three devices | 10.3% | At the wire's junction on the microcatheter |

The worst segment is always the junction segment, the inner chain's first, which straddles the owner's tip. After the 500-step load relax with no input, catheter K's tip still swings sideways at about 0.1 mm per millisecond, and the junction segment's length swings by ±1% with it. This is an oscillation the coupling sustains, not a static offset.

**Likely mechanism.** Inside the solve, the junction node follows the owner's tip only laterally: its Jacobian with respect to the owner's tip node is the perpendicular projection. That way the inner device's axial load goes to its own hub instead of pushing the catheter, which is right for a frictionless device. After the solve, though, the node is placed fully on the owner's corrected centerline, axial part included. So each substep, the owner tip's axial correction turns into a length error in the junction segment, the next solve corrects it with a kick on the inner device, and that kick feeds back into the owner through the lateral coupling. A heavier or stiffer inner device damps the loop; a light, soft one does not.

**Why it matters for M2.** The three-device stack puts a microcatheter beyond a guide or diagnostic catheter, and a microwire beyond the microcatheter: exactly the cases above. Coupling the node fully, axially too, is not the fix, because the inner device's axial load would then push the catheter's tip, and a catheter could buckle under a wire's push.

**For spec 04, with issue #5.** Issue #5 already asks whether to keep the composite rod or move to a sliding (distance) constraint with friction. These measurements argue for option 2: inner devices as full rods of their own, held within the owner's lumen with friction on the relative motion. That gives the inner device real axial degrees of freedom and removes the slaved junction. If the composite stays, its junction needs an extra pass over each inner chain after the owner's correction, at extra solve cost. Either way, the table above is a ready golden scene: every row should stay within 0.5%.

**The three-device mechanics themselves work.** Pair moves (D-pad), lock, the order rule (every outer device stays behind the innermost tip) and containment all behaved correctly. Each inner device stayed inside its owner's clearance, with no failed solve.

## 4. High-tier performance (issue #3)

**Where the time goes** (CPU profile of the sandbox-c-left demo on the high tier):

| Part | Share |
| --- | --- |
| Block Cholesky (`solveBlockTridiagonal`) | 26% |
| Assembling J·W·Jᵀ (`solveUnits`, `accumulate`) | 30% |
| Building the chains (`buildChains`), with the lumen's capsule tests | 25% (capsule tests 7%) |
| Placement, prediction, velocities, the rest | about 19% |

**Done at the gate, keeping every result bit for bit.** The solve skips exact-zero products and absent force terms. The high tier is 3–5% faster in alternated A/B runs of the demos and 11–18% in `npm run bench`, and the six demo hashes are unchanged.

**Still needed: about 2×.** The demo runs at about 8 ms of physics per frame on the high tier in this container, against a 4 ms budget. The kernels already sit near 1.3 ns per arithmetic operation, which is loop and index overhead rather than arithmetic, and the cost is spread over all three parts. No single kernel change gets there. The options, roughly by payoff:

- Straight-line, generated kernels for the standard unit: the 7-row block and the standard Jacobian layout, with the generic path kept for junctions and chain ends. Bit-identical results are still possible if each sum keeps its order, and the demo hashes can prove it.
- A struct-of-arrays layout through `buildChains` and the assembly, to cut index arithmetic and bounds checks.
- WebAssembly for the solve, if it stays deterministic: IEEE doubles, no fused multiply-add.
- Rethinking the tiers instead. M2's three-device stack adds about a third more units, so the standard tier (2.2 ms here) is the realistic default, and the high tier may not be needed at all.

## 5. What spec 04 needs to decide

- The coaxial coupling and its friction (issue #5), informed by §3.
- End-on contact (§2): an imperfection, regularization, or a safer failure path.
- Damage and kink thresholds, and a ceiling on hub force (§2's 37 N).
- The rail fallback tier (spec 01 §9 gives one line; the details belong in spec 04).
- Whether `solver.rotationalInertiaScale` (1000) is acceptable for wire feel; it slows short bending and twisting waves.
- Rod models for the microcatheters and microwires in `/data`. Their moduli are placeholders today (`gw-*`, `mw-*` 20–40 GPa), and no microcatheter has a modulus yet.
