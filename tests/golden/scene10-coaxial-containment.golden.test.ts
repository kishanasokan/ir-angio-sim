import { describe, expect, it } from 'vitest';
import { catheterK, coaxialGap, freeSpace, MM, sceneEngine, settle, wireW } from './helpers';
import { pullWireBehindCurve, SCENE9 } from './scene9';

// Golden scene 10 (prompts/M1-foundations.md §8): every wire node inside the catheter stays within (ID − d)/2 + 0.05 mm
// of the catheter centerline, checked after each full step. This file holds the scene 9 part (docs/M1-plan.md D14);
// the sandbox-c-left part arrives with the autopilot in phase C.

const MAX_SETTLE_STEPS = 40_000;

describe('golden scene 10 · coaxial containment', () => {
  it('keeps the wire inside the catheter through scene 9', () => {
    const catheter = catheterK();
    const wire = wireW();
    const engine = sceneEngine(freeSpace(), [
      { spec: catheter, pastSheathTip: SCENE9.catheterPast },
      { spec: wire, pastSheathTip: SCENE9.catheterPast + SCENE9.wireBeyond },
    ]);
    const limit = (catheter.segments.innerRadius[0] ?? 0) - (wire.segments.outerRadius[0] ?? 0) + 0.05 * MM;
    let worst = 0;
    const check = () => {
      worst = Math.max(worst, coaxialGap(engine, 0, 1));
    };
    check();
    settle(engine, MAX_SETTLE_STEPS, check);
    pullWireBehindCurve(engine, check);
    settle(engine, MAX_SETTLE_STEPS, check);
    console.info(
      `largest wire offset from the catheter centerline ${(worst / MM).toExponential(3)} mm (limit ${(limit / MM).toFixed(4)} mm)`,
    );
    expect(worst).toBeLessThanOrEqual(limit);
  });
});
