# IR Angio Suite Simulator

A free, browser-based, controller-first interventional radiology simulator for medical students, residents and fellows: real devices with real sizes and compatibility rules, wires and catheters that behave like physical rods inside vessels, DSA and a movable C-arm, variant anatomy, and complications that come from your own technique.

> **Educational simulation only.** This is not medical training, certification or medical advice, and it must not be used to plan or perform any procedure on a patient. Anatomy, devices and physiology are simplified models built from public sources and may be wrong. Device names are trademarks of their respective owners; this project is not affiliated with or endorsed by any manufacturer.

## Build status

Specification phase. Milestone **M1 (foundations)** is ready to build: scaffold, validated data layer and a rod-in-a-tube sandbox driven by a game controller. Nothing is playable yet.

| Milestone | What it delivers | Status |
| --- | --- | --- |
| M1 Foundations | Scaffold, data validator, device sandbox with three test phantoms | Ready to build |
| M2 Core systems | Visceral anatomy, three-device stack, fluoro and DSA, flow network | Specs to write |
| M3 First slice | Upper GI bleed with GDA embolization, end to end | Planned |
| M4 Second slice | Uterine fibroid embolization with particles and reflux | Planned |
| M5 Launch set | At least 12 cases, local saves, public release | Planned |

## Build it with Claude Code

1. Install Node.js LTS (22 or newer), Git and Claude Code.
2. In a terminal, go to this folder and run `claude --permission-mode plan`.
3. Follow the six sessions in [`prompts/M1-sessions.md`](prompts/M1-sessions.md): a plan, four build phases (A to D) and a final gate, each in a fresh conversation.
4. When the gate passes: `npm install && npm run dev`, open the local link in Chrome or Edge, and press **Watch a demo**.

## Run it

Available after M1: `npm install && npm run dev`. Other commands are listed in [CLAUDE.md](CLAUDE.md).

## Tests

Available after M1: `npm test` (unit and golden physics scenes), `npm run test:e2e` (Chromium), `npm run validate-data`.

## Repository layout

```
CLAUDE.md          Rules every coding session follows (disclaimer, no invented numbers, pure deterministic sim)
spec/              The specification set: 00 product brief, 01 architecture, 02 data schemas, index of 19 specs
prompts/           One build prompt per milestone (cath lab guide format) plus the Claude Code session prompts
data/              Every number the simulator uses, with units, confidence and sources
  sources.json       Source registry (79 entries)
  devices/           Guidewires, microcatheters, catheters, embolics, access, closure, therapeutic devices
  rules/             Machine-checkable compatibility rules
  anatomy/           Reference calibers, flows and variant frequencies; test phantoms
  imaging/           C-arm and table limits, imaging modes, dose thresholds, injection protocols, contrast limits
  patient/           Hemorrhage classes, sedation behavior, drug cart, contrast-reaction protocol
  physics/           Friction coefficients and material properties
  tuning/            Design values: solver settings, rod models, controller feel, display
  cases/             Case files (the M1 sandbox so far)
```

## Where the numbers come from

Every fact in `/data` has a confidence level. As of 2026-10-04 the seed data holds:

| Confidence | Meaning | Count |
| --- | --- | --- |
| sourced | Read on an opened page listed in `data/sources.json` | 818 |
| derived | Computed from sourced values, with the derivation noted | 17 |
| estimated | Standard knowledge or research notes, with a note | 42 |
| placeholder | No source yet; shown with a badge in the app | 66 |
| design | Deliberate engineering or feel choices | 117 |

Run `npm run validate-data` (after M1) for current counts. Corrections from clinicians are welcome: open an issue naming the data id, the correct value and a source.

## Controls (version 1)

Y switches between **Cath mode** (left stick drives the outer device, right stick the inner device: push and pull up and down, rotate left and right; LT fluoro, RT inject, LB DSA, RB device picker) and **Control mode** (triggers rotate the C-arm, left stick angulates, right stick pans the table, X opens drugs and sedation). Keyboard and mouse have full parity. Supported controllers: Xbox, DualSense and 8BitDo. Full maps are in [spec/00](spec/00-product-brief.md) §9 and the M1 prompt.

## Trademarks

Product names such as Glidewire, Progreat, Angio-Seal and Perclose are trademarks of their respective owners and are used only to identify the real devices the simulator models. This project is not affiliated with, sponsored by or endorsed by any manufacturer.

## License

[MIT](LICENSE) © 2026 Kishan Asokan.
