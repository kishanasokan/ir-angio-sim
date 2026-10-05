import { describe, expect, it } from 'vitest';
import { atan2, cos, sin } from '../../src/sim/math/detTrig';

// Unit test 6 (prompts/M1-foundations.md §8): detTrig against Math on a dense grid over [−4π, 4π].

const LIMIT = 1e-12;
const POINTS = 200_001;
const grid = Array.from({ length: POINTS }, (_, i) => -4 * Math.PI + (8 * Math.PI * i) / (POINTS - 1));

describe('detTrig', () => {
  it('matches Math.sin and Math.cos within 1e-12', () => {
    let worst = 0;
    for (const x of grid) {
      worst = Math.max(worst, Math.abs(sin(x) - Math.sin(x)), Math.abs(cos(x) - Math.cos(x)));
    }
    expect(worst).toBeLessThan(LIMIT);
  });

  it('matches Math.atan2 within 1e-12 for every direction and several radii', () => {
    let worst = 0;
    for (const angle of grid) {
      for (const radius of [1e-6, 0.37, 1, 25, 1e6]) {
        const y = radius * Math.sin(angle);
        const x = radius * Math.cos(angle);
        worst = Math.max(worst, Math.abs(atan2(y, x) - Math.atan2(y, x)));
      }
    }
    expect(worst).toBeLessThan(LIMIT);
  });

  it('handles the axes and signed zeros like Math.atan2', () => {
    for (const [y, x] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [0, 0],
      [-0, 0],
      [0, -0],
      [-0, -0],
      [-0, -1],
    ] as const) {
      expect(Math.abs(atan2(y, x) - Math.atan2(y, x))).toBeLessThan(LIMIT);
    }
  });
});
