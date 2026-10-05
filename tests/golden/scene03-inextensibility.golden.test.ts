import { describe, expect, it } from 'vitest';
import { cathFrame, highTier, maxStretchError, MM, phantom, sceneEngine, wireW } from './helpers';

// Golden scene 3 (prompts/M1-foundations.md §8): wire W in phantom B, tip 20 mm before the bend. For 2 s, alternate
// full-speed push and pull every 0.25 s while rotating at full speed, reversing every 0.5 s. Segment length error
// stays below 0.5% at every step; no NaN.

const DURATION = 2;
const PUSH_PERIOD = 0.25;
const ROTATE_PERIOD = 0.5;
const BEND_START = 100 * MM;
const LIMIT = 0.005;

describe('golden scene 3 · inextensibility', () => {
  it('keeps every segment within 0.5% of its length through push-pull and full-speed rotation', () => {
    const rate = highTier().stepRate;
    const engine = sceneEngine(phantom('phantom-b-bend'), [
      { spec: wireW(), pastSheathTip: BEND_START - 20 * MM },
    ]);
    let worst = 0;
    for (let n = 0; n < DURATION * rate; n += 1) {
      const push = Math.floor(n / (PUSH_PERIOD * rate)) % 2 === 0 ? 1 : -1;
      const rotate = Math.floor(n / (ROTATE_PERIOD * rate)) % 2 === 0 ? 1 : -1;
      engine.step(cathFrame(engine.currentStep, { innerPush: push, innerRotate: rotate }));
      const error = maxStretchError(engine, 0);
      expect(Number.isFinite(error)).toBe(true);
      worst = Math.max(worst, error);
    }
    console.info(`largest segment length error ${(worst * 100).toExponential(3)}%`);
    expect(worst).toBeLessThan(LIMIT);
    expect(engine.solveFailures).toBe(0);
  });
});
