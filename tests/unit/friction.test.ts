import { describe, expect, it } from 'vitest';
import { quatFromAxisAngle } from '../../src/sim/math/quat';
import { buildRod } from '../../src/sim/rod/build';
import { arcOfNode } from '../../src/sim/rod/coaxial';
import { jointAngle, slidingFriction } from '../../src/sim/rod/friction';
import type { RodState } from '../../src/sim/rod/state';
import { catheterStraight, microcatheterM } from '../golden/helpers';

// Device-in-device friction (spec 04 §2.3) on a hand-built overlap: an outer rod whose joints m … M each bend by α
// (a circular arc between straight parts) and a uniform inner rod. Σθ = (M − m + 1)·α, and the curvature's second
// difference is α/l at the four joints around the arc's two ends and zero elsewhere, so
// F = μ · (|T|·(M − m + 1)·α + 4·EI·α / l²).

const ALPHA = 0.05;
const FIRST = 20;
const LAST = 39;
const MU = 0.1;
const LOAD = 0.3;

function bentRod(): RodState {
  const rod = buildRod(catheterStraight());
  for (let k = 0; k < rod.segmentCount; k += 1) {
    const turns = Math.min(LAST, Math.max(FIRST - 1, k)) - (FIRST - 1);
    quatFromAxisAngle(1, 0, 0, turns * ALPHA, rod.q, 4 * k);
  }
  return rod;
}

describe('device-in-device friction', () => {
  const outer = bentRod();
  const inner = buildRod(microcatheterM());
  const outerInserted = outer.segmentCount * outer.segmentLength;
  const innerInserted = outerInserted;
  const scratch = new Float64Array(6);
  const l = outer.segmentLength;
  const ei = inner.bendingStiffness[0] ?? 0;
  const all = [0, outerInserted] as const;

  it('reads joint angles from the segment frames', () => {
    expect(jointAngle(outer, FIRST - 1, scratch)).toBeCloseTo(0, 12);
    expect(jointAngle(outer, FIRST, scratch)).toBeCloseTo(ALPHA, 12);
    expect(jointAngle(outer, LAST, scratch)).toBeCloseTo(ALPHA, 12);
    expect(jointAngle(outer, LAST + 1, scratch)).toBeCloseTo(0, 12);
    expect(jointAngle(outer, 0, scratch)).toBe(0);
    expect(jointAngle(outer, outer.segmentCount, scratch)).toBe(0);
  });

  it('is the capstan term plus the curvature-change term over the overlap', () => {
    const force = slidingFriction(outer, outerInserted, inner, innerInserted, ...all, MU, LOAD, scratch);
    const expected = MU * (LOAD * (LAST - FIRST + 1) * ALPHA + (4 * ei * ALPHA) / (l * l));
    expect(Math.abs(force - expected) / expected).toBeLessThan(1e-9);
    // The load's sign does not matter: pushing and pulling round a bend rub alike.
    expect(
      slidingFriction(outer, outerInserted, inner, innerInserted, ...all, MU, -LOAD, scratch),
    ).toBeCloseTo(force, 15);
  });

  it('counts only the joints inside the overlap', () => {
    // An overlap ending just before the arc's first joint sees only the curvature change one joint ahead.
    const before = arcOfNode(outer, outerInserted, FIRST - 1);
    const partial = slidingFriction(outer, outerInserted, inner, innerInserted, 0, before, MU, LOAD, scratch);
    expect(Math.abs(partial - (MU * ei * ALPHA) / (l * l)) / partial).toBeLessThan(1e-9);
    // A straight overlap far from the arc rubs nothing.
    const straightEnd = arcOfNode(outer, outerInserted, FIRST - 3);
    expect(
      slidingFriction(outer, outerInserted, inner, innerInserted, 0, straightEnd, MU, LOAD, scratch),
    ).toBe(0);
  });

  it('is zero without friction or without an overlap', () => {
    expect(slidingFriction(outer, outerInserted, inner, innerInserted, ...all, 0, LOAD, scratch)).toBe(0);
    expect(slidingFriction(outer, outerInserted, inner, innerInserted, 0.2, 0.2, MU, LOAD, scratch)).toBe(0);
  });
});
