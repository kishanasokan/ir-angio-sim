import { describe, expect, it } from 'vitest';
import type { InputAxes } from '../../src/sim/core/records';
import type { SimDeviceSpec } from '../../src/sim/devices/instance';
import type { SimEngine } from '../../src/sim/engine';
import {
  cathFrame,
  catheterK,
  coaxialGap,
  fullSpeed,
  maxStretchError,
  microcatheterM,
  MM,
  phantom,
  sceneEngine,
  wireV,
} from './helpers';

// Golden scene 13 (spec 04 §7): the coaxial junction stays inextensible. In phantom C each stack advances its inner
// device 60 mm, follows with the outer one 40 mm, then pulls the inner one back 30 mm while rotating at half speed:
// catheter K + microcatheter M, catheter K + 0.014 in wire V, M + V, and all three (with pair moves and the lock).
// At every step every segment stays within 0.5% of its length with no failed solve, and every inner device stays on
// the centerline of the device around it within the clearance between them.

const STRETCH_LIMIT = 0.005;
const SPEED = 10 * MM;
const OUTER_PAST = 20 * MM;
const STAGGER = 10 * MM;

type Button = 'pair-up' | 'pair-down' | 'lock-pair';
interface Phase {
  readonly distance: number;
  readonly axes: Partial<InputAxes>;
  readonly buttons?: readonly Button[];
}

function run(devices: readonly SimDeviceSpec[], phases: readonly Phase[]) {
  const engine = sceneEngine(
    phantom('phantom-c-bifurcation'),
    devices.map((spec, d) => ({ spec, pastSheathTip: OUTER_PAST + d * STAGGER })),
  );
  const push = SPEED / fullSpeed().advance;
  let stretch = 0;
  let overshoot = Number.NEGATIVE_INFINITY;
  for (const phase of phases) {
    const steps = Math.round((phase.distance / SPEED) * engine.stepRate);
    for (let n = 0; n < steps; n += 1) {
      const axes: Partial<InputAxes> = Object.fromEntries(
        Object.entries(phase.axes).map(([key, value]) => [key, key.endsWith('Push') ? value * push : value]),
      );
      const frame = cathFrame(engine.currentStep, axes);
      engine.step(n === 0 && phase.buttons ? { ...frame, buttons: [...phase.buttons] } : frame);
      for (let d = 0; d < devices.length; d += 1) {
        stretch = Math.max(stretch, maxStretchError(engine, d));
      }
      for (let d = 1; d < devices.length; d += 1) {
        overshoot = Math.max(overshoot, coaxialGap(engine, d - 1, d) - clearance(engine, d - 1, d));
      }
    }
  }
  return { engine, stretch, overshoot };
}

function clearance(engine: SimEngine, outer: number, inner: number): number {
  return (engine.device(outer).rod.innerRadius[0] ?? 0) - (engine.device(inner).rod.outerRadius[0] ?? 0);
}

const TWO_DEVICE: readonly Phase[] = [
  { distance: 60 * MM, axes: { innerPush: 1 } },
  { distance: 40 * MM, axes: { outerPush: 1 } },
  { distance: 30 * MM, axes: { innerPush: -1, innerRotate: 0.5 } },
];

// The innermost pair starts active: the left stick drives the microcatheter, the right stick the wire.
const THREE_DEVICE: readonly Phase[] = [
  { distance: 60 * MM, axes: { innerPush: 1 } },
  { distance: 40 * MM, axes: { outerPush: 1 } },
  { distance: 20 * MM, axes: { outerPush: 1 }, buttons: ['pair-up'] },
  { distance: 30 * MM, axes: { innerPush: 1 }, buttons: ['pair-down', 'lock-pair'] },
  { distance: 30 * MM, axes: { innerPush: -1, innerRotate: 0.5 }, buttons: ['lock-pair'] },
];

describe('golden scene 13 · coaxial junction', () => {
  it.each([
    ['catheter K + microcatheter M', () => [catheterK(), microcatheterM()], TWO_DEVICE],
    ['catheter K + wire V', () => [catheterK(), wireV()], TWO_DEVICE],
    ['microcatheter M + wire V', () => [microcatheterM(), wireV()], TWO_DEVICE],
    ['catheter K + microcatheter M + wire V', () => [catheterK(), microcatheterM(), wireV()], THREE_DEVICE],
  ] as const)('stays inextensible with %s', (name, devices, phases) => {
    const { engine, stretch, overshoot } = run(devices(), phases);
    console.info(
      `${name}: largest stretch ${(stretch * 100).toExponential(3)}%, inner devices at most ` +
        `${(overshoot / MM).toFixed(4)} mm beyond their clearance, ${engine.solveFailures} failed solves`,
    );
    expect(stretch).toBeLessThan(STRETCH_LIMIT);
    expect(overshoot).toBeLessThanOrEqual(0);
    expect(engine.solveFailures).toBe(0);
  });
});
