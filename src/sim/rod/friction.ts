import { VEC3, Y, Z } from '../core/types';
import { atan2 } from '../math/detTrig';
import { innerBending, segmentTangent } from './coaxial';
import type { RodState } from './state';

/**
 * Device-in-device sliding friction (spec 04 §2.3). Sliding inside the combined beam is kinematic, so this friction
 * acts on the hub forces, not on the motion. Over the outer device's joints j where it holds the inner device,
 *
 *   F = μ · ( |T| · Σ θ_j  +  Σ EI_j · |κ_{j+1} − 2κ_j + κ_{j−1}| / l ),   κ_j = θ_j / l,
 *
 * the capstan term for an inner device carrying axial load T round bends, plus the contact force a device of bending
 * stiffness EI needs to follow changes of curvature.
 */

/** The bend angle at node `node` of a rod, between segments node − 1 and node, rad; 0 at the ends. */
export function jointAngle(rod: RodState, node: number, scratch: Float64Array): number {
  if (node < 1 || node >= rod.segmentCount) {
    return 0;
  }
  segmentTangent(rod, node - 1, scratch, 0);
  segmentTangent(rod, node, scratch, VEC3);
  const ax = scratch[0] ?? 0;
  const ay = scratch[Y] ?? 0;
  const az = scratch[Z] ?? 0;
  const bx = scratch[VEC3] ?? 0;
  const by = scratch[VEC3 + Y] ?? 0;
  const bz = scratch[VEC3 + Z] ?? 0;
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  return atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), ax * bx + ay * by + az * bz);
}

/**
 * The sliding friction force magnitude (N, ≥ 0) between an outer device and the inner device it holds over the arc
 * range (from, to] from the sheath valve. `mu` is the outer device's lumen friction coefficient and `axialLoad` the
 * inner device's axial load, N. `scratch` holds at least two 3-vectors.
 */
export function slidingFriction(
  outer: RodState,
  outerInserted: number,
  inner: RodState,
  innerInserted: number,
  from: number,
  to: number,
  mu: number,
  axialLoad: number,
  scratch: Float64Array,
): number {
  if (mu <= 0 || to <= from) {
    return 0;
  }
  const n = outer.segmentCount;
  const l = outer.segmentLength;
  // Joints are nodes 1 … n − 1; node k sits at arc outerInserted − (n − k)·l.
  const first = Math.max(1, Math.floor((from - outerInserted) / l + n) + 1);
  const last = Math.min(n - 1, Math.floor((to - outerInserted) / l + n));
  if (last < first) {
    return 0;
  }
  let angles = 0;
  let curvature = 0;
  let previous = jointAngle(outer, first - 1, scratch) / l;
  let current = jointAngle(outer, first, scratch) / l;
  for (let k = first; k <= last; k += 1) {
    const next = jointAngle(outer, k + 1, scratch) / l;
    const arc = outerInserted - (n - k) * l;
    angles += current * l;
    curvature += (innerBending(inner, innerInserted, arc) * Math.abs(next - 2 * current + previous)) / l;
    previous = current;
    current = next;
  }
  return mu * (Math.abs(axialLoad) * angles + curvature);
}
