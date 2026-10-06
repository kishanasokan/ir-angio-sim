# 07 · Flow, contrast and embolics

Status: drafted 2026-10-06 for milestone M2, which builds blood flow, contrast transport and injections; embolics (coils, particles, liquids) and their effect on flow follow in M3 and M4. Decisions marked "(M2)" were made by Claude at the owner's request to choose with best practice. Depends on 01 (§6), 02 (§9) and 03.

## 1. Approach

A **1D network** on the anatomy graph (spec 01 §6; spec 00 principle 3): enough physics to make contrast behave as it does on the monitor — faster in big vessels, washing out of beds, refluxing when a selective injection outruns the vessel — at well under a millisecond per step. Everything lives in `src/sim/flow/`, pure and deterministic (golden rule 4), and runs in the physics worker on the simulation's fixed steps.

## 2. Flow network

- **Nodes and edges.** Graph nodes are network nodes; each anatomy segment is an edge with Poiseuille resistance summed over its capsules, `R = Σ 8 μ l_k / (π r_k⁴)` (mean radius of each capsule), μ the blood viscosity (`patient/physiology → blood.viscosity`).
- **Inlet.** The root's inlet node has a prescribed pressure `P(t) = MAP + PP · w(t)` (`blood.meanArterialPressure`, `blood.pulsePressure`, heart rate `cardiac.heartRate`), where `w` is a smooth periodic arterial waveform with zero mean and unit peak-to-trough (`tuning/flow → waveform`, design; built with `detTrig`).
- **Outlets.** Each outlet node feeds a two-element Windkessel bed: `C dP/dt = Q_in − (P − P_v)/R_d` (venous pressure `blood.venousPressure`). At load the generator's target mean flow `Q_b` of each bed calibrates `R_d`: with every outlet at its target, edge flows are sums of their downstream targets, mean node pressures follow from the inlet down (`P_child = P_parent − R·Q`), and `R_d = (P_outlet − P_v)/Q_b`. `C = τ_b / R_d` with the bed's time constant. A bed whose path alone needs more pressure than the inlet provides is an error the loader reports.
- **Caps** carry no flow (M1's phantoms have one cap; phantom flow uses an outlet at the far end when a scene needs it).
- **Solve.** Each flow step `Δt = 1 / flowRate` (`tuning/flow → rate`, design), backward Euler on the bed pressures and an exact solve of node pressures: the network is a tree, so one elimination pass from the outlets to the inlet and one back solves it in linear time. Node pressures, edge flows (signed) and bed pressures are state, hashed and snapshotted.

## 3. Injection

- **Source.** A catheter injecting at rate `q` adds a volume source at its tip: the edge holding the tip is split there (its resistance shared in proportion to arc length) and `q` enters at the split node. A selective injection faster than the vessel's own flow therefore raises the pressure at the tip until flow runs backward in the parent edge: **reflux emerges from the network** (`imaging → injectionModelRules → inj-reflux`), it is not a rule.
- **Catheter cap** (`inj-cap`). The rate is limited to what the catheter's lumen passes at the injection pressure limit: Poiseuille through the device, `q_max = P_max π r⁴ / (8 μ_c L)`, with the lumen radius, the device length, the contrast viscosity `contrast.agents[].viscosity` and `P_max` the lower of the injector's pressure limit and the catheter's rating (placeholder where a rating is unsourced). A capped injection shows a message with the rule.
- **Hand injection.** The RT plunger (spec 10) sets `q = trigger × injection.handMaxRate` (estimated), capped as above.
- **Power injector.** A protocol (rate, volume, rise time, delay) from `imaging → injections.protocols` or edited in the console; DSA fires it (spec 08, spec 10). The rate ramps over the rise time and stops when the volume is delivered.
- **Agent.** Iohexol at a selected concentration (`contrast.agents`, `mgI/mL`); totals of contrast volume (mL) and iodine (g) are tracked against the case (spec 09 adds the kidney limits).

## 4. Contrast transport

- **Cells.** Each edge is cut into cells of about `tuning/flow → cellLength` (design); a cell holds iodine concentration `c` (mgI/mL).
- **Advection.** First-order upwind with the edge's signed flow and each cell's own cross-section, in as many sub-steps as the Courant number needs (`u Δt / Δx ≤ 1`). Upwind smears a bolus a little; blood mixing does too, so it stays first order until a scene needs sharper fronts.
- **Junctions.** The node mixes its inflows by flow (`c = Σ Q c / Σ Q`); outflowing edges take the mixture.
- **Injection** adds `q · c_agent` of iodine to the tip's cell each step (with the volume source of §3).
- **Beds.** Each bed is a well-mixed compartment of volume `Q_b · T_b` (mean transit time `T_b`), so a parenchymal blush builds and washes out; venous return and recirculation are not modeled in M2.
- **Conservation.** Iodine in = iodine in cells + beds + washed out, to rounding; a golden scene checks it.

## 5. Coupling to devices

The engine passes the flow model each device's tip position (anatomy segment and arc), so injections start where the tip is. M2 does not narrow the lumen by the catheter's own cross-section (a wedged catheter is M3, with `inj-wedge`).

## 6. Data (M2 additions)

- `patient/physiology.json → blood`: viscosity, density, mean arterial pressure, pulse pressure, venous pressure; `cardiac`: heart rate (estimated, standard adult values with notes).
- `imaging.json → contrast.agents[]`: iohexol viscosity at 37 °C per concentration (estimated from the label; add a source); `injection.handMaxRate` (estimated); the injector's pressure limit (placeholder).
- `tuning/flow.json` (new, design): flow rate, cell length, waveform harmonics.
- Bed flows, time constants and transit times in the base anatomy (spec 03).

## 7. Tests (M2)

Golden flow scenes (headless):

F1. **Poiseuille.** A straight tube with fixed end pressures carries `π r⁴ ΔP / (8 μ L)` within 1e-9 relative.
F2. **Calibration and balance.** The visceral tree at constant inlet pressure settles to every bed's target flow within 1%, and inflow equals total outflow within 1e-9 relative at every step.
F3. **Windkessel.** A step in inlet pressure relaxes a single bed with the time constant `R_d C` (and the path resistance) within 2%.
F4. **Advection and conservation.** A bolus in a straight tube at constant flow arrives after `L / u` within 5% and leaves with the injected iodine within 1%.
F5. **Reflux.** A selective injection below the branch's flow keeps the parent free of contrast; one well above it puts contrast into the parent upstream of the branch.
F6. **Cap.** A 20 mL/s request through the microcatheter is capped to its Poiseuille limit, and the cap is reported.
F7. **Determinism.** Two runs of an injection give identical hashes; changing the rate changes it.

Unit tests: the tree solve against a dense solve; the waveform's mean and peak-to-trough; cell construction; upwind with reversing flow.

## 8. Open questions

1. Systemic recirculation (contrast returning after ~20 s) and venous phases.
2. Flow changes from embolization, vasospasm and wedged catheters (M3).
3. Fed versus fasting mesenteric flow, and stress flows.
