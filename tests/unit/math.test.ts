import { describe, expect, it } from 'vitest';
import {
  createBlockSystem,
  resetBlockSystem,
  solveBlockTridiagonal,
} from '../../src/sim/math/blockTridiagonal';
import { cylinderInertia } from '../../src/sim/math/geometry';
import {
  setAlongAcross3,
  setIdentity3,
  setPerpendicularProjection3,
  setRotatedDiagonal3,
  setSkew3,
} from '../../src/sim/math/mat3';
import { quatFromAxisAngle, quatFromMatrix, quatToMatrix } from '../../src/sim/math/quat';
import { createRng, nextFloat } from '../../src/sim/core/rng';

const multiply = (m: ArrayLike<number>, v: readonly number[]) =>
  [0, 1, 2].map(
    (r) =>
      (m[3 * r] ?? 0) * (v[0] ?? 0) + (m[3 * r + 1] ?? 0) * (v[1] ?? 0) + (m[3 * r + 2] ?? 0) * (v[2] ?? 0),
  );
const closeTo = (actual: readonly number[], expected: readonly number[], limit = 1e-12) => {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, k) => expect(Math.abs(value - (expected[k] ?? 0))).toBeLessThan(limit));
};

describe('3×3 helpers', () => {
  const m = new Float64Array(9);

  it('builds identity, skew and projection matrices', () => {
    setIdentity3(m, 0, 2);
    closeTo(multiply(m, [1, -2, 3]), [2, -4, 6]);
    setSkew3(m, 0, 1, 2, 3, 1);
    closeTo(multiply(m, [4, 5, 6]), [2 * 6 - 3 * 5, 3 * 4 - 1 * 6, 1 * 5 - 2 * 4]);
    setPerpendicularProjection3(m, 0, 0, 0, 1, 1);
    closeTo(multiply(m, [1, 2, 3]), [1, 2, 0]);
  });

  it('scales along a unit normal and across it', () => {
    const n = [0.6, 0, 0.8];
    setAlongAcross3(m, 0, n[0]!, n[1]!, n[2]!, 5, 2);
    closeTo(multiply(m, n), [3, 0, 4]);
    closeTo(multiply(m, [0, 1, 0]), [0, 2, 0]);
    closeTo(multiply(m, [0.8, 0, -0.6]), [1.6, 0, -1.2]);
  });

  it('rotates a diagonal inertia into the world frame', () => {
    const q = new Float64Array(4);
    quatFromAxisAngle(1, 0, 0, Math.PI / 2, q, 0);
    const r = new Float64Array(9);
    quatToMatrix(q, 0, r, 0);
    setRotatedDiagonal3(m, 0, r, 0, 3, 7);
    // d3 = R·z points along −y after a quarter turn about x: the axial value 7 acts along y.
    closeTo(multiply(m, [0, 1, 0]), [0, 7, 0]);
    closeTo(multiply(m, [1, 0, 0]), [3, 0, 0]);
    closeTo(multiply(m, [0, 0, 1]), [0, 0, 3]);
  });

  it('round-trips a rotation matrix through a quaternion', () => {
    const q = new Float64Array(4);
    quatFromAxisAngle(0.48, 0.6, 0.64, 2.5, q, 0);
    const r = new Float64Array(9);
    quatToMatrix(q, 0, r, 0);
    const back = new Float64Array(4);
    quatFromMatrix(r, 0, back, 0);
    const sign = Math.sign(back[3]!) === Math.sign(q[3]!) ? 1 : -1;
    closeTo(
      [...back].map((value) => sign * value),
      [...q],
    );
  });
});

describe('cylinder inertia', () => {
  it('follows the hollow-cylinder formulas', () => {
    const inertia = cylinderInertia(2, 0.003, 0.001, 0.02);
    expect(inertia.axial).toBeCloseTo((2 * (0.003 ** 2 + 0.001 ** 2)) / 2, 15);
    expect(inertia.perpendicular).toBeCloseTo((2 * (3 * (0.003 ** 2 + 0.001 ** 2) + 0.02 ** 2)) / 12, 15);
  });
});

describe('block-tridiagonal solve', () => {
  /** A random SPD system with some block rows using fewer rows, against dense Gaussian elimination. */
  it('matches a dense solve, including block rows that drop their last row', () => {
    const n = 7;
    const count = 9;
    const rng = createRng(3);
    const random = () => 2 * nextFloat(rng) - 1;
    const sizes = Array.from({ length: count }, (_, u) => (u % 3 === 1 ? n - 1 : n));
    const size = n * count;
    const dense = Array.from({ length: size }, () => new Array<number>(size).fill(0));
    const system = createBlockSystem(n, count);
    resetBlockSystem(system, count);
    for (let u = 0; u < count; u += 1) {
      system.sizes[u] = sizes[u]!;
    }
    const active = (u: number, i: number) => i < sizes[u]!;
    for (let u = 0; u < count; u += 1) {
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j <= i; j += 1) {
          if (!active(u, i) || !active(u, j)) {
            continue;
          }
          const value = i === j ? 2 * n + random() : 0.3 * random();
          dense[u * n + i]![u * n + j] = value;
          dense[u * n + j]![u * n + i] = value;
          system.diagonal[u * n * n + i * n + j] = value;
          system.diagonal[u * n * n + j * n + i] = value;
        }
      }
      if (u + 1 < count) {
        for (let i = 0; i < n; i += 1) {
          for (let j = 0; j < n; j += 1) {
            if (!active(u, i) || !active(u + 1, j)) {
              continue;
            }
            const value = 0.3 * random();
            dense[u * n + i]![(u + 1) * n + j] = value;
            dense[(u + 1) * n + j]![u * n + i] = value;
            system.upper[u * n * n + i * n + j] = value;
          }
        }
      }
    }
    const b = Array.from({ length: size }, (_, k) => (active(Math.floor(k / n), k % n) ? random() : 0));
    system.rhs.set(b);
    // Rows a block leaves out are identity rows in the dense system.
    for (let k = 0; k < size; k += 1) {
      if (!active(Math.floor(k / n), k % n)) {
        dense[k]![k] = 1;
      }
    }
    // Dense Gaussian elimination.
    const a = dense.map((row, k) => [...row, b[k]!]);
    for (let c = 0; c < size; c += 1) {
      for (let r = c + 1; r < size; r += 1) {
        const f = a[r]![c]! / a[c]![c]!;
        for (let k = c; k <= size; k += 1) {
          a[r]![k] = a[r]![k]! - f * a[c]![k]!;
        }
      }
    }
    const x = new Array<number>(size).fill(0);
    for (let r = size - 1; r >= 0; r -= 1) {
      let sum = a[r]![size]!;
      for (let k = r + 1; k < size; k += 1) {
        sum -= a[r]![k]! * x[k]!;
      }
      x[r] = sum / a[r]![r]!;
    }
    expect(solveBlockTridiagonal(system)).toBe(true);
    closeTo([...system.rhs.subarray(0, size)], x, 1e-12);
  });

  it('reports a block that is not positive definite', () => {
    const system = createBlockSystem(2, 1);
    resetBlockSystem(system, 1);
    system.diagonal.set([1, 2, 2, 1]);
    expect(solveBlockTridiagonal(system)).toBe(false);
  });
});
