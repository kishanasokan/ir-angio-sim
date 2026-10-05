import { describe, expect, it } from 'vitest';
import { findSegment } from '../../src/sim/anatomy/graph';
import { drive, fullSpeed, highTier, MM, phantom, sceneEngine, tipArc, wireW } from './helpers';

// Golden scene 6 (prompts/M1-foundations.md §8): wire W in phantom B, tip 10 mm before the bend. Advance 60 mm at
// 10 mm/s with μ = 0, 0.1 and 0.2. The mean hub force over the last 20 mm strictly increases with μ; at μ = 0 the
// tip advance (along the centerline) is within 2 mm of the hub advance.

const BEND_START = 100 * MM;
const ADVANCE = 60 * MM;
const SPEED = 10 * MM;
const LAST = 20 * MM;
const FRICTIONS = [0, 0.1, 0.2];

describe('golden scene 6 · friction raises push force', () => {
  it('needs more hub force with more friction, and at μ = 0 the tip follows the hub', () => {
    const anatomy = phantom('phantom-b-bend');
    const centerline = findSegment(anatomy, 'b-main');
    const steps = Math.round((ADVANCE / SPEED) * highTier().stepRate);
    const lastFrom = Math.round(((ADVANCE - LAST) / SPEED) * highTier().stepRate);
    const results = FRICTIONS.map((mu) => {
      const engine = sceneEngine(anatomy, [{ spec: wireW(), pastSheathTip: BEND_START - 10 * MM }], mu);
      const start = tipArc(engine, 0, centerline);
      let sum = 0;
      let count = 0;
      let n = 0;
      drive(engine, steps, { innerPush: SPEED / fullSpeed().advance }, () => {
        n += 1;
        if (n > lastFrom) {
          sum += engine.device(0).hubForce;
          count += 1;
        }
      });
      expect(engine.solveFailures).toBe(0);
      return { mu, hubForce: sum / count, tipAdvance: tipArc(engine, 0, centerline) - start };
    });
    console.info(
      results
        .map(
          (r) =>
            `μ ${r.mu}: mean hub force ${r.hubForce.toFixed(4)} N, tip advance ${(r.tipAdvance / MM).toFixed(2)} mm`,
        )
        .join('\n'),
    );
    const [frictionless, low, high] = results;
    expect(low!.hubForce).toBeGreaterThan(frictionless!.hubForce);
    expect(high!.hubForce).toBeGreaterThan(low!.hubForce);
    expect(Math.abs(frictionless!.tipAdvance - ADVANCE)).toBeLessThan(2 * MM);
  });
});
