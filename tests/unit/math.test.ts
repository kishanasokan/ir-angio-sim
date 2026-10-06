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

/**
 * The block-tridiagonal Cholesky with plain full loops, as first written: the reference that skipping exact zeros must
 * reproduce bit for bit.
 */
function plainBlockSolve(system: {
  readonly n: number;
  readonly count: number;
  readonly diagonal: Float64Array;
  readonly upper: Float64Array;
  readonly rhs: Float64Array;
  readonly sizes: Uint8Array;
  readonly inverse: Float64Array;
}): boolean {
  const { n, count, diagonal, upper, rhs, sizes, inverse } = system;
  const block = n * n;
  for (let u = 0; u < count; u += 1) {
    const d = u * block;
    const r = u * n;
    const size = sizes[u]!;
    if (u > 0) {
      const p = d - block;
      const above = sizes[u - 1]!;
      for (let i = 0; i < size; i += 1) {
        for (let j = 0; j <= i; j += 1) {
          let sum = 0;
          for (let k = 0; k < above; k += 1) {
            sum += upper[p + k * n + i]! * upper[p + k * n + j]!;
          }
          diagonal[d + i * n + j] = diagonal[d + i * n + j]! - sum;
        }
        let sum = 0;
        for (let k = 0; k < above; k += 1) {
          sum += upper[p + k * n + i]! * rhs[r - n + k]!;
        }
        rhs[r + i] = rhs[r + i]! - sum;
      }
    }
    for (let j = 0; j < size; j += 1) {
      let pivot = diagonal[d + j * n + j]!;
      for (let k = 0; k < j; k += 1) {
        const l = diagonal[d + j * n + k]!;
        pivot -= l * l;
      }
      if (!(pivot > 0)) {
        return false;
      }
      const ljj = Math.sqrt(pivot);
      diagonal[d + j * n + j] = ljj;
      inverse[r + j] = 1 / ljj;
      for (let i = j + 1; i < size; i += 1) {
        let sum = diagonal[d + i * n + j]!;
        for (let k = 0; k < j; k += 1) {
          sum -= diagonal[d + i * n + k]! * diagonal[d + j * n + k]!;
        }
        diagonal[d + i * n + j] = sum * inverse[r + j]!;
      }
    }
    for (let i = 0; i < size; i += 1) {
      let sum = rhs[r + i]!;
      for (let k = 0; k < i; k += 1) {
        sum -= diagonal[d + i * n + k]! * rhs[r + k]!;
      }
      rhs[r + i] = sum * inverse[r + i]!;
    }
    if (u + 1 < count) {
      for (let c = 0; c < sizes[u + 1]!; c += 1) {
        for (let i = 0; i < size; i += 1) {
          let sum = upper[d + i * n + c]!;
          for (let k = 0; k < i; k += 1) {
            sum -= diagonal[d + i * n + k]! * upper[d + k * n + c]!;
          }
          upper[d + i * n + c] = sum * inverse[r + i]!;
        }
      }
    }
  }
  for (let u = count - 1; u >= 0; u -= 1) {
    const d = u * block;
    const r = u * n;
    const size = sizes[u]!;
    if (u + 1 < count) {
      for (let i = 0; i < size; i += 1) {
        let sum = 0;
        for (let k = 0; k < sizes[u + 1]!; k += 1) {
          sum += upper[d + i * n + k]! * rhs[r + n + k]!;
        }
        rhs[r + i] = rhs[r + i]! - sum;
      }
    }
    for (let i = size - 1; i >= 0; i -= 1) {
      let sum = rhs[r + i]!;
      for (let k = i + 1; k < size; k += 1) {
        sum -= diagonal[d + k * n + i]! * rhs[r + k]!;
      }
      rhs[r + i] = sum * inverse[r + i]!;
    }
  }
  return true;
}

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

  it("skips only exact zeros: on a rod's sparsity it matches the plain loops bit for bit", () => {
    // Units of seven rows (bend 0-2, stretch 3-5, contact 6) as the rod solver builds them: the contact row never
    // couples to bend rows, the next unit's stretch columns are zero in this unit's bend rows, and the next unit's
    // contact column is zero throughout. Some units drop their contact row.
    const n = 7;
    const count = 12;
    const rng = createRng(11);
    const random = () => 2 * nextFloat(rng) - 1;
    const system = createBlockSystem(n, count);
    resetBlockSystem(system, count);
    for (let u = 0; u < count; u += 1) {
      const size = u % 3 === 0 ? n : n - 1;
      system.sizes[u] = size;
      for (let i = 0; i < size; i += 1) {
        for (let j = 0; j <= i; j += 1) {
          if (!(i === 6 && j < 3)) {
            system.diagonal[u * n * n + i * n + j] = i === j ? 2 * n + random() : 0.3 * random();
          }
        }
        system.rhs[u * n + i] = random();
      }
      for (let i = 0; u + 1 < count && i < size; i += 1) {
        for (let c = 0; c < 6; c += 1) {
          if (!(i < 3 && c >= 3) && !(i === 6 && c < 3)) {
            system.upper[u * n * n + i * n + c] = 0.3 * random();
          }
        }
      }
    }
    const reference = {
      ...system,
      diagonal: system.diagonal.slice(),
      upper: system.upper.slice(),
      rhs: system.rhs.slice(),
      sizes: system.sizes.slice(),
      inverse: system.inverse.slice(),
    };
    expect(solveBlockTridiagonal(system)).toBe(true);
    expect(plainBlockSolve(reference)).toBe(true);
    for (let k = 0; k < n * count; k += 1) {
      expect(Object.is(system.rhs[k], reference.rhs[k])).toBe(true);
    }
  });

  it('reports a block that is not positive definite', () => {
    const system = createBlockSystem(2, 1);
    resetBlockSystem(system, 1);
    system.diagonal.set([1, 2, 2, 1]);
    expect(solveBlockTridiagonal(system)).toBe(false);
  });
});
