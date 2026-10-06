import { describe, expect, it } from 'vitest';
import type { SimDeviceSpec } from '../../src/sim/devices/instance';
import {
  catheterK,
  catheterStraight,
  drive,
  freeSpace,
  fullSpeed,
  MM,
  microcatheterM,
  sceneEngine,
} from './helpers';

// Golden scene 14 (spec 04 §7): device-in-device friction. In free space, microcatheter M starts 40 mm inside a
// catheter whose tip is 100 mm beyond the sheath, and is advanced 30 mm at 10 mm/s, then held. Sliding is kinematic,
// so friction changes no motion: it shows in the hub forces only.
// - The friction term is present only while the microcatheter slides, equal and opposite on the catheter's hub.
// - It is zero at μ = 0 and proportional to μ (the motion, and so the shape, does not depend on it).
// - It is larger through catheter K's 60° tip than through the straight catheter S.

const CATHETER_PAST = 100 * MM;
const START_INSIDE = 40 * MM;
const PUSH = 30 * MM;
const SPEED = 10 * MM;
const HOLD = 0.2;
const FRICTION_LOW = 0.1;
const FRICTION_HIGH = 0.2;

function slide(catheter: SimDeviceSpec, mu: number) {
  const engine = sceneEngine(
    freeSpace(),
    [
      { spec: catheter, pastSheathTip: CATHETER_PAST },
      { spec: microcatheterM(), pastSheathTip: CATHETER_PAST - START_INSIDE },
    ],
    mu,
  );
  const rate = engine.stepRate;
  const forces: number[] = [];
  let reaction = 0;
  drive(engine, Math.round((PUSH / SPEED) * rate), { innerPush: SPEED / fullSpeed().advance }, () => {
    forces.push(engine.device(1).frictionForce);
    reaction = Math.max(reaction, Math.abs(engine.device(1).frictionForce + engine.device(0).frictionForce));
  });
  let held = 0;
  drive(engine, Math.round(HOLD * rate), {}, () => {
    held = Math.max(held, Math.abs(engine.device(1).frictionForce), Math.abs(engine.device(0).frictionForce));
  });
  const mean = forces.reduce((sum, force) => sum + force, 0) / forces.length;
  return { mean, min: Math.min(...forces), held, reaction, solveFailures: engine.solveFailures };
}

describe('golden scene 14 · device-in-device friction', () => {
  it('adds friction to the hub forces only while sliding, in proportion to μ, more through a curved tip', () => {
    const curved = slide(catheterK(), FRICTION_LOW);
    const curvedHigh = slide(catheterK(), FRICTION_HIGH);
    const curvedNone = slide(catheterK(), 0);
    const straight = slide(catheterStraight(), FRICTION_LOW);
    console.info(
      `mean friction while sliding: through K ${(curved.mean * 1000).toFixed(3)} mN at μ ${FRICTION_LOW}, ` +
        `${(curvedHigh.mean * 1000).toFixed(3)} mN at μ ${FRICTION_HIGH}, ${curvedNone.mean} N at μ 0; ` +
        `through the straight catheter ${(straight.mean * 1000).toFixed(3)} mN`,
    );
    // Resistance while advancing, on the microcatheter's hub; the catheter's hub feels the same force as drag.
    expect(curved.min).toBeGreaterThan(0);
    expect(curved.reaction).toBe(0);
    // Nothing once the hand stops.
    expect(curved.held).toBe(0);
    expect(curvedNone.mean).toBe(0);
    expect(Math.abs(curvedHigh.mean / curved.mean - FRICTION_HIGH / FRICTION_LOW)).toBeLessThan(1e-9);
    expect(curved.mean).toBeGreaterThan(straight.mean);
    for (const run of [curved, curvedHigh, curvedNone, straight]) {
      expect(run.solveFailures).toBe(0);
    }
  });
});
