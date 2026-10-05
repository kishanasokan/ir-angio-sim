import { describe, expect, it } from 'vitest';
import { findSegment } from '../../src/sim/anatomy/graph';
import {
  cathFrame,
  DEG,
  drive,
  fullSpeed,
  highTier,
  MM,
  phantom,
  RotationTracker,
  sceneEngine,
  settle,
  tipArc,
  wireW,
} from './helpers';

// Golden scene 7 (prompts/M1-foundations.md §8): wire W in phantom B with its tip 40 mm beyond the end of the bend.
// Rotate the hub at 180°/s for 2 s with μ = 0, 0.1 and 0.2; the largest lag (φ minus tip rotation) strictly increases
// with μ. Setup (docs/M1-plan.md D15): the wire is fed in at 10 mm/s with the scene's μ until its tip is 40 mm past
// the bend, then settles before the hub turns.

const BEND_END = 100 * MM + 30 * MM * (Math.PI / 2); // phantom B: 100 mm straight, then a 90° bend of 30 mm radius
const FEED_SPEED = 10 * MM;
const TURN_RATE = 180 * DEG;
const TURN_SECONDS = 2;
const MAX_FEED_STEPS = 20_000;
const MAX_SETTLE_STEPS = 20_000;
const FRICTIONS = [0, 0.1, 0.2];

describe('golden scene 7 · torque lag', () => {
  it('lags the tip further behind the hub with more friction', () => {
    const anatomy = phantom('phantom-b-bend');
    const centerline = findSegment(anatomy, 'b-main');
    const lags = FRICTIONS.map((mu) => {
      const engine = sceneEngine(anatomy, [{ spec: wireW(), pastSheathTip: 80 * MM }], mu);
      for (let n = 0; tipArc(engine, 0, centerline) < BEND_END + 40 * MM; n += 1) {
        expect(n).toBeLessThan(MAX_FEED_STEPS);
        engine.step(cathFrame(engine.currentStep, { innerPush: FEED_SPEED / fullSpeed().advance }));
      }
      settle(engine, MAX_SETTLE_STEPS);
      const tracker = new RotationTracker(engine, 0, engine.device(0).rod.segmentCount - 1);
      const start = engine.device(0).rotation;
      let largest = 0;
      drive(
        engine,
        TURN_SECONDS * highTier().stepRate,
        { innerRotate: TURN_RATE / fullSpeed().rotate },
        () => {
          largest = Math.max(largest, engine.device(0).rotation - start - tracker.update());
        },
      );
      expect(engine.solveFailures).toBe(0);
      return largest;
    });
    console.info(
      FRICTIONS.map((mu, k) => `μ ${mu}: largest lag ${((lags[k] ?? 0) / DEG).toFixed(3)}°`).join('\n'),
    );
    expect(lags[1]).toBeGreaterThan(lags[0]!);
    expect(lags[2]).toBeGreaterThan(lags[1]!);
  });
});
