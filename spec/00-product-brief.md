# 00 · Product brief

Status: drafted 2026-10-04 from the planning questionnaire (all 99 answers). Owner: Kishan Asokan. Medical validation: the owner now, an IR attending eventually.

## 1. What it is

A free, browser-based interventional radiology angio suite simulator that teaches the whole vascular case: access, catheter and wire navigation, selective and superselective catheterization, DSA, embolization and other treatments, closure, and the debrief. Devices are real products with real sizes and real compatibility; wires and catheters are physical rods inside vessels, so steering is learned by feel, not by menu. A game controller is the primary input: one stick per hand on the device stack, triggers for imaging and injection.

It is a teaching tool for medical students and trainees, published on GitHub and hosted as a static site. It is not sold.

## 2. Disclaimer (exact text, shown on the start screen and in the README)

> Educational simulation only. This is not medical training, certification or medical advice, and it must not be used to plan or perform any procedure on a patient. Anatomy, devices and physiology are simplified models built from public sources and may be wrong. Device names are trademarks of their respective owners; this project is not affiliated with or endorsed by any manufacturer.

## 3. Audience

| Learner | What they need from it |
| --- | --- |
| Fourth-year medical students (MS4) | Guided cases: why each step, which tool, where to go; anatomy labels and highlights |
| Diagnostic and IR residents | Independent cases with real choices and consequences; device and anatomy fluency |
| IR fellows | Harder anatomy (variants forced on), efficiency, dose and contrast discipline |

Learner-friendly first (1.2): every teaching claim is accurate and cited.

## 4. Principles

1. **Teach the why.** Guided mode explains each step, its justification, how the tool works and how to decide, with sources (1.2, 6.4).
2. **Real numbers or an honest gap.** Every value comes from `/data` with a confidence level and source; placeholders are labeled in the UI (golden rule 2).
3. **Physics where it changes the hands or the image**, calibrated rules elsewhere (decision 5): rods for devices, a 1D flow network for blood and contrast, Beer–Lambert projection for X-ray.
4. **Nothing is an ordeal.** Swaps, sedation and drugs take one or two button presses (4.12, 6.2).
5. **Blocked, with a reason.** Anything a real lab would not allow is blocked and explained; there is no wetting step (3.4).
6. **Consequences come from actions.** No random complications unless a case defines one (2.9, 3.7).
7. **Play through the X-ray.** The screen is what the monitor shows; there is no 3D room (1.14, 5.1).

## 5. Modes

| Mode | Rules |
| --- | --- |
| Guided tutorial | Step list with learn-more panels (justification, why, how it works, how to decide), cited. A built-in instructor suggests access, sheath, catheter and embolic choices (2.6). If you struggle, a hint highlights the target branch and names the best catheters and wires (6.5). Can pause before a crash so you work out the fix (1.15). |
| Independent case | Same patient, exam rules: free choices, no hints, no highlights; the HUD stays (5.11). |
| Random case | The sim deals a presentation (trauma of pelvis, spleen, liver or kidney; GI bleed from an unknown source; hemoptysis; postpartum hemorrhage; acute limb ischemia) with HPI, vitals, labs and key CT images; you choose the diagnostic runs and the treatment (1.5). |
| Drills | Short teaching cases that explain exactly how, everything cited: catheter-selection drills, coil packing, crossing a stenosis, the femoral stick (2.10). |
| Sandbox | Free device play in test phantoms and anatomy (from milestone M1). |

"Instructor-led" (1.5) means the guided tutorial's built-in instructor; human instructor tools are off (6.9).

Every case offers an anatomy toggle: normal anatomy only, variants only, or real-life variant frequencies (2.3).

## 6. Scope

**In (vascular first, 1.7):** bleeds of all kinds, interventional oncology, peripheral arterial disease, genicular, prostatic and uterine artery embolization, IVC and portal work, carotids, diagnostic cerebral angiography and neuro IR (1.8), splenic work, venous work including PE thrombectomy, TIPS and BRTO, fistulograms with angioplasty and stenting (2.12), and some pediatric cases such as AVMs (2.11).

**Later:** non-vascular fluoroscopic work (1.7); an optional cardiac track of PCI, TAVR and MitraClip as its own case pack (5.10; the owner's existing PCI simulator stays a separate project, 1.10); a case editor (2.15); CO2 angiography (3.10).

**Out:** dialysis access creation, ports, tunneled lines and PICCs (2.12); CT- or ultrasound-guided work outside the suite (1.9); consent, time-out and pain reports (1.14, 2.5); voice and team communication (6.4, 6.13); multiplayer; operator and staff dose (5.7); biplane (5.6); VR (4.11); foot pedals (4.13); adaptive triggers and custom hardware (4.7, 4.8); accessibility modes (4.14); leaderboards, instructor tools and exportable results (6.8–6.10); accounts, cloud saves, analytics and offline install (7.5, 7.6, 7.9).

## 7. Case library

Twelve launch cases are the minimum; build as many as possible (2.1). Each case is one spec in document 13.

| # | Case | Access | Key devices | Skill tested |
| --- | --- | --- | --- | --- |
| 1 | Upper GI bleed: GDA embolization (first slice, 2.2) | CFA | Cobra or Sos, microcatheter, 0.018 in coils, Gelfoam | Front- and back-door coiling, variant hepatic anatomy |
| 2 | Lower GI bleed: superselective SMA or IMA branch | CFA | Microcatheter, microwire, microcoils | Superselection without bowel ischemia |
| 3 | Splenic trauma | CFA | Plug or coils (proximal), microcoils (distal), cone-beam CT | Proximal versus distal strategy |
| 4 | Pelvic fracture hemorrhage | CFA | Omni Flush up-and-over, Cobra, Gelfoam, coils | Crossover, Waltman loop, bilateral survey |
| 5 | Uterine fibroid embolization (second slice) | CFA or radial | Cobra or Roberts uterine catheter, microcatheter, 500–900 µm spheres | Bilateral selection, endpoints, ovarian supply |
| 6 | Prostatic artery embolization | CFA or radial | Microcatheter, cone-beam CT, protective coils, spheres | Variant origins, collaterals, non-target protection |
| 7 | Genicular artery embolization | Antegrade CFA | Microcatheter, small particles | Tiny-vessel selection and endpoint |
| 8 | Hepatic TACE, conventional and beads | CFA or radial | Microcatheter, Lipiodol or beads, cone-beam CT | Tumor feeders, variant anatomy, stasis endpoints |
| 9 | Y-90 mapping and treatment | CFA or radial | Microcatheter, coils, MAA, Y-90 | Extrahepatic branches; dosing explained once in guided mode (2.13) |
| 10 | IVC filter placement and retrieval | Femoral or jugular vein | Venacavogram, filter, snare | Renal vein levels, IVC size, retrieval |
| 11 | Iliac and SFA disease: angioplasty and stent | CFA | Crossover sheath, 0.035 and 0.018 in balloons, stents | Lesion crossing, sizing, dissection management |
| 12 | Diagnostic cerebral angiography | CFA or radial | Headhunter, vertebral or Simmons-type catheters | Arch navigation, four-vessel study, standard views |

Candidates after the launch set (order to be decided): carotid stenting with embolic protection, TIPS, BRTO or PARTO, portal vein embolization, renal bleed and angiomyolipoma, hepatic trauma, bronchial artery embolization, postpartum hemorrhage, visceral and splenic artery aneurysm, type II endoleak, PE thrombectomy, iliofemoral DVT and May-Thurner stenting, acute limb ischemia, SFA or tibial CTO with pedal access, fistulogram with angioplasty and stenting, varicocele or ovarian vein embolization, pulmonary AVM, stroke thrombectomy, intracranial aneurysm coiling, middle meningeal artery embolization, AVMs and vascular malformations (pediatric and adult), adrenal vein sampling, transjugular liver biopsy with pressures, thoracic duct embolization, complex filter retrieval and foreign-body snaring, renal artery stenosis or FMD, REBOA in trauma. The case mix follows the CIRSE curriculum (`cirse-curriculum-2023`).

**Case flow.** Short vignette with HPI, labs and key CT images, no time-out (2.5) → sedation and heparin decisions → access → diagnostic runs → selective and superselective catheterization → treatment → completion angiogram → closure → debrief. Branching outcomes such as rebleeding that needs a second embolization or conversion to surgery (2.7). Bleeding worsens while you work in trauma and bleeding cases (2.8). The debrief shows consequences such as post-embolization syndrome, ischemic injury and the 30-day outcome (2.14). Oncology agents are selectable without dosimetry, lung-shunt calculation or emulsion preparation (2.13).

## 8. Devices

- Brand and generic names shown together (3.1), with the trademark notice.
- A curated core that includes every device the cases need, each with its full size range (3.2).
- Similar devices feel different through their physics parameters: Glidewire versus Bentson versus Rosen; Progreat versus Renegade (3.3).
- Compatibility is enforced by the rules in `data/rules/compatibility.json`; mistakes such as a Ruby coil in a non-Lantern catheter have real consequences (3.12).
- Tip shaping for microwires and catheter curves is an option when you select the tool (3.5).
- Inventory per case is what a real lab would stock; the sandbox is unlimited; cost tracking is optional (3.6).
- Device failure (wire fracture, kink, glued catheter) happens only when the learner causes it (3.7).
- Flushing, de-airing and sterility are quick actions; skipping them can cause air embolism, with a warning in guided mode (3.8).
- Closure devices are short interactive procedures with their real steps (3.11).
- Embolics in version 1: coils, plugs, Gelfoam, PVA, microspheres, Lipiodol, NBCA, Onyx, sclerosants, Y-90, ethanol and thrombin (3.13). Ethanol and thrombin still need data.
- Power injector: full console with presets (3.9, default).

## 9. Imaging, screen and controls

**Screen.** One X-ray-first screen with Siemens-style conventions and no branding (5.1, 5.8). Buttons for roadmap and for side-by-side with your last still or last run (5.9). A button toggles a 3D anatomy view in any mode (5.2). A patient silhouette appears only when moving the C-arm needs it (1.14). The HUD keeps everything relevant: device stack with lengths, tip location, resistance meter, contrast and dose totals, timers (5.11). Style: modern and sleek with video-game touches, visually appealing, never crowded or loud (1.12, 5.12).

**Imaging.** Realistic images: noise, bones, bowel gas and motion artifact (5.3). Fluoroscopy, DSA, roadmap, last-image hold, stored fluoro, bolus chase, cone-beam CT, 3D overlay, pixel shift and remask, calipers (5.4). Single-plane C-arm free within real limits (5.5, 5.6). Patient dose only (5.7). Sounds: monitor tones, alarms and the injector; no voice (5.10).

**Controls (version 1).** Y switches between Cath mode and Control mode (5.1, 6.2).

| Input | Cath mode | Control mode |
| --- | --- | --- |
| Left stick | Outer device of the active pair: up/down push and pull, left/right rotate; click for fine | Up/down cranial and caudal; left/right detector height |
| Right stick | Inner device of the active pair; click locks the pair | Table pan |
| LT | Fluoro (hold) | Rotate RAO |
| RT | Analog plunger: inject or inflate | Rotate LAO |
| LB | DSA (hold; fires the armed injector) | Fluoro while moving |
| RB | Quick device picker | Cycle field of view |
| D-pad | Up/down: active pair along the stack; left/right: zoom | Up/down: table height; left/right: collimation |
| A / B / X | Act (hold to detach) / back / roadmap (hold: side-by-side) | Save angle / back / drugs and sedation |
| View / Menu | 3D anatomy / pause | 3D anatomy / pause |

Keyboard and mouse have full parity (4.9); the full binding table is in spec 10 and the M1 prompt. Supported controllers: Xbox, DualSense and 8BitDo (4.6), including on tablets (4.10). Rate control with response curves, position control as an option (4.3); continuous rotation with an optional torque-device mode (4.4, default). Haptics are rumble only, always backed by sight and sound (4.7).

## 10. Patient and pharmacology

Vitals, hemorrhage and drugs (6.1). Moderate sedation is given with buttons in Control mode (6.2). Heparin, ACT and protamine are part of the case, and guided mode explains them (6.3). Contrast volume and iodine are tracked against kidney limits. A full bleed-out or crash ends the case (1.15).

## 11. Scoring and debrief

Scores weigh real-world factors: time, radiation (reference air kerma, kerma-area product, fluoroscopy time), contrast, safety errors and the outcome (1.12). Safety errors weigh most and a few are automatic fails, such as non-target embolization of a critical territory or patient death (6.6). High scores are kept per case and mode on the device only; there are no leaderboards (6.8). The debrief shows the metrics, dose against the SIR thresholds (`sir-dose-2009`) and a replay timeline; it shows no expert-run comparison or guideline citation list (6.7), while guided-mode teaching content stays cited.

## 12. Platform

| Item | Decision |
| --- | --- |
| Build team | The owner plus Claude (7.1); no deadline, built for fun (7.2) |
| Minimum hardware | 2020-or-newer laptop with integrated graphics on a reduced-fidelity tier (7.3) |
| Browsers | Chrome and Edge first; Safari and Firefox through fallbacks (7.4) |
| Saves | Local only (7.6) |
| Price | Free (7.7) |
| Code | Public on GitHub (7.8); MIT license (default, changeable) |
| Hosting | Static hosting such as GitHub Pages (7.11) |
| Analytics | None (7.9) |

## 13. Success measures

1. The launch set of at least 12 cases, each completed by its autopilot and by a human, with no console errors.
2. An IR attending calls the wire and catheter feel credible (gate 3) and the flow-directed embolics plausible (gate 5).
3. Performance budgets in spec 01 met on a 2020 laptop.
4. Every number in `/data` is sourced, derived, estimated with a note, a labeled placeholder, or a design choice; the placeholder count falls with each release.

## 14. Decision log

| Q | Decision |
| --- | --- |
| 1.1 | MS4 students, IR fellows, IR and DR residents |
| 1.2 | Teaching tool with step-by-step guides, anatomy identification and highlights, and tool tips; accurate and learner-friendly |
| 1.4 | Twelve-case launch set as the goal; no fixed timeline |
| 1.5 | Guided tutorial, case mode, built-in instructor per case, random cases |
| 1.6 | Strictly educational with a disclaimer |
| 1.7–1.10 | Vascular first; neuro in; no CT/US-guided work; PCI simulator stays separate |
| 1.11 | US conventions with metric shown alongside |
| 1.12, 5.12 | Clinical and serious content, sleek game-like UI, scores and per-case high scores |
| 1.14, 1.15 | No patient presence beyond a silhouette; mistakes play out in the vitals; guided mode can pause |
| 2.1–2.16 | Case catalog above; GDA first; variant toggle; synthetic anatomy built on real sources; no time-out; guided suggestions; branching outcomes; worsening bleeds; no random complications; cited drills; some pediatric cases; venous work except dialysis access, ports and lines; selectable oncology agents without dosimetry; consequences in the debrief; editor later |
| 3.1–3.17 | Devices section above; power injector and missing-device questions left at defaults |
| 4.1–4.14 | Version 1 controller map kept; rate control; separate fluoro and DSA; Xbox, DualSense, 8BitDo; full keyboard and mouse parity; tablets with a controller; one-press swaps; no pedals, VR, adaptive triggers, custom hardware or accessibility modes |
| 5.1–5.12 | Imaging and screen section above, including the 3D overlay in version 1 |
| 6.1–6.13 | Vitals, hemorrhage and drugs; sedation by buttons; heparin and ACT taught; text-only guidance with learn-more panels; hints on request; debrief comparison, leaderboards, instructor tools and exports off; IR attending validation later; no team communication |
| 7.1–7.12 | Platform section above; repository, specs and first milestone prompt set up |

## 15. Interpretations to confirm

These answers were short or blank, so the brief reads them as follows. Say the word and they change.

1. **Instructor-led (1.5) with instructor tools off (6.9):** the guided tutorial's built-in instructor, not a human instructor.
2. **Debrief off (6.7):** no expert-run comparison and no guideline citation list in the debrief; guided teaching content stays cited.
3. **Embolics "Yes" (3.13):** every listed agent in version 1, including ethanol and thrombin.
4. **Tablets "Yes" (4.10):** controller play on tablets; touch-only play not planned.
5. **HUD (5.11):** the HUD stays in exam mode; exam mode hides hints, highlights and step lists only.
6. **Cardiac track (5.10):** a later optional case pack inside this product, while the existing PCI simulator stays separate (1.10).
7. **Defaults for blanks:** full injector console with presets (3.9); continuous rotation with an optional torque-device mode (4.4); no extra devices requested (3.17).
8. **License:** MIT, chosen as the default for a public GitHub repository.
