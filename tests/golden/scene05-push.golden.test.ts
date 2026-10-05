import { describe, expect, it } from 'vitest';
import { drive, fullSpeed, highTier, MM, phantom, sceneEngine, settle, tipPosition, wireW } from './helpers';

// Golden scene 5 (prompts/M1-foundations.md §8): wire W in phantom A with μ = 0.2, tip 50 mm past the sheath tip.
// Advance 10 mm at 5 mm/s; the tip advances 10 ± 0.3 mm. No wall contact is expected; this checks insertion and
// inextensibility. Phantom A is straight along +z, so the tip's arc coordinate along its centerline is its z.

const ADVANCE = 10 * MM;
const SPEED = 5 * MM;
const MAX_SETTLE_STEPS = 20_000;

describe('golden scene 5 · push transmission', () => {
  it('advances the tip 10 ± 0.3 mm for a 10 mm hub advance', () => {
    const engine = sceneEngine(
      phantom('phantom-a-straight'),
      [{ spec: wireW(), pastSheathTip: 50 * MM }],
      0.2,
    );
    settle(engine, MAX_SETTLE_STEPS);
    const before = tipPosition(engine, 0)[2];
    drive(engine, Math.round((ADVANCE / SPEED) * highTier().stepRate), {
      innerPush: SPEED / fullSpeed().advance,
    });
    settle(engine, MAX_SETTLE_STEPS);
    const advance = tipPosition(engine, 0)[2] - before;
    console.info(`tip advance ${(advance / MM).toFixed(4)} mm for a 10 mm hub advance`);
    expect(Math.abs(advance - ADVANCE)).toBeLessThan(0.3 * MM);
    expect(engine.solveFailures).toBe(0);
  });
});
