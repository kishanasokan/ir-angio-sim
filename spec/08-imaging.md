# 08 · Imaging chain and C-arm

Status: drafted 2026-10-06 for milestone M2, which builds iodine in the fluoroscopic image, DSA runs, the roadmap, patient dose and the skeleton. Cone-beam CT, the 3D overlay, bolus chase, side-by-side review, pixel shift and remask, calipers and stored loops follow later. Decisions marked "(M2)" were made by Claude at the owner's request to choose with best practice. Depends on 01 (§7), 07 and M1's C-arm (`src/sim/imaging/carm.ts`).

## 1. Split between the simulation and the renderer (M2)

What must replay exactly lives in the deterministic engine: DSA run timing (mask and frame steps), injector firing, dose and fluoro time, and the contrast concentrations of spec 07. The image itself (pixels, noise, subtraction) is rendering on the main thread, driven by the snapshot. Settings that change the simulation (pulse rate, acquisition rate, the injector protocol, the contrast agent) travel as step-stamped, logged commands (`set-imaging`, `set-injector`; spec 02 §13), not as UI state.

## 2. Image formation (M2)

Every object adds optical depth (M1's model, spec 01 §7):

- **Devices:** M1's chord-length model with the distal radiopacity boost.
- **Body:** an elliptic soft-tissue cylinder around a base anatomy (`render → body`, design); phantoms keep M1's band.
- **Skeleton:** vertebral bodies at the anatomy's vertebral landmarks (cylinders with posterior elements) and the femoral heads, each with a bone optical depth per millimetre (`render → bone`, design). Vertebral levels are how operators find the celiac (T12) and SMA (L1), so they are worth their cost.
- **Iodine:** each vessel cell of spec 07 contributes `k_I · c · chord` (chord through the lumen from the surface normal, as for devices; `render → iodineDepthPerConcentration`, design calibration). Overlapping vessel tubes keep M1's maximum blending, so a junction does not count twice; crossing vessels therefore also show the denser one rather than their sum (open question 2).

The post pass (M1) turns depth into the image: gray from transmission, quantum noise scaled by the frame's dose, blur, vignette and collimation, pulsed at the fluoro pulse rate with last-image hold.

## 3. DSA (M2)

- **Run.** Holding DSA (LB, or F) starts a run: X-ray frames at the acquisition rate (`imaging → rates.acquisitionFrameRates`, default `render → dsa.defaultFrameRate`), the first frame the **mask**. The armed power injector fires `injector.delay` after the mask (spec 07). Releasing DSA ends the run.
- **Subtraction.** Each later frame shows `gray − gain · (D_frame − D_mask)`, the log subtraction of spec 01 §6 (`D` the optical depth): iodine shows dark on an even gray, and anything that did not move cancels. Devices that move between the mask and a frame leave misregistration, as on a real system.
- **Peak image.** The renderer keeps, per pixel, the strongest subtraction of the run; after the run the monitor holds it (the "best frame"), and it becomes the roadmap.
- **Noise.** DSA frames carry far more dose per frame than fluoro pulses, so their noise is lower (`render → dsa.noiseScale`).

## 4. Roadmap (M2)

After a DSA run, X (or R) toggles the roadmap: the run's peak image overlaid on live fluoro, vessels white (inverted), so devices show dark inside the map. The roadmap stores the C-arm and table pose of its run; any change of rotation, angulation, SID, zoom field or table position clears it with a message (`imaging → modes → roadmap`). Without a run, X keeps M1's outline stand-in for phantoms and shows a message for base anatomies.

## 5. Dose (M2)

Patient dose only (spec 00 §9), tracked in the engine per X-ray pulse or frame:

- Reference air kerma `Ka,r` at the interventional reference point (15 cm from the isocenter toward the source, `imaging → dose.metrics[kar].definition`): each fluoro pulse adds `dose.fluoroPerPulse` and each DSA frame `dose.dsaPerFrame` (placeholders), both scaled by `(field_ref / field)^dose.magnificationExponent` for the zoom field (placeholder) because automatic exposure control raises the dose for smaller fields.
- Kerma-area product `PKA = Σ ΔKa,r · A`, with `A` the collimated field area at the reference point (the field at the detector scaled by distance).
- Fluoro time (M1).
- Notifications at the SIR thresholds (`dose.metrics[].firstNotification` and `notificationStep`, sourced): a `dose-notification` event and a toast naming the metric and the threshold.

## 6. HUD (M2)

Beside M1's readouts: FLUORO, DSA (with frame count and rate) or LIH; the injector (armed, firing, delivered volume); the roadmap state; contrast used (mL and g iodine); Ka,r (mGy), PKA (Gy·cm²) and fluoro time.

## 7. Tests (M2)

Unit: dose increments per pulse and frame and their field scaling; the reference-point field area; threshold crossings emit one notification each; the DSA run's frame steps (mask first) at a given acquisition rate; roadmap invalidation by pose change.

Golden: D1, a DSA run with the injector produces a mask with no iodine and later frames with iodine downstream of the tip (from the snapshot's concentrations at the frame steps); D2, dose totals of a scripted session match the sum of their increments exactly.

End-to-end: a DSA run of the aortogram demo shows the DSA badge, counts frames, delivers the protocol volume and leaves a held image; the roadmap toggles on and clears when the C-arm moves; dose and contrast totals rise.

## 8. Open questions

1. Real image-quality calibration (iodine and bone depths, noise) against clinical images, with the IR reviewer.
2. True ray integration of iodine for crossing vessels (needs a distance-field or depth-peeling renderer).
3. Stored runs, side-by-side, pixel shift and remask, bolus chase, cone-beam CT and the 3D overlay.
