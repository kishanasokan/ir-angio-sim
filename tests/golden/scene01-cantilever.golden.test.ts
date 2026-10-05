import { describe, expect, it } from 'vitest';
import { bendingStiffness } from '../../src/data/catalog';
import { valueToSI } from '../../src/data/units';
import { freeSpace, MM, sceneEngine, settle, tipPosition, wireW } from './helpers';

// Golden scene 1 (prompts/M1-foundations.md §8): free space; wire W with 50 mm beyond the sheath tip (the clamp);
// tip load 0.01 N along +x on the most distal node. When settled, the tip deflection equals F·L³/(3·EI) = 1.43 mm
// within 5%.

const FORCE = 0.01;
const FREE_LENGTH = 50 * MM;
const TOLERANCE = 0.05;
const MAX_SETTLE_STEPS = 20_000;

describe('golden scene 1 · cantilever', () => {
  it('deflects F·L³/(3·EI) = 1.43 mm within 5%', () => {
    const engine = sceneEngine(freeSpace(), [{ spec: wireW(), pastSheathTip: FREE_LENGTH }]);
    const tipNode = engine.device(0).rod.segmentCount;
    engine.applyExternalForce(0, tipNode, [FORCE, 0, 0]);
    settle(engine, MAX_SETTLE_STEPS);

    const ei = bendingStiffness(valueToSI(9.5, 'GPa'), valueToSI(0.035, 'in'));
    const expected = (FORCE * FREE_LENGTH ** 3) / (3 * ei);
    expect(expected * 1e3).toBeCloseTo(1.43, 2);
    const deflection = tipPosition(engine, 0)[0];
    console.info(
      `tip deflection ${(deflection / MM).toFixed(4)} mm (expected ${(expected / MM).toFixed(4)} mm)`,
    );
    expect(Math.abs(deflection - expected) / expected).toBeLessThan(TOLERANCE);
    expect(engine.solveFailures).toBe(0);
  });
});
