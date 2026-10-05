import {
  BEND_COMPONENTS,
  GROUP_CONTACT,
  GROUP_ROW,
  GROUP_SIZE,
  GROUPS_PER_UNIT,
  MAT3,
  MAX_ENTRIES,
  QUAT,
  UNIT_BLOCK,
  UNIT_ROWS,
  VEC3,
  W,
  X,
  Y,
  Z,
} from '../core/types';
import {
  createBlockSystem,
  resetBlockSystem,
  solveBlockTridiagonal,
  type BlockSystem,
} from '../math/blockTridiagonal';
import { setAlongAcross3, setIdentity3, setRotatedDiagonal3 } from '../math/mat3';
import { quatApplyWorldRotation, quatRelative, quatToMatrix } from '../math/quat';
import type { RodState } from './state';

/**
 * XPBD constraints for Cosserat rods (Kugelstadt and Schömer 2016), solved directly along each chain with one
 * iteration per substep (docs/M1-plan.md D3 and D29):
 * - stretch-shear per segment: (x[j+1] − x[j]) / l − d3(q[j]) = 0 with zero compliance (inextensible,
 *   shear-stiff);
 * - bend-twist per joint: Ω − Ω₀ = 0 with Ω = 2·Im(conj(q[j])·q[j+1]) / l̄ on the shortest arc, compliance
 *   1/(EI·l̄) for the two bending rows and 1/(GJ·l̄) for twist (spec 01 §6);
 * - lumen contact rows for nodes at or beyond the lumen surface, solved together with the rod so a stiff rod cannot
 *   spring back through the wall.
 *
 * Each dynamic segment contributes one unit of seven rows: its proximal bend joint, its stretch-shear and its distal
 * node's contact. Units couple only to their neighbours, so J·W·Jᵀ + α̃ is block tridiagonal and solves in linear
 * time. External forces and torques enter the right-hand side, so they are applied as part of the same solve.
 */

export const VARIABLE_NODE = 0;
export const VARIABLE_SEGMENT = 1;

/** Dynamic variables of one solve: node positions and segment rotations, three degrees of freedom each. */
export interface Variables {
  count: number;
  readonly capacity: number;
  readonly kind: Uint8Array;
  readonly device: Int32Array;
  readonly index: Int32Array;
  /** World inverse mass or inverse inertia, 3×3 row-major. */
  readonly inverse: Float64Array;
  /** External force (nodes) or torque (segments) this substep, world. */
  readonly force: Float64Array;
  /** Position or rotation correction from the solve, world. */
  readonly delta: Float64Array;
}

export interface Units {
  count: number;
  readonly capacity: number;
  readonly device: Int32Array;
  readonly segment: Int32Array;
  readonly entryVariable: Int32Array;
  readonly entryJacobian: Float64Array;
  readonly entryWeighted: Float64Array;
  readonly entryCount: Int32Array;
  /** Constraint values C, seven per unit. */
  readonly constraint: Float64Array;
  /** Bend-row compliances before division by h², three per unit. */
  readonly compliance: Float64Array;
  readonly contactActive: Uint8Array;
  /** Solution λ, seven per unit. */
  readonly lambda: Float64Array;
}

export interface Solver {
  variables: Variables;
  units: Units;
  system: BlockSystem;
  /** Scratch owned by the solver, so no module state is shared between engines. */
  readonly scratch: {
    readonly rotation: Float64Array;
    readonly relative: Float64Array;
    readonly jacobian: Float64Array;
    readonly bendG: Float64Array;
  };
}

function createVariables(capacity: number): Variables {
  return {
    count: 0,
    capacity,
    kind: new Uint8Array(capacity),
    device: new Int32Array(capacity),
    index: new Int32Array(capacity),
    inverse: new Float64Array(MAT3 * capacity),
    force: new Float64Array(VEC3 * capacity),
    delta: new Float64Array(VEC3 * capacity),
  };
}

function createUnits(capacity: number): Units {
  const entries = capacity * GROUPS_PER_UNIT * MAX_ENTRIES;
  return {
    count: 0,
    capacity,
    device: new Int32Array(capacity),
    segment: new Int32Array(capacity),
    entryVariable: new Int32Array(entries),
    entryJacobian: new Float64Array(MAT3 * entries),
    entryWeighted: new Float64Array(MAT3 * entries),
    entryCount: new Int32Array(capacity * GROUPS_PER_UNIT),
    constraint: new Float64Array(UNIT_ROWS * capacity),
    compliance: new Float64Array(BEND_COMPONENTS * capacity),
    contactActive: new Uint8Array(capacity),
    lambda: new Float64Array(UNIT_ROWS * capacity),
  };
}

/** A solver sized for chains of up to `units` dynamic segments in all. */
export function createSolver(units: number): Solver {
  return {
    // Each unit adds at most one node and one segment variable.
    variables: createVariables(2 * units + 2),
    units: createUnits(units),
    system: createBlockSystem(UNIT_ROWS, units),
    scratch: {
      rotation: new Float64Array(MAT3),
      relative: new Float64Array(QUAT),
      jacobian: new Float64Array(MAT3),
      bendG: new Float64Array(MAT3),
    },
  };
}

/** Clears the solver for a new substep, growing it when the chain outgrows its capacity. */
export function resetSolver(solver: Solver, units: number): void {
  if (units > solver.units.capacity) {
    const grown = createSolver(2 * units);
    solver.variables = grown.variables;
    solver.units = grown.units;
    solver.system = grown.system;
  }
  solver.variables.count = 0;
  solver.units.count = 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Variables

export function addNodeVariable(solver: Solver, device: number, node: number, inverseMass: number): number {
  const vars = solver.variables;
  const id = vars.count;
  vars.count += 1;
  vars.kind[id] = VARIABLE_NODE;
  vars.device[id] = device;
  vars.index[id] = node;
  setIdentity3(vars.inverse, MAT3 * id, inverseMass);
  vars.force.fill(0, VEC3 * id, VEC3 * id + VEC3);
  return id;
}

/**
 * Gives a node a different inverse mass along a unit normal n than across it: W = a·n·nᵀ + b·(I − n·nᵀ). Implicit
 * friction makes a node in contact heavier along the wall for one substep.
 */
export function setNodeInverse(
  solver: Solver,
  id: number,
  nx: number,
  ny: number,
  nz: number,
  normalInverse: number,
  tangentialInverse: number,
): void {
  setAlongAcross3(solver.variables.inverse, MAT3 * id, nx, ny, nz, normalInverse, tangentialInverse);
}

/** Adds a segment rotation with world inverse inertia R·diag(1/I⊥, 1/I⊥, 1/I∥)·Rᵀ at orientation q. */
export function addSegmentVariable(
  solver: Solver,
  device: number,
  segment: number,
  q: Float64Array,
  qo: number,
  inversePerpendicular: number,
  inverseAxial: number,
): number {
  const vars = solver.variables;
  const id = vars.count;
  vars.count += 1;
  vars.kind[id] = VARIABLE_SEGMENT;
  vars.device[id] = device;
  vars.index[id] = segment;
  quatToMatrix(q, qo, solver.scratch.rotation, 0);
  setRotatedDiagonal3(
    vars.inverse,
    MAT3 * id,
    solver.scratch.rotation,
    0,
    inversePerpendicular,
    inverseAxial,
  );
  vars.force.fill(0, VEC3 * id, VEC3 * id + VEC3);
  return id;
}

export function addVariableForce(solver: Solver, id: number, fx: number, fy: number, fz: number): void {
  if (id < 0) {
    return;
  }
  const o = VEC3 * id;
  const force = solver.variables.force;
  force[o] = (force[o] ?? 0) + fx;
  force[o + Y] = (force[o + Y] ?? 0) + fy;
  force[o + Z] = (force[o + Z] ?? 0) + fz;
}

// ---------------------------------------------------------------------------------------------------------------
// Units and Jacobian entries

export function beginUnit(solver: Solver, device: number, segment: number): number {
  const units = solver.units;
  const u = units.count;
  units.count += 1;
  units.device[u] = device;
  units.segment[u] = segment;
  units.entryCount.fill(0, GROUPS_PER_UNIT * u, GROUPS_PER_UNIT * u + GROUPS_PER_UNIT);
  units.constraint.fill(0, UNIT_ROWS * u, UNIT_ROWS * u + UNIT_ROWS);
  units.compliance.fill(0, BEND_COMPONENTS * u, BEND_COMPONENTS * u + BEND_COMPONENTS);
  units.contactActive[u] = 0;
  return u;
}

/** Adds a Jacobian entry: the group's rows × 3 columns, row-major, times `scale`. Kinematic variables (−1) add none. */
export function addEntry(
  solver: Solver,
  u: number,
  group: number,
  variable: number,
  jacobian: ArrayLike<number>,
  jo: number,
  scale: number,
): void {
  if (variable < 0) {
    return;
  }
  const units = solver.units;
  const slot = GROUPS_PER_UNIT * u + group;
  const filled = units.entryCount[slot] ?? 0;
  const e = MAX_ENTRIES * slot + filled;
  units.entryCount[slot] = filled + 1;
  units.entryVariable[e] = variable;
  for (let k = 0; k < MAT3; k += 1) {
    units.entryJacobian[MAT3 * e + k] = (jacobian[jo + k] ?? 0) * scale;
  }
}

/**
 * The bend-twist constraint between a proximal orientation qp and segment orientation qk. Writes C (three values in
 * qp's frame) into the unit and the Jacobian with respect to a world rotation of qk, (1/l̄)·G·Rpᵀ with
 * G = r_w·I − [r_v]×, into `jacobian`; the Jacobian with respect to qp is its negative.
 */
export function bendTwist(
  solver: Solver,
  u: number,
  qp: Float64Array,
  po: number,
  qk: Float64Array,
  ko: number,
  restChord: ArrayLike<number>,
  restOffset: number,
  voronoiLength: number,
  jacobian: Float64Array,
): void {
  const r = solver.scratch.relative;
  quatRelative(qp, po, qk, ko, r, 0);
  // Shortest arc: q and −q are the same rotation.
  const sign = (r[W] ?? 1) < 0 ? -1 : 1;
  const rx = sign * (r[X] ?? 0);
  const ry = sign * (r[Y] ?? 0);
  const rz = sign * (r[Z] ?? 0);
  const rw = sign * (r[W] ?? 1);
  const inverseLength = 1 / voronoiLength;
  const c = solver.units.constraint;
  const co = UNIT_ROWS * u + (GROUP_ROW[0] ?? 0);
  c[co] = (2 * rx - (restChord[restOffset] ?? 0)) * inverseLength;
  c[co + Y] = (2 * ry - (restChord[restOffset + Y] ?? 0)) * inverseLength;
  c[co + Z] = (2 * rz - (restChord[restOffset + Z] ?? 0)) * inverseLength;
  // G = rw·I − [r_v]×, row-major.
  const g = solver.scratch.bendG;
  g[0] = rw;
  g[1] = rz;
  g[2] = -ry;
  g[3] = -rz;
  g[4] = rw;
  g[5] = rx;
  g[6] = ry;
  g[7] = -rx;
  g[8] = rw;
  const rotation = solver.scratch.rotation;
  quatToMatrix(qp, po, rotation, 0);
  // J = (1/l̄)·G·Rpᵀ, where (G·Rᵀ)[a][b] = Σk G[a][k]·R[b][k].
  for (let a = 0; a < VEC3; a += 1) {
    for (let b = 0; b < VEC3; b += 1) {
      let sum = 0;
      for (let k = 0; k < VEC3; k += 1) {
        sum += (g[VEC3 * a + k] ?? 0) * (rotation[VEC3 * b + k] ?? 0);
      }
      jacobian[VEC3 * a + b] = sum * inverseLength;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Assembly, solve and corrections

/**
 * Adds K_a·J_bᵀ for the given group rows into a 7×7 block, rows of a against rows of b. With `lower`, only entries on
 * or below the block's diagonal are added: the factorization reads no others.
 */
function accumulate(
  target: Float64Array,
  base: number,
  weighted: Float64Array,
  wa: number,
  jacobian: Float64Array,
  jb: number,
  rowA: number,
  sizeA: number,
  rowB: number,
  sizeB: number,
  lower: boolean,
): void {
  for (let a = 0; a < sizeA; a += 1) {
    const w = wa + VEC3 * a;
    const w0 = weighted[w]!;
    const w1 = weighted[w + Y]!;
    const w2 = weighted[w + Z]!;
    const row = base + (rowA + a) * UNIT_ROWS + rowB;
    const last = lower ? Math.min(sizeB, rowA + a - rowB + 1) : sizeB;
    for (let b = 0; b < last; b += 1) {
      const j = jb + VEC3 * b;
      target[row + b] = target[row + b]! + w0 * jacobian[j]! + w1 * jacobian[j + Y]! + w2 * jacobian[j + Z]!;
    }
  }
}

/**
 * Assembles J·W·Jᵀ + α̃ (the lower triangle of each diagonal block, and the coupling blocks) and the right-hand side
 * −C − h²·J·W·f, solves for λ, and writes each variable's correction W·Jᵀ·λ + h²·W·f into `delta`. Returns false if
 * the system was not positive definite.
 *
 * Like the block solve, this runs every substep for every unit, so it indexes typed arrays directly: entry, slot and
 * variable indices are in range by construction.
 */
export function solveUnits(solver: Solver, h: number): boolean {
  const { variables: vars, units, system } = solver;
  const h2 = h * h;
  const { entryCount, entryVariable, entryJacobian, entryWeighted, constraint, contactActive, lambda } =
    units;
  const { inverse, force, delta } = vars;
  const unitCount = units.count;

  // K = J·W for every entry, only for the rows its group has.
  for (let u = 0; u < unitCount; u += 1) {
    for (let g = 0; g < GROUPS_PER_UNIT; g += 1) {
      const slot = GROUPS_PER_UNIT * u + g;
      const size = GROUP_SIZE[g]!;
      const count = entryCount[slot]!;
      for (let n = 0; n < count; n += 1) {
        const e = MAX_ENTRIES * slot + n;
        const m = MAT3 * entryVariable[e]!;
        for (let a = 0; a < size; a += 1) {
          const j = MAT3 * e + VEC3 * a;
          const j0 = entryJacobian[j]!;
          const j1 = entryJacobian[j + Y]!;
          const j2 = entryJacobian[j + Z]!;
          for (let b = 0; b < VEC3; b += 1) {
            entryWeighted[j + b] =
              j0 * inverse[m + b]! + j1 * inverse[m + VEC3 + b]! + j2 * inverse[m + 2 * VEC3 + b]!;
          }
        }
      }
    }
  }

  resetBlockSystem(system, unitCount);
  const { diagonal, upper, rhs } = system;
  for (let u = 0; u < unitCount; u += 1) {
    const base = UNIT_BLOCK * u;
    for (let g = 0; g < GROUPS_PER_UNIT; g += 1) {
      const slotA = GROUPS_PER_UNIT * u + g;
      const countA = entryCount[slotA]!;
      const rowA = GROUP_ROW[g]!;
      const sizeA = GROUP_SIZE[g]!;
      for (let g2 = 0; g2 < GROUPS_PER_UNIT; g2 += 1) {
        const rowB = GROUP_ROW[g2]!;
        const sizeB = GROUP_SIZE[g2]!;
        // Diagonal block, lower triangle: entries of this unit that share a variable. Groups are stored in row order,
        // so a later group's rows lie wholly above the diagonal of an earlier group's.
        if (g2 <= g) {
          const slotB = GROUPS_PER_UNIT * u + g2;
          const countB = entryCount[slotB]!;
          for (let na = 0; na < countA; na += 1) {
            const ea = MAX_ENTRIES * slotA + na;
            for (let nb = 0; nb < countB; nb += 1) {
              const eb = MAX_ENTRIES * slotB + nb;
              if (entryVariable[ea] === entryVariable[eb]) {
                accumulate(
                  diagonal,
                  base,
                  entryWeighted,
                  MAT3 * ea,
                  entryJacobian,
                  MAT3 * eb,
                  rowA,
                  sizeA,
                  rowB,
                  sizeB,
                  true,
                );
              }
            }
          }
        }
        // Upper block: this unit's rows against the next unit's.
        if (u + 1 < unitCount) {
          const slotN = GROUPS_PER_UNIT * (u + 1) + g2;
          const countN = entryCount[slotN]!;
          for (let na = 0; na < countA; na += 1) {
            const ea = MAX_ENTRIES * slotA + na;
            for (let nb = 0; nb < countN; nb += 1) {
              const eb = MAX_ENTRIES * slotN + nb;
              if (entryVariable[ea] === entryVariable[eb]) {
                accumulate(
                  upper,
                  base,
                  entryWeighted,
                  MAT3 * ea,
                  entryJacobian,
                  MAT3 * eb,
                  rowA,
                  sizeA,
                  rowB,
                  sizeB,
                  false,
                );
              }
            }
          }
        }
      }
      // Right-hand side −C − h²·Σ K·f for this group's rows.
      for (let a = 0; a < sizeA; a += 1) {
        let forcing = 0;
        for (let na = 0; na < countA; na += 1) {
          const ea = MAX_ENTRIES * slotA + na;
          const f = VEC3 * entryVariable[ea]!;
          const w = MAT3 * ea + VEC3 * a;
          forcing +=
            entryWeighted[w]! * force[f]! +
            entryWeighted[w + Y]! * force[f + Y]! +
            entryWeighted[w + Z]! * force[f + Z]!;
        }
        rhs[UNIT_ROWS * u + rowA + a] = -constraint[UNIT_ROWS * u + rowA + a]! - h2 * forcing;
      }
    }
    // Bend-row compliance.
    for (let c = 0; c < BEND_COMPONENTS; c += 1) {
      const t = base + c * UNIT_ROWS + c;
      diagonal[t] = diagonal[t]! + units.compliance[BEND_COMPONENTS * u + c]! / h2;
    }
    if (contactActive[u] !== 1) {
      // Without contact the unit's last row, its contact row, drops out of the solve and its λ is 0.
      const row = GROUP_ROW[GROUP_CONTACT]!;
      system.sizes[u] = row;
      rhs[UNIT_ROWS * u + row] = 0;
    }
  }

  if (!solveBlockTridiagonal(system)) {
    return false;
  }
  lambda.set(rhs.subarray(0, UNIT_ROWS * unitCount));

  // Corrections W·Jᵀ·λ (= Kᵀ·λ, W being symmetric), then the force displacement h²·W·f.
  delta.fill(0, 0, VEC3 * vars.count);
  for (let u = 0; u < unitCount; u += 1) {
    for (let g = 0; g < GROUPS_PER_UNIT; g += 1) {
      const slot = GROUPS_PER_UNIT * u + g;
      const count = entryCount[slot]!;
      const row = GROUP_ROW[g]!;
      const size = GROUP_SIZE[g]!;
      for (let n = 0; n < count; n += 1) {
        const e = MAX_ENTRIES * slot + n;
        const d = VEC3 * entryVariable[e]!;
        for (let a = 0; a < size; a += 1) {
          const l = lambda[UNIT_ROWS * u + row + a]!;
          const w = MAT3 * e + VEC3 * a;
          delta[d] = delta[d]! + entryWeighted[w]! * l;
          delta[d + Y] = delta[d + Y]! + entryWeighted[w + Y]! * l;
          delta[d + Z] = delta[d + Z]! + entryWeighted[w + Z]! * l;
        }
      }
    }
  }
  for (let v = 0; v < vars.count; v += 1) {
    const m = MAT3 * v;
    const f = VEC3 * v;
    const fx = force[f]!;
    const fy = force[f + Y]!;
    const fz = force[f + Z]!;
    if (fx === 0 && fy === 0 && fz === 0) {
      continue;
    }
    for (let a = 0; a < VEC3; a += 1) {
      const r = m + VEC3 * a;
      delta[f + a] = delta[f + a]! + h2 * (inverse[r]! * fx + inverse[r + Y]! * fy + inverse[r + Z]! * fz);
    }
  }
  return true;
}

/** Applies the solve's corrections to the rods: positions move, orientations rotate. */
export function applyCorrections(solver: Solver, rods: readonly RodState[]): void {
  const vars = solver.variables;
  for (let v = 0; v < vars.count; v += 1) {
    const rod = rods[vars.device[v] ?? 0];
    if (rod === undefined) {
      continue;
    }
    const i = vars.index[v] ?? 0;
    const d = VEC3 * v;
    const dx = vars.delta[d] ?? 0;
    const dy = vars.delta[d + Y] ?? 0;
    const dz = vars.delta[d + Z] ?? 0;
    if (vars.kind[v] === VARIABLE_NODE) {
      const o = VEC3 * i;
      rod.x[o] = (rod.x[o] ?? 0) + dx;
      rod.x[o + Y] = (rod.x[o + Y] ?? 0) + dy;
      rod.x[o + Z] = (rod.x[o + Z] ?? 0) + dz;
    } else {
      quatApplyWorldRotation(rod.q, QUAT * i, dx, dy, dz);
    }
  }
}
