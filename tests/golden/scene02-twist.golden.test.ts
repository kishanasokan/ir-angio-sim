import { describe, expect, it } from 'vitest';
import {
  DEG,
  drive,
  fullSpeed,
  highTier,
  MM,
  phantom,
  RotationTracker,
  sceneEngine,
  settle,
  wireW,
} from './helpers';

// Golden scene 2 (prompts/M1-foundations.md §8): wire W in phantom A with μ = 0, tip 150 mm past the sheath tip.
// Turn the hub 360° at 180°/s; when settled, the tip rotation is 360° ± 5°.

const TURN = 360 * DEG;
const TURN_RATE = 180 * DEG;
const MAX_SETTLE_STEPS = 20_000;

describe('golden scene 2 · twist transmission', () => {
  it('turns the tip 360° ± 5° for a 360° hub turn with no friction', () => {
    const engine = sceneEngine(
      phantom('phantom-a-straight'),
      [{ spec: wireW(), pastSheathTip: 150 * MM }],
      0,
    );
    const tipSegment = engine.device(0).rod.segmentCount - 1;
    const tracker = new RotationTracker(engine, 0, tipSegment);
    const steps = Math.round((TURN / TURN_RATE) * highTier().stepRate);
    drive(engine, steps, { innerRotate: TURN_RATE / fullSpeed().rotate }, () => tracker.update());
    expect(engine.device(0).rotation / DEG).toBeCloseTo(360, 6);
    settle(engine, MAX_SETTLE_STEPS, () => tracker.update());
    console.info(`tip rotation ${(tracker.total / DEG).toFixed(3)}° for a 360° hub turn`);
    expect(Math.abs(tracker.total / DEG - 360)).toBeLessThan(5);
  });
});
