import { describe, expect, it } from 'vitest';
import {
  quatFromAxisAngle,
  quatMultiply,
  quatNormalize,
  quatRotate,
  quatRotateInverse,
  quatToMatrix,
} from '../../src/sim/math/quat';

// Unit test 7 (prompts/M1-foundations.md §8): quaternions (x, y, z, w).

const LIMIT = 1e-12;
const close = (actual: ArrayLike<number>, expected: readonly number[]) => {
  for (let k = 0; k < expected.length; k += 1) {
    expect(Math.abs((actual[k] ?? 0) - (expected[k] ?? 0))).toBeLessThan(LIMIT);
  }
};

describe('quaternions', () => {
  it('normalizes to unit length in the same direction', () => {
    const q = [1, 2, 3, 4];
    quatNormalize(q, 0);
    const norm = Math.sqrt(30);
    close(q, [1 / norm, 2 / norm, 3 / norm, 4 / norm]);
  });

  it('multiplies: i ⊗ j = k, and a rotation after its inverse is the identity', () => {
    const out = [0, 0, 0, 0];
    quatMultiply([1, 0, 0, 0], 0, [0, 1, 0, 0], 0, out, 0);
    close(out, [0, 0, 1, 0]);
    const q = [0, 0, 0, 0];
    quatFromAxisAngle(0, 0.6, 0.8, 1.234, q, 0);
    const inverse = [-(q[0] ?? 0), -(q[1] ?? 0), -(q[2] ?? 0), q[3] ?? 1];
    quatMultiply(q, 0, inverse, 0, out, 0);
    close(out, [0, 0, 0, 1]);
  });

  it('rotates vectors: 90° about z takes x to y, and the inverse rotation takes it back', () => {
    const q = [0, 0, 0, 0];
    quatFromAxisAngle(0, 0, 1, Math.PI / 2, q, 0);
    const out = [0, 0, 0];
    quatRotate(q, 0, [1, 0, 0], 0, out, 0);
    close(out, [0, 1, 0]);
    const back = [0, 0, 0];
    quatRotateInverse(q, 0, out, 0, back, 0);
    close(back, [1, 0, 0]);
    const m = new Array<number>(9).fill(0);
    quatToMatrix(q, 0, m, 0);
    close(m, [0, -1, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('builds axis-angle quaternions with detTrig that match ones built with Math within 1e-12', () => {
    const q = [0, 0, 0, 0];
    let worst = 0;
    for (let i = 0; i <= 2000; i += 1) {
      const angle = -4 * Math.PI + (8 * Math.PI * i) / 2000;
      const ax = Math.cos(i);
      const ay = Math.sin(i) * Math.cos(2 * i);
      const az = Math.sin(i) * Math.sin(2 * i);
      quatFromAxisAngle(ax, ay, az, angle, q, 0);
      const s = Math.sin(angle / 2);
      const expected = [ax * s, ay * s, az * s, Math.cos(angle / 2)];
      for (let k = 0; k < 4; k += 1) {
        worst = Math.max(worst, Math.abs((q[k] ?? 0) - (expected[k] ?? 0)));
      }
    }
    expect(worst).toBeLessThan(LIMIT);
  });
});
