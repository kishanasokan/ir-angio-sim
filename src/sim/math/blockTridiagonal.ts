/**
 * Linear-time solve of a symmetric positive-definite block-tridiagonal system, the direct solver for stiff rods
 * (Deul et al. 2018; docs/M1-plan.md D3 and D29):
 *
 *   | D0   U0              |   | x0 |   | b0 |
 *   | U0ᵀ  D1   U1         | · | x1 | = | b1 |
 *   |      U1ᵀ  D2   ...   |   | .. |   | .. |
 *
 * Block Cholesky: for each block row, D′u = Du − Yᵀ·Y with Y = L⁻¹·U of the row above, D′u = L·Lᵀ, and
 * z = L⁻¹·b′; then back substitution x_u = L⁻ᵀ·(z_u − Y_u·x_(u+1)). Only + − × ÷ and sqrt (spec 01 §4.4).
 *
 * Blocks are stored n×n row-major, back to back, but each block row u uses only its first sizes[u] rows and columns
 * (a trailing row with nothing to solve is left out; its solution is 0). Callers fill `diagonal` (at least its lower
 * triangle), `upper` and `rhs` for `count` block rows; the solve overwrites `rhs` with the solution and the blocks
 * with their factors.
 *
 * Coupling blocks are sparse in a rod: a unit shares only a segment and a node with the next one, so many columns of
 * U begin with zeros, and some are zero throughout. Forward substitution keeps a column's leading zeros, so Y has the
 * same ones. The solve finds them (exact zeros) and skips the products they would add. Every other term is added in
 * the same order, so the result is bit for bit the one the full loops give: a sum that starts at +0 stays +0 when ±0
 * is added to it, and is unchanged by ±0 once it is not zero.
 *
 * This is the hottest loop of the simulation, so it indexes typed arrays directly: every index is in range by
 * construction (u < count ≤ capacity, sizes ≤ n).
 */
export interface BlockSystem {
  /** Block size n. */
  readonly n: number;
  /** Block rows in use; at most the capacity. */
  count: number;
  readonly capacity: number;
  readonly diagonal: Float64Array;
  readonly upper: Float64Array;
  readonly rhs: Float64Array;
  /** Rows in use in each block row, n unless the caller drops a trailing row. */
  readonly sizes: Uint8Array;
  /** 1 / L_ii of each block row's factor. */
  readonly inverse: Float64Array;
  /** For each column of each U block: its first row that is not an exact zero (the block's row count if none). */
  readonly leading: Uint8Array;
}

export function createBlockSystem(n: number, capacity: number): BlockSystem {
  const block = n * n;
  return {
    n,
    count: 0,
    capacity,
    diagonal: new Float64Array(block * capacity),
    upper: new Float64Array(block * capacity),
    rhs: new Float64Array(n * capacity),
    sizes: new Uint8Array(capacity).fill(n),
    inverse: new Float64Array(n * capacity),
    leading: new Uint8Array(n * capacity),
  };
}

/** Clears the first `count` block rows, gives them the full size n and sets the count. */
export function resetBlockSystem(system: BlockSystem, count: number): void {
  if (count > system.capacity) {
    throw new Error(`Block system holds ${system.capacity} rows; ${count} requested.`);
  }
  const block = system.n * system.n;
  system.count = count;
  system.diagonal.fill(0, 0, block * count);
  system.upper.fill(0, 0, block * count);
  system.rhs.fill(0, 0, system.n * count);
  system.sizes.fill(system.n, 0, count);
}

/** Solves the system in place; returns false if a pivot block is not positive definite. */
export function solveBlockTridiagonal(system: BlockSystem): boolean {
  const { n, count, diagonal, upper, rhs, sizes, inverse, leading } = system;
  const block = n * n;
  for (let u = 0; u < count; u += 1) {
    const d = u * block;
    const r = u * n;
    const size = sizes[u]!;
    if (u > 0) {
      // D′u = Du − Yᵀ·Y (lower triangle) and b′u = bu − Yᵀ·z, from the row above. Column i of Y is zero above its
      // leading row; a column that is zero throughout changes nothing.
      const p = d - block;
      const above = sizes[u - 1]!;
      const lead = r - n;
      for (let i = 0; i < size; i += 1) {
        const li = leading[lead + i]!;
        if (li >= above) {
          continue;
        }
        for (let j = 0; j <= i; j += 1) {
          const lj = leading[lead + j]!;
          if (lj >= above) {
            continue;
          }
          let sum = 0;
          for (let k = li > lj ? li : lj; k < above; k += 1) {
            sum += upper[p + k * n + i]! * upper[p + k * n + j]!;
          }
          diagonal[d + i * n + j] = diagonal[d + i * n + j]! - sum;
        }
        let sum = 0;
        for (let k = li; k < above; k += 1) {
          sum += upper[p + k * n + i]! * rhs[r - n + k]!;
        }
        rhs[r + i] = rhs[r + i]! - sum;
      }
    }
    // D′u = L·Lᵀ in its lower triangle, keeping 1 / L_jj.
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
      const reciprocal = 1 / ljj;
      diagonal[d + j * n + j] = ljj;
      inverse[r + j] = reciprocal;
      for (let i = j + 1; i < size; i += 1) {
        let sum = diagonal[d + i * n + j]!;
        for (let k = 0; k < j; k += 1) {
          sum -= diagonal[d + i * n + k]! * diagonal[d + j * n + k]!;
        }
        diagonal[d + i * n + j] = sum * reciprocal;
      }
    }
    // z = L⁻¹·b′.
    for (let i = 0; i < size; i += 1) {
      let sum = rhs[r + i]!;
      for (let k = 0; k < i; k += 1) {
        sum -= diagonal[d + i * n + k]! * rhs[r + k]!;
      }
      rhs[r + i] = sum * inverse[r + i]!;
    }
    // Y = L⁻¹·U in place, column by column, for the next row's columns. Rows above a column's leading row stay zero
    // and are never read.
    if (u + 1 < count) {
      const below = sizes[u + 1]!;
      for (let c = 0; c < below; c += 1) {
        let first = 0;
        while (first < size && upper[d + first * n + c] === 0) {
          first += 1;
        }
        leading[r + c] = first;
        for (let i = first; i < size; i += 1) {
          let sum = upper[d + i * n + c]!;
          for (let k = first; k < i; k += 1) {
            sum -= diagonal[d + i * n + k]! * upper[d + k * n + c]!;
          }
          upper[d + i * n + c] = sum * inverse[r + i]!;
        }
      }
    }
  }
  // x_u = L⁻ᵀ·(z_u − Y_u·x_(u+1)); rows beyond a block row's size stay 0.
  for (let u = count - 1; u >= 0; u -= 1) {
    const d = u * block;
    const r = u * n;
    const size = sizes[u]!;
    if (u + 1 < count) {
      const below = sizes[u + 1]!;
      for (let i = 0; i < size; i += 1) {
        let sum = 0;
        for (let k = 0; k < below; k += 1) {
          if (leading[r + k]! <= i) {
            sum += upper[d + i * n + k]! * rhs[r + n + k]!;
          }
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
