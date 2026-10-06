# 10 · Input and haptics

Status: drafted 2026-10-06 for milestone M2. M1 built the controller, keyboard and mouse maps of its prompt (§5) on one pure input path; M2 makes the imaging and injection inputs real and adds the injector console. Remapping, the torque-device mode and position control follow later (§6). Decisions marked "(M2)" were made by Claude at the owner's request to choose with best practice. Depends on 00 (§9), 01 (§3) and 02 (§13).

## 1. One input path (built in M1)

Gamepad, keyboard, mouse, autopilot and replay all become one `InputFrame` through pure mappers (`src/input/mapping/`); the arbiter merges live sources; frames are step-stamped and logged; the UI acts on the same frame. Golden rule 6 stands: no control bypasses it.

## 2. Frame changes (M2)

`InputFrame.triggers` gains `dsa` (0 or 1, held): LB in Cath mode, F on the keyboard. The `dsa` button action (an M1 toast) is removed. `inject` (RT, E) becomes the hand-injection plunger (spec 07 §3). Logs from M1 (without `dsa`) read it as 0.

## 3. Controller map (M2 changes in bold)

| Input | Cath mode | Control mode |
| --- | --- | --- |
| Left stick | Outer device of the active pair | Cranial/caudal; detector height |
| Right stick | Inner device of the active pair | Table pan |
| LT | Fluoro (hold) | Rotate RAO |
| RT | **Hand injection: rate ∝ trigger, capped by the catheter** | Rotate LAO |
| LB | **DSA run (hold); fires the armed power injector** | Fluoro while moving |
| RB | Device picker | Cycle field of view |
| D-pad | Up/down: active pair (three or more devices); left/right: field of view | Table height; collimation |
| A / B / X | Act / back / **roadmap from the last run** | Save angle / back / drugs |
| View / Menu | 3D view / pause (the pause menu has **Injector**) | Same |

## 4. Keyboard and mouse parity (M2 additions)

Cath mode: E hand injection (hold), **F DSA run (hold)**, R roadmap, **J injector console**. Both modes: **K arms or disarms the power injector**. The rest is M1's map.

## 5. Commands and the injector console (M2)

- `set-imaging {pulseRate, frameRate}` and `set-injector {protocol | rate, volume, riseTime, delay, armed}` are step-stamped commands, logged and replayed like `swap-device` (spec 02 §13), because they change what the simulation does.
- The **injector console** (J, or Injector in the pause menu) lists the protocols of `imaging → injections.protocols` with their sources, lets the learner adjust rate, volume, rise and delay within `tuning/input → injector` limits (design), shows the catheter's flow cap (spec 07 §3), and arms the injector. A protocol above the cap is allowed but shows the cap message; the delivered rate is capped.

## 6. Later

Remapping of buttons and keys, the torque-device rotation mode (spec 00 decision 4.4), position control (4.3), and rumble cues for injection and DSA.

## 7. Tests (M2)

Unit: LB and F hold `dsa`; RT and E give an analog `inject`; the console's commands round-trip through the input log; M1 logs without `dsa` still parse. End-to-end: holding the fake pad's LB runs DSA; J opens the console and arming shows on the HUD.
