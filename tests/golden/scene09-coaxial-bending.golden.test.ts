import { describe, expect, it } from 'vitest';
import { bendAngle, catheterK, DEG, freeSpace, sceneEngine, settle, wireW } from './helpers';
import { pullWireBehindCurve, SCENE9 } from './scene9';

// Golden scene 9 (prompts/M1-foundations.md §8): free space; catheter K with 100 mm beyond the sheath tip, wire W
// inside with its tip 10 mm beyond the catheter tip. When settled, the catheter's bend angle is
// 60°·EIc/(EIc + EIw) = 31.9° within 15%. Pull the wire back until its tip is 50 mm proximal to the curve: when
// settled, the bend is at least 57°.

const MAX_SETTLE_STEPS = 40_000;

describe('golden scene 9 · coaxial bending', () => {
  it('straightens the catheter curve with the wire in, and the curve re-forms when the wire is pulled back', () => {
    const catheter = catheterK();
    const wire = wireW();
    const engine = sceneEngine(freeSpace(), [
      { spec: catheter, pastSheathTip: SCENE9.catheterPast },
      { spec: wire, pastSheathTip: SCENE9.catheterPast + SCENE9.wireBeyond },
    ]);
    settle(engine, MAX_SETTLE_STEPS);
    const catheterEI = catheter.segments.bendingStiffness[0] ?? 0;
    const wireEI = wire.segments.bendingStiffness[0] ?? 0;
    const expected = 60 * DEG * (catheterEI / (catheterEI + wireEI));
    const straightened = bendAngle(engine, 0);
    expect(Math.abs(straightened - expected) / expected).toBeLessThan(0.15);

    pullWireBehindCurve(engine);
    settle(engine, MAX_SETTLE_STEPS);
    const reformed = bendAngle(engine, 0);
    console.info(
      `bend with wire ${(straightened / DEG).toFixed(2)}° (expected ${(expected / DEG).toFixed(2)}°), after pull-back ${(reformed / DEG).toFixed(2)}°`,
    );
    expect(reformed).toBeGreaterThanOrEqual(57 * DEG);
    expect(engine.solveFailures).toBe(0);
  });
});
