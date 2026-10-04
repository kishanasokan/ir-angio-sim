# 02 · Data layer and schemas

Status: drafted 2026-10-04 with seed data that passes these rules. Every number the simulator uses lives in `/data`, carries its unit and a confidence level, and, when it claims to describe reality, points to a source in `data/sources.json`.

## 1. Principles

1. **One data source.** No clinical, anatomical, device or physical number is written in code. Code reads `/data`; design choices read `data/tuning/`.
2. **Provenance on every fact.** A fact is any object with a `confidence` field. Its children inherit its provenance.
3. **Clinical units in data, SI in the simulation.** Data keeps the units clinicians use (inches, French, cm, psi, mmHg); `src/data/units.ts` converts once at load.
4. **Honest gaps.** A missing value is entered as `placeholder` with a note and shown with a badge in the UI, never silently guessed.
5. **Validated before every build.** `npm run validate-data` runs before `build`, in CI, and in the test suite.

## 2. Layout of `/data`

| Path | Schema id | Holds |
| --- | --- | --- |
| `sources.json` | `ir-sim/sources@1` | Source registry |
| `devices/guidewires.json`, `microcatheters.json`, `catheters.json`, `embolics.json`, `access.json`, `closure.json`, `therapeutic.json` | `ir-sim/devices@1` | Device items, per-category rules, access sites |
| `rules/compatibility.json` | `ir-sim/rules@1` | Machine-checkable compatibility rules |
| `physics/materials.json` | `ir-sim/materials@1` | Friction coefficients, bulk material properties, data derivations |
| `anatomy/reference.json` | `ir-sim/anatomy-reference@1` | Calibers, flows, variant frequencies |
| `anatomy/phantoms/*.json` (later `anatomy/base/*.json`) | `ir-sim/anatomy-graph@1` | Vessel graphs |
| `imaging/imaging.json` | `ir-sim/imaging@1` | Gantry and table limits, modes, dose thresholds, injection protocols, contrast limits |
| `patient/physiology.json` | `ir-sim/physiology@1` | Hemorrhage classes, sedation behavior, monitor channels |
| `patient/drugs.json` | `ir-sim/drugs@1` | Drug cart and contrast-reaction protocol |
| `tuning/physics.json`, `input.json`, `render.json` | `ir-sim/tuning@1` | Design values and rod models |
| `cases/*.json` | `ir-sim/case@0` | Case files (version 0 covers the sandbox; spec 12 extends it) |

Every file starts with `"schema"`; most have a `"notes"` string explaining scope and known gaps.

## 3. Confidence levels

| Level | Meaning | Validator rule |
| --- | --- | --- |
| `sourced` | Taken from a page that was actually opened and read | `source` required; that source must have `opened: true` |
| `derived` | Computed or inferred from sourced inputs | `source` required (opened) and a `note` (or `text`) explaining the derivation |
| `estimated` | Best judgment from standard knowledge or the research notes, not yet tied to a page | `note` or `source` required |
| `placeholder` | Stands in for a real value that has no source yet | none; a `note` is strongly recommended. The UI shows a badge |
| `design` | A deliberate product or engineering choice that does not claim to describe reality | none |

A search-result snippet never counts as opened. Sources with `opened: false` may be cited in specs as method references, never by `sourced` or `derived` data.

## 4. Facts

### 4.1 Quantity fact

```ts
type Quantity = {
  value?: number | boolean | string;           // exactly one of value | options | (min and/or max)
  options?: (number | string)[];               // a catalog of choices (sizes, lengths, tip shapes)
  min?: number; max?: number;                  // a range; one bound alone means "at least" / "at most"
  unit?: Unit;                                 // required when any value is numeric
  sd?: number; tolerance?: number;             // same unit as the value
  confidence: Confidence; source?: SourceId; note?: string;
  // qualifiers: label, color, model, and nested qualifier quantities that inherit provenance,
  // for example {"usableLength": {"value": 110, "unit": "cm"}, "value": 0.461, "unit": "mL", ...}
};
```

Example: `{"value": 60.3, "sd": 0.9, "unit": "GPa", "confidence": "sourced", "source": "harrison2011"}`.

### 4.2 Text fact

`{"text": "Catheters advance in the vessel only over a wire.", "confidence": "sourced", "source": "radiologykey-tools"}`. Used for teaching points, steps, mechanisms and rules.

### 4.3 Record fact

A fact with neither `text` nor a value, whose other fields carry the content, for example a sheath hub color `{"label": "5F", "color": "gray", "confidence": "sourced", "source": "lsu-primer"}` or a plug size `{"model": "MVP-5Q", "vessel": {"min": 3, "max": 5, "unit": "mm"}, ...}`.

### 4.4 Selections

Objects under a `select` or `variant` key choose from an item's options or range: `{"diameter": {"value": 0.035, "unit": "in"}, "tipShapes": "angled"}`. They are choices, not claims, so they carry no confidence, unless the item lacks that property, in which case the selection must be a full fact (usually `placeholder`). The validator checks that a selected value is one of the item's options or inside its range, in the same unit.

### 4.5 Tuning files

In `ir-sim/tuning@1` files, unit-bearing objects without a confidence default to `design` (for example a section's `fromTip` of 0 mm). Anything there that describes a real device, such as a tip length, a curve's extent or a transition point, must carry its own confidence (`placeholder` or better).

## 5. Units

| Unit | Quantity | To SI |
| --- | --- | --- |
| `m`, `cm`, `mm`, `um` | length | 1, 1e-2, 1e-3, 1e-6 m |
| `in` | length (wire diameter, lumens) | 0.0254 m |
| `Fr` | French size (circumference-based catheter size) | 1/3 mm = 3.3333e-4 m of diameter |
| `G` | needle gauge (ordinal; use the needle's `outerDiameter` for geometry) | none |
| `deg`, `rad` | angle | π/180, 1 rad |
| `s`, `ms`, `min`, `h`, `day`, `week` | time | 1, 1e-3, 60, 3600, 86400, 604800 s |
| `Hz`, `1/s` | rate | 1 s⁻¹ |
| `mm/s`, `deg/s`, `m/s2` | speeds, acceleration | 1e-3 m/s, π/180 rad/s, 1 m/s² |
| `mL`, `L`, `uL` | volume | 1e-6, 1e-3, 1e-9 m³ |
| `mL/s`, `mL/min`, `L/min` | flow | 1e-6, 1.6667e-8, 1.6667e-5 m³/s |
| `psi`, `atm`, `mmHg`, `Pa`, `kPa`, `MPa`, `GPa` | pressure, modulus | 6894.757293168, 101325, 133.322387415, 1, 1e3, 1e6, 1e9 Pa |
| `N`, `gf` | force | 1, 9.80665e-3 N |
| `g`, `mg`, `ug`, `kg` | mass | 1e-3, 1e-6, 1e-9, 1 kg |
| `kg/m3` | density | 1 |
| `cSt` | kinematic viscosity | 1e-6 m²/s |
| `J` | energy | 1 |
| `mGy`, `Gy`, `Gy*cm2`, `Bq`, `GBq` | dose, kerma-area product, activity | 1e-3 Gy, 1 Gy, 1e-4 Gy·m², 1 Bq, 1e9 Bq |
| `%`, `1`, `count`, `px` | ratios, counts, screen pixels | dimensionless (`%` ÷ 100) |
| `mg/mL`, `mgI/mL`, `mg/vial`, `mOsm/kg`, `mg/dL`, `IU`, `IU/kg`, `IU/h`, `mg/kg`, `mL/kg/h`, `mL/min/1.73m2`, `g/(mL/min)` | clinical concentrations, doses and indices | kept in clinical units; compared only in their own unit |

An unknown unit fails validation. Tip load is in gram-force (`gf`), not grams.

## 6. Source registry

```json
{"id": "harrison2011", "title": "Guidewire Stiffness: What's in a Name? (Harrison et al., J Endovasc Ther 2011)",
 "url": "https://...", "type": "journal", "opened": true, "notes": "optional"}
```

`type` is one of `journal`, `textbook`, `teaching`, `manufacturer`, `ifu`, `listing`, `device-guide`, `guideline`, `course`, `web`, `software`, `dataset`. URLs are `https`. Ids are kebab-case and never reused. The top-level `accessed` date records when the registry was last checked.

## 7. Devices

### 7.1 Item

```ts
type DeviceItem = {
  id: string;                    // globally unique across device files, kebab-case, category prefix (gw-, mw-, mc-, cath-, emb-, needle-, set-, sheath-, closure-, pta-, ivcf-, snare-...)
  kind: string;                  // e.g. guidewire, microwire, microcatheter, selective-catheter, access-needle, sheath, closure-device
  genericName: string; brandName?: string; manufacturer?: string;
  role?: string;                 // guidewires: maneuver, rail, crossing...
  family?: Fact; design?: Fact; mechanism?: Fact;
  geometry?: Record<string, Fact>;      // diameters, lengths, tip shapes, curve geometry
  mechanics?: Record<string, Fact>;     // moduli, coatings, tip load
  ratings?: Record<string, Fact>;       // max pressure
  compatibility?: Record<string, Fact>; // max wire, max particle, max coil platform, DMSO
  teaching?: TextFact[]; steps?: TextFact[]; failureModes?: TextFact[];
  [other: string]: unknown;      // category-specific facts (sizes, dead space, activity...)
};
```

Each device file is `{"schema", "category", "notes", "items": DeviceItem[], "rules"?: TextFact[] with ids, "behaviorRules"?: TextFact[]}`. `access.json` also has `"sites"` (access sites with targets, frequencies and sequences).

### 7.2 Fields the simulation requires per kind

| Kind | Required for the sim (may be placeholder) |
| --- | --- |
| guidewire, microwire | `geometry.diameter`, `mechanics.bodyFlexuralModulus`, a rod model |
| catheter kinds | `geometry.outerDiameter`, `geometry.length`, `geometry.wireCompatibility` or an inner diameter, a rod model |
| microcatheter | `outerDiameterDistal`, `outerDiameterProximal`, `innerDiameter`, `usableLength`, `ratings.maxPressure` |
| sheath | `geometry.innerDiameter`, `geometry.length` |
| access-needle | `geometry.gauge`, `compatibility.maxWireDiameter` |
| closure-device | the sheath range for its vessel; `steps` before it gets an interactive sequence |

### 7.3 Device instance

The simulation never uses an item directly. `src/data/catalog.ts` builds a **device instance** from an item plus a rod model (§11.1): it applies the rod model's `variant` selections, resolves every needed quantity to one SI number, and keeps each value's provenance so the device inspector can show `sourced`, `estimated`, `placeholder` and `design` badges with their sources.

## 8. Rules

```ts
type Rule = {
  id: string; text: string;               // shown to the learner when the rule blocks something
  pair?: [string, string];                // roles the rule applies to (see the roles table)
  check: Check;
  failure: { mode: "block" | "block-or-friction" | "jam" | "degrade" | "rupture" | "warn" | "fail-closure"; message: string };
  confidence: Confidence; source?: SourceId; note?: string;
};
type Check =
  | { type: "lte" | "lt"; left: Path; right: Path; leftAgg?: "max" | "min"; rightAgg?: "max" | "min" }   // compare resolved values after unit conversion
  | { type: "all"; of: Check[] }
  | { type: "sum-lte"; terms: Path[]; limit: Path }
  | { type: "flag-required"; flag: Path; when: { path: Path; equals: string | number | boolean } }
  | { type: "device-specific"; field: Path }             // evaluated by named code in src/sim/rules/
  | { type: "state"; condition: string };                // a named predicate on simulation state
```

Paths are role-prefixed (`wire.`, `catheter.`, `parent.`, `microcatheter.`, `sheath.`, `needle.`, `particle.`, `coil.`, `plug.`, `agent.`, `balloon.`, `device.`, `closure.`, `injector.`, `access-site.`) followed by the property path in the device instance; `case.` reads the case file and `tuning.` reads `ruleParameters` in `data/tuning/physics.json`. Roles map to device kinds through the `roles` table in `data/rules/compatibility.json` (for example `catheter` covers `selective-catheter`, `flush-catheter`, `guide-catheter` and `infusion-catheter`). When a path resolves to an options list, the instance's selected value is used, unless the check names an aggregate (`leftAgg` or `rightAgg`: `max` or `min`); capability lists such as `wireCompatibility` use `max`. A rule that cannot be evaluated because a value is missing yields `unknown`, which the UI shows as a warning, never as a pass.

## 9. Anatomy

### 9.1 Reference (`anatomy/reference.json`)

`calibers[]` (vessel id, name, quantities by sex or age), `flows[]` (bed, flow and fractions), `variants[]` grouped by territory with a classification name and `entries[]` (id, label, frequency as a quantity fact), plus `*Gaps` placeholders listing what is still unsourced. Variant frequencies are sampling weights: the generator normalizes each territory's mutually exclusive entries and treats flagged entries (for example "two prostatic arteries on one side") as independent probabilities.

### 9.2 Anatomy graph (`ir-sim/anatomy-graph@1`)

```ts
type AnatomyGraph = {
  schema: "ir-sim/anatomy-graph@1"; id: string; name: string;
  units: "mm"; frame: "LPS";           // x = patient left, y = posterior, z = superior
  frameNote?: string;
  provenance: Fact;                    // design for phantoms; sourced or derived for real anatomy
  nodes: { id: string; position: [number, number, number]; kind: "inlet" | "junction" | "outlet" | "cap" }[];
  segments: {
    id: string; from: string; to: string;
    centerline: [number, number, number][];   // first and last points equal the from/to node positions
    radii: number[];                           // lumen radius at each centerline point, same length
    tags: { name: string; territory: string; variant?: string };
    wall?: Record<string, Fact>;               // compliance, thickness (spec 03)
    disease?: { kind: "stenosis" | "occlusion" | "calcification" | "aneurysm" | "tortuosity"; at: number; params: Record<string, Fact> }[];
  }[];
  outlets?: { node: string; bed: string; resistance?: Fact; flowFraction?: Fact }[];
  access: { id: string; node: string; kind: "sheath"; direction: [number, number, number] }[];
  landmarks: { id: string; position: [number, number, number]; kind: string }[];   // femoral head, vertebral levels
};
```

The lumen is the union of capsules around consecutive centerline points. Caps are closed ends; outlets continue into a lumped bed in the flow model. Variants are graph edits applied by the generator (spec 03): re-parent a segment (replaced right hepatic from the SMA), add or remove a segment, resize.

## 10. Imaging, physiology and drugs

- `imaging.json`: `gantry`, `table`, `rates`, `projections[]`, `modes[]`, `dose` (`metrics[]` with first notification, notification step and follow-up level; `skinEffects[]`; dose-saving behaviors), `injections.protocols[]`, `contrast` (agents, kidney limits), `injectionModelRules[]`.
- `physiology.json`: `hemorrhageClasses[]`, `hemorrhageModel[]`, `sedation[]`, `vasovagal`, policies, `monitorChannels`.
- `drugs.json`: `drugs[]` with `doses[]` (labeled quantity facts), optional `targets[]`, `maxTotal`, `components[]` (mixtures), `administration`, `warnings[]`; `contrastReactions[]` with ordered `steps[]` that reference drug ids. Pharmacodynamics are not in the data yet; spec 09 adds them as placeholders until sourced.

## 11. Tuning

### 11.1 Rod models (`tuning/physics.json` → `rodModels[]`)

```ts
type RodModel = {
  id: string; deviceId: string;                      // item in a device file
  variant: Selections;                               // §4.4
  materialId: string;                                // physics/materials.json bulk[]
  innerDiameter?: Fact;                              // tubes, when the item lacks it
  sections: {                                        // stiffness profile from the tip
    name: string; fromTip: Length; toTip: Length;
    youngsModulus?: Fact;                            // absolute, or
    youngsModulusRatio?: Fact;                       // relative to the item's body modulus (bodyYoungsModulusFrom)
  }[];                                               // a range ratio {min, max} means a linear ramp
  bodyYoungsModulusFrom?: string;                    // path in the item, e.g. mechanics.bodyFlexuralModulus
  restShape: { fromTip: Length; toTip: Length; bendAngle: Fact; toward?: "d1" | "d2" }[];   // uniform curvature turning the tip toward material axis d1 (default)
  frictionId: string; lumenFrictionId?: string;      // physics/materials.json friction[]
  radiopacity: { tipBoost: Fact; body: Fact };
};
```

Bending stiffness is computed, not stored: `EI = E·π·d⁴/64` for a wire and `EI = E·π·(dₒ⁴ − dᵢ⁴)/64` for a tube; torsional stiffness `GJ` with `J = 2I` and `G = E / (2(1 + ν))`.

A rest-shape region turns the tip by exactly `bendAngle`: the rotation is shared equally among the rod joints whose midpoints fall inside `[fromTip, toTip]` (if none does, the nearest joint takes all of it), so the total survives any segment length. A region's bend angle is measured as the angle between the tangent of the segment just proximal to the region and the tangent of the most distal segment.

`materialAssumption` (a text fact) records an assumed core material when the sources do not state it. `ruleParameters` holds design values that compatibility rules read through the `tuning.` prefix.

### 11.2 Other tuning

`solver` (step rate, substeps, segment length, damping, margins), `tiers[]`, `feedback` (meter thresholds), `input.json` (dead zone, response exponent, speeds, mouse factors, C-arm motion speeds, rumble mapping and event patterns), `render.json` (default pulse rate, noise, blur, vignette, colors, HUD refresh rate).

## 12. Cases (`ir-sim/case@0`)

Version 0 is the minimum the sandbox needs; spec 12 extends it with patients, step graphs, complications, endpoints, rubrics and autopilot scripts.

```ts
type CaseV0 = {
  schema: "ir-sim/case@0"; id: string; title: string; modes: ("sandbox" | "guided" | "independent" | "random")[];
  summary: string;
  anatomy: { options: string[]; default: string };            // anatomy-graph ids
  start: {
    sheath: { device: string; select: Selections; choices?: number[] }; at: string;   // access id
    insertion: { rodModel: string; tipBeyondAccess: Fact; hubRotation: Fact }[];        // initial tip depth past the sheath tip and hub angle
  };
  inventory: { rodModel: string }[];
  initialStack: string[];                                      // movable devices (rod-model ids), outermost first; the sheath is fixed
  targetDistance?: Fact;                                       // read by rules as case.targetDistance
  autopilot: { id: string; anatomy: string; description: string; params: Record<string, Fact> }[];   // scripts live in src/sim/autopilot/
  disclaimer: "required";
};
```

## 13. Runtime records

```ts
type InputFrame = {
  step: number;                       // first step at which this frame applies
  mode: "cath" | "control";
  axes: { outerPush: number; outerRotate: number; innerPush: number; innerRotate: number;   // -1..1 after curves
          carmRotate: number; carmAngulate: number; detector: number; tablePanX: number; tablePanY: number;
          tableHeight: number; collimation: number };
  triggers: { fluoro: number; inject: number };                 // 0..1
  buttons: string[];                                             // edge-triggered actions this frame: "toggle-mode", "lock-pair", "fine", "picker", "act", "back", "roadmap", "dsa", "view-3d", "pause"...
  source: "gamepad" | "keyboard" | "pointer" | "autopilot" | "replay";
};
type Command = { step: number; cmd: "swap-device" | "set-anatomy" | "reset" | "set-tier" | "start-autopilot" | "stop-autopilot"; args: Record<string, string | number> };
type InputLog = { schema: "ir-sim/input-log@1"; appVersion: string; dataHash: string; seed: number; caseId: string; anatomyId: string; settings: Record<string, number | boolean>; frames: InputFrame[]; commands: Command[] };
type Snapshot = { step: number; devices: { rodModel: string; positionsMm: Float32Array; insertedMm: number; hubRotationDeg: number; tipSegment: string | null; tipNormalForceN: number; hubForceN: number }[]; events: SimEvent[] };
```

Only frames that differ from the previous one are logged. Commands (device swaps, anatomy changes, resets, autopilot start and stop) are step-stamped and logged too, so a replay reproduces them. `dataHash` is a hash of `/data` so a replay refuses to run against different data.

Local saves (`localStorage`, keys prefixed `irsim:`): `settings` (input curves, dead zones, rumble strength, tier override, units display), `highscores` (case id and mode → best score and date), `replays` (recent input logs, capped by size). IndexedDB is used if replays outgrow `localStorage`.

## 14. Validation CLI

`npm run validate-data` (`scripts/validate-data.ts`, logic in `src/data/validate.ts`) checks, in order:

1. Every file parses and has a known `schema` id; each file passes its Zod schema.
2. Facts: confidence is one of the five levels; quantity shape (exactly one of value, options, range; min ≤ max); numeric values have a known unit; `sd` and `tolerance` are numbers.
3. Provenance: the §3 rules, including "sourced and derived cite only opened sources".
4. Unit-bearing objects without a confidence appear only inside a fact, a selection or a tuning file.
5. Ids: unique within each file; device ids unique across all device files; source ids unique.
6. References: rod models point at existing devices, materials and friction ids; selections match item options or ranges in the same unit, or carry their own confidence; cases point at existing anatomy graphs, rod models (inventory, stack and insertion) and sheath devices; rules use known roles; anatomy segments reference existing nodes, start and end at their node positions, and have one positive radius per centerline point.
7. Report (not an error): counts by confidence level per file, placeholders listed by file, sources never cited by `/data`.

Exit code 1 on any error. Tests run the validator on the repository data (must pass) and on `tests/fixtures/data-invalid/` (each fixture must fail with its expected error code).

## 15. Versioning

Schema ids carry a major version (`@1`). A breaking change bumps the version and ships a migration script in `scripts/migrations/`; the loader rejects unknown versions with a clear message. Input logs record `appVersion` and `dataHash`.

## 16. Open questions

1. Whether hub colors and similar display facts should move to a separate UI data file.
2. How to store per-patient generated anatomy for replays: regenerate from seed (preferred) or embed the graph in the log.
3. Pharmacodynamics schema for spec 09 (onset, peak, duration, effect curves).
