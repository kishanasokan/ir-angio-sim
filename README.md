# IR Angio Suite Simulator

A free, browser-based, controller-first interventional radiology simulator for medical students, residents and fellows: real devices with real sizes and compatibility rules, wires and catheters that behave like physical rods inside vessels, DSA and a movable C-arm, variant anatomy, and complications that come from your own technique.

> **Educational simulation only.** This is not medical training, certification or medical advice, and it must not be used to plan or perform any procedure on a patient. Anatomy, devices and physiology are simplified models built from public sources and may be wrong. Device names are trademarks of their respective owners; this project is not affiliated with or endorsed by any manufacturer.

## Build status

[![CI](https://github.com/kishanasokan/ir-angio-sim/actions/workflows/ci.yml/badge.svg)](https://github.com/kishanasokan/ir-angio-sim/actions/workflows/ci.yml)

Milestone **M1 (foundations)** is done. The device sandbox is playable in the browser:

- a wire and a 5F catheter, modeled as Cosserat rods, in three test phantoms
- a fluoroscopy-style view with pulsed frames, last-image hold, a contrast puff and a roadmap outline, plus a 3D view
- a HUD with the device stack, the resistance meter and the C-arm readouts
- sandbox setup that blocks incompatible devices with the rule and its source
- a device picker and a device inspector that shows every value's confidence and source
- three autopilot demos, and full controller, keyboard and mouse control

Two gate items wait for the project's final stage, by the owner's choice: the hands-on test drive on a laptop (below) and the medical review of the placeholder values. [docs/HANDOFF.md](docs/HANDOFF.md) has the details, and [docs/M1-plan.md](docs/M1-plan.md) ends with the M1 summary.

| Milestone | What it delivers | Status |
| --- | --- | --- |
| M1 Foundations | Scaffold, data validator, device sandbox with three test phantoms | Done; the test drive and the placeholder review wait for the final stage |
| M2 Core systems | Visceral anatomy, three-device stack, fluoro and DSA, flow network | Specs to write |
| M3 First slice | Upper GI bleed with GDA embolization, end to end | Planned |
| M4 Second slice | Uterine fibroid embolization with particles and reflux | Planned |
| M5 Launch set | At least 12 cases, local saves, public release | Planned |

### Performance

Physics cost from `npm run bench` (headless Node 24 on a Linux x64 build machine). The budget is 4 ms of physics per 16.7 ms frame:

| Run | High tier (1 kHz, 2 mm) | Standard tier (500 Hz, 4 mm) |
| --- | --- | --- |
| Golden scene 8: wire alone into phantom C | 5.2 to 5.8 ms per frame | 1.4 ms per frame |
| sandbox-c-left demo: wire and 5F catheter in phantom C | 8.2 ms per frame | 2.2 ms per frame |

At startup the app benchmarks the high tier at depth and picks the standard tier when the high tier is over budget, as it is on an Apple M2 laptop ([issue #3](https://github.com/kishanasokan/ir-angio-sim/issues/3)). Settings can override the choice.

Perf overlay in phantom C with the wire and the 5F catheter (P in the sandbox): **to be measured on the owner's laptop at the final stage**, as FPS, physics ms per frame, tier, backend, browser and machine.

## Build it with Claude Code

1. Install Node.js 24 (see `.nvmrc`), Git and Claude Code.
2. In a terminal, go to this folder and run `claude --permission-mode plan`.
3. Follow the six sessions in [`prompts/M1-sessions.md`](prompts/M1-sessions.md): a plan, four build phases (A to D) and a final gate, each in a fresh conversation. [docs/HANDOFF.md](docs/HANDOFF.md) says where the build stands.
4. When the gate passes: `npm ci && npm run dev`, open the local link in Chrome or Edge, and press **Watch a demo**.

## Run it

```sh
npm ci
npm run dev
```

Open the local link in Chrome or Edge, read the disclaimer, then **Enter sandbox** or **Watch a demo**.

- Connect a controller and press any button (Xbox, DualSense and 8BitDo pads work), or use the keyboard and mouse. The start screen and the pause menu show both control maps.
- In the sandbox: Y or C switches Cath and Control mode, LT or Space takes fluoro, RB or B opens the device picker, I opens the inspector, P the perf overlay, View or G the 3D view, and Menu or Esc pauses.
- `npm run build && npm run preview` serves the production build. With WebGPU missing, the app runs on WebGL 2 by itself; `?webgl=1` forces WebGL 2.
- Every push to `main` deploys the app to GitHub Pages once Pages is enabled in the repository settings, with "GitHub Actions" as the source.

Other commands are listed in [CLAUDE.md](CLAUDE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Tests

- `npm test` runs 213 unit tests and golden physics scenes in about a minute. The golden scenes check, among others, cantilever deflection, twist transmission, inextensibility, lumen containment, friction, torque lag, branch selection, coaxial bending, determinism with replay, and buckling.
- `npm run test:e2e` builds the app, serves the production preview and runs 10 end-to-end tests in Chromium on both WebGPU and WebGL 2, so 20 runs. They cover the start screen and disclaimer, all three demos (with rumble on a connected controller), a fake gamepad driving the wire and the C-arm, a blocked sheath, the device inspector, the perf overlay, the pause menu and the device picker's wire exchange. Every test fails on any console error.
- `npm run validate-data` checks every fact in `/data`.
- `npm run bench` prints the physics cost per tier.

CI runs all of them on every push and pull request.

## Contributing

Contributions from developers and clinicians are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), the golden rules in [CLAUDE.md](CLAUDE.md), and [docs/HANDOFF.md](docs/HANDOFF.md). Report a wrong clinical or device value with the **Data correction** issue form, and security problems through [SECURITY.md](SECURITY.md).

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

Every fact in `/data` has a confidence level. As of 2026-10-06 (`npm run validate-data`) the data holds:

| Confidence | Meaning | Count |
| --- | --- | --- |
| sourced | Read on an opened page listed in `data/sources.json` | 818 |
| derived | Computed from sourced values, with the derivation noted | 17 |
| estimated | Standard knowledge or research notes, with a note | 42 |
| placeholder | No source yet; shown with a badge in the app | 66 |
| design | Deliberate engineering or feel choices | 161 |

Run `npm run validate-data` for current counts. Corrections from clinicians are welcome: open an issue naming the data id, the correct value and a source.

## Controls (version 1)

Y switches between **Cath mode** (left stick drives the outer device, right stick the inner device: push and pull up and down, rotate left and right; LT fluoro, RT inject, LB DSA, RB device picker) and **Control mode** (triggers rotate the C-arm, left stick angulates, right stick pans the table, X opens drugs and sedation). Keyboard and mouse have full parity. Supported controllers: Xbox, DualSense and 8BitDo. Full maps are in [spec/00](spec/00-product-brief.md) §9 and the M1 prompt.

## Trademarks

Product names such as Glidewire, Progreat, Angio-Seal and Perclose are trademarks of their respective owners and are used only to identify the real devices the simulator models. This project is not affiliated with, sponsored by or endorsed by any manufacturer.

## License

[MIT](LICENSE) © 2026 Kishan Asokan.
