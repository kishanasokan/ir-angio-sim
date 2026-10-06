# 03 · Anatomy and variant generator

Status: drafted 2026-10-06 for milestone M2, which builds the visceral tree; the rest of the body (intracranial to the feet), disease modifiers and patient-specific sizing follow with the cases that need them. Decisions marked "(M2)" were made by Claude at the owner's request to choose with best practice. Depends on 02 (§9 anatomy).

## 1. Approach (M2)

Anatomy is **synthetic but built on sources** (spec 00 decision 2.4): a parametric base description in `/data` names every vessel, where it arises, its path, its caliber and what it feeds; a pure, deterministic generator turns it into an anatomy graph (`ir-sim/anatomy-graph@1`, spec 02 §9.2) at load. Everything downstream (lumen capsules, the flow network, rendering, the inspector) consumes graphs exactly as it consumed M1's phantoms. Variants are **graph edits** applied before generation.

Why generate rather than store finished graphs: calibers then keep their provenance (a vessel cites `reference.json`'s sourced caliber instead of copying a number), variants are small edits rather than whole copies, and spec 13's random cases can later sample variants and sizes from one description.

## 2. Base description (`data/anatomy/base/*.json`, schema `ir-sim/anatomy-base@1`)

```ts
type AnatomyBase = {
  schema: "ir-sim/anatomy-base@1"; id: string; name: string; units: "mm"; frame: "LPS";
  provenance: Fact;                                  // how the geometry was built
  spine: { levels: { id: string; z: Quantity }[];    // vertebral body centers (T10…S1), estimated
           center: [Quantity, Quantity];             // x, y of the vertebral column
           bodyRadius: Quantity; bodyHeight: Quantity };
  vessels: Vessel[];
  beds: { id: string; name: string; vessel: string;  // the vessel whose end feeds the bed
          flow: Quantity;                            // mean flow at rest
          timeConstant: Quantity;                    // Windkessel R·C (spec 07)
          transitTime: Quantity }[];                 // mean transit time for contrast washout (spec 07)
  access: { id: string; vessel: string; at: number; toward: "proximal" | "distal" }[];
  landmarks?: { id: string; kind: string; position: [Quantity, Quantity, Quantity] }[];   // femoral heads...
  variants: { id: string; label: string; edits: Edit[] }[];   // ids match reference.json variant entries
  instances: { id: string; name: string; variants: string[] }[];   // the graphs the generator registers
};
type Vessel = {
  id: string; name: string; territory: string;
  parent: string | null;
  origin?: { level: string } | { fraction: number };   // on the parent; root vessels give absolute points
  points: [number, number, number][];   // mm; absolute for roots, else offsets from the origin (first = 0,0,0)
  diameter: CaliberRef | Quantity;      // at the origin
  endDiameter?: CaliberRef | Quantity;  // linear taper (default: no taper)
  diameters?: { level: string; diameter: CaliberRef }[];   // roots only: calibers at vertebral levels
  end: "outlet" | "cap" | "continues";  // "continues" when children carry on from its end
};
type CaliberRef = { ref: string; field: string };   // e.g. { ref: "celiac-origin", field: "diameter" } in reference.json calibers
type Edit = { op: "reparent"; vessel: string; parent: string; origin: Origin; points: [number, number, number][] }
          | { op: "remove"; vessel: string } | { op: "resize"; vessel: string; diameter: Quantity };
```

The vessel points, levels and taper are anatomy claims, so they carry confidence through the file's `provenance` and per-quantity facts: `estimated` (typical adult anatomy, with a note), `sourced` through `CaliberRef`, or `placeholder`.

## 3. Generator (`src/data/anatomy/`)

1. Apply the instance's variant edits to the vessel list (in order).
2. Resolve origins: a `level` origin is the point of the parent's centerline at that level's z; a `fraction` is that fraction of the parent's path length.
3. Build each centerline: a centripetal Catmull–Rom curve through the points, resampled every `anatomy.centerlineSpacing` (design); radii interpolate linearly between the origin and end diameters (roots: between the level calibers).
4. Split every parent at its children's origins: each piece between branch points becomes a graph segment, each branch point a `junction` node, the root's start the `inlet`, ends `outlet` or `cap`; access points split their vessel too.
5. Emit the graph with `outlets` (bed ids and flows), `access` (direction: the centerline tangent toward the requested end), `landmarks` (vertebral levels and the base's landmarks) and tags (`name`, `territory`, `variant`).

The generator is pure and deterministic and uses only `+ − × ÷` and `sqrt` (it runs in `src/data`, outside the simulation, so `Math` is allowed, but the graph must be identical on every machine).

## 4. The visceral tree (M2)

`data/anatomy/base/visceral.json`: the abdominal aorta from T10 to its bifurcation at L4; both common iliacs; external iliacs to the common femoral arteries (the right CFA carries the access, retrograde); internal iliacs; the celiac trunk with the left gastric, splenic and common hepatic arteries, the GDA and the proper, right and left hepatic arteries; the SMA with the middle colic, two jejunal, ileocolic and terminal branches; both renal arteries; the IMA.

| Source of a value | Confidence |
| --- | --- |
| Aortic calibers at T12, L1 and L3, right CIA, celiac, SMA, IMA, CFA (`ymj-aorta`, `jcdr-mesenteric`, `ejr-open-le-cta`) | sourced through `CaliberRef` |
| Vertebral levels of the celiac (T12), SMA (L1), IMA (L3) | sourced (`jcdr-mesenteric`) |
| Hepatic artery flow, 550 mL/min (`deranged-hepatic-flow`) | sourced, split between the right and left hepatic beds by design |
| Other calibers (renal, hepatic branches, GDA, splenic, SMA branches, iliac branches), vessel paths, renal level, other bed flows | estimated, with notes; listed in the M2 summary for the medical reviewer |

**Variant (M2):** `hepatic-rrha-sma`, a replaced right hepatic artery from the SMA (Michels type III; frequency in `reference.json`). Instances: `visceral-standard` and `visceral-replaced-rha`.

## 5. Anatomy in the sandbox

The sandbox case lists the visceral instances next to the phantoms. A base anatomy's access is the right CFA; the sheath lies along the vessel there. Fluoroscopy shows the spine and pelvis and an elliptical body outline (spec 08); vessels show only with contrast.

## 6. Tests (M2)

Unit: the Catmull–Rom resampling passes through its points; level origins land at the level's z; a fraction origin at the right arc length; splitting gives one junction per branch point with matching positions; every segment starts and ends at its nodes and has one radius per point; a variant edit re-parents the right hepatic artery onto the SMA; generation is identical across runs; the validator accepts the base file and rejects a broken reference (fixtures for `bad-reference` and `graph`).

Golden: the lumen of the visceral tree contains a guidewire advanced from the right CFA to T12 (excursion below 0.05 mm), and the flow scenes of spec 07 run on it.

## 7. Open questions

1. A Western aortic caliber reference (the sourced aortic sizes come from a Korean cohort; reference.json notes it).
2. Female and age-dependent sizing (the data has female values; M2 uses male).
3. Venous anatomy, disease modifiers and the rest of the body.
