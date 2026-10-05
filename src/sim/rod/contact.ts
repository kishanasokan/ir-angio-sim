import { QUAT, VEC3, Y, Z } from '../core/types';
import { quatApplyWorldRotation } from '../math/quat';
import { queryLumen, type Lumen, type LumenHit } from '../anatomy/lumen';
import type { RodState } from './state';

/**
 * Lumen contact and Coulomb friction (prompts/M1-foundations.md §2, docs/M1-plan.md D29).
 *
 * A node of radius r must stay within max(0, R − r − margin) of some capsule axis. Nodes at or beyond that surface
 * get a contact row in the rod's direct solve, which places them on the surface; a row that would pull a node onto
 * the wall is released and the substep solved again, so contact only pushes. Friction is Coulomb, translational and
 * torsional, with the normal force from the previous substep: a force opposing sliding (μ·N) and a torque opposing
 * spin about the tangent (μ·N·r), regularized below a small speed so sticking does not chatter, and applied
 * implicitly so it cannot overshoot on the light nodes of a wire.
 */

export interface ContactQuery {
  /** Contact plane: outward unit normal and the constraint value n·(x − p) at the queried point (> 0 penetrates). */
  readonly normal: Float64Array;
  violation: number;
  /** Depth inside the allowed region (negative when outside). */
  depth: number;
}

export function createContactQuery(): ContactQuery {
  return { normal: new Float64Array(VEC3), violation: 0, depth: 0 };
}

/**
 * Tests a point against the lumen. Returns false in free space. Otherwise fills `query` with the deepest capsule's
 * outward normal, the depth and the violation n·(x − p) of its allowed surface.
 */
export function probeLumen(
  lumen: Lumen,
  hit: LumenHit,
  x: number,
  y: number,
  z: number,
  radius: number,
  margin: number,
  query: ContactQuery,
): boolean {
  if (!queryLumen(lumen, x, y, z, radius, margin, hit)) {
    return false;
  }
  query.depth = hit.depth;
  query.violation = -hit.depth;
  query.normal[0] = hit.normal[0] ?? 0;
  query.normal[1] = hit.normal[1] ?? 0;
  query.normal[2] = hit.normal[2] ?? 0;
  return true;
}

/**
 * Coulomb friction against the wall on a node that pressed on it with force N in the last substep, as a damping
 * coefficient c = μ·N / max(|vₜ|, slipSpeed), N·s/m (0 for a free node). Applied implicitly (backward Euler) to the
 * tangential motion, it resists sliding with μ·N but can never reverse it, and below slipSpeed it holds the node
 * nearly still (regularized sticking) (prompts/M1-foundations.md §2; docs/M1-plan.md D29).
 */
export function slidingDamping(rod: RodState, node: number, mu: number, slipSpeed: number): number {
  const normalForce = rod.contactForce[node] ?? 0;
  if (!(normalForce > 0) || !(mu > 0)) {
    return 0;
  }
  const o = VEC3 * node;
  const nx = rod.contactNormal[o] ?? 0;
  const ny = rod.contactNormal[o + Y] ?? 0;
  const nz = rod.contactNormal[o + Z] ?? 0;
  const vx = rod.v[o] ?? 0;
  const vy = rod.v[o + Y] ?? 0;
  const vz = rod.v[o + Z] ?? 0;
  const vn = vx * nx + vy * ny + vz * nz;
  const tx = vx - vn * nx;
  const ty = vy - vn * ny;
  const tz = vz - vn * nz;
  return (mu * normalForce) / Math.max(Math.sqrt(tx * tx + ty * ty + tz * tz), slipSpeed);
}

/**
 * Torsional Coulomb friction on the segment ending at a node that pressed on the wall: torque μ·N·r against its spin
 * about its own tangent, as a damping coefficient μ·N·r / max(|ω·t|, slipSpin), N·m·s, applied implicitly in the same
 * way.
 */
export function twistDamping(
  rod: RodState,
  segment: number,
  node: number,
  tangent: Float64Array,
  mu: number,
  slipSpin: number,
): number {
  const normalForce = rod.contactForce[node] ?? 0;
  if (!(normalForce > 0) || !(mu > 0)) {
    return 0;
  }
  const o = VEC3 * segment;
  const spin =
    (rod.omega[o] ?? 0) * (tangent[0] ?? 0) +
    (rod.omega[o + Y] ?? 0) * (tangent[1] ?? 0) +
    (rod.omega[o + Z] ?? 0) * (tangent[2] ?? 0);
  return (mu * normalForce * (rod.outerRadius[segment] ?? 0)) / Math.max(Math.abs(spin), slipSpin);
}

/**
 * Implicit friction on a node's prediction: backward Euler with damping c and mass m keeps m / (m + h·c) of the
 * sliding velocity, so the prediction x + h·v moves back by h·(1 − keep)·vₜ.
 */
export function dampPredictedSliding(rod: RodState, node: number, h: number, keep: number): void {
  const o = VEC3 * node;
  const nx = rod.contactNormal[o] ?? 0;
  const ny = rod.contactNormal[o + Y] ?? 0;
  const nz = rod.contactNormal[o + Z] ?? 0;
  const vx = rod.v[o] ?? 0;
  const vy = rod.v[o + Y] ?? 0;
  const vz = rod.v[o + Z] ?? 0;
  const vn = vx * nx + vy * ny + vz * nz;
  const back = h * (1 - keep);
  rod.x[o] = (rod.x[o] ?? 0) - back * (vx - vn * nx);
  rod.x[o + Y] = (rod.x[o + Y] ?? 0) - back * (vy - vn * ny);
  rod.x[o + Z] = (rod.x[o + Z] ?? 0) - back * (vz - vn * nz);
}

/** The same for a segment's predicted spin about its tangent t: its orientation turns back by h·(1 − keep)·(ω·t). */
export function dampPredictedSpin(
  rod: RodState,
  segment: number,
  tangent: Float64Array,
  h: number,
  keep: number,
): void {
  const o = VEC3 * segment;
  const tx = tangent[0] ?? 0;
  const ty = tangent[1] ?? 0;
  const tz = tangent[2] ?? 0;
  const spin = (rod.omega[o] ?? 0) * tx + (rod.omega[o + Y] ?? 0) * ty + (rod.omega[o + Z] ?? 0) * tz;
  const angle = -h * (1 - keep) * spin;
  quatApplyWorldRotation(rod.q, QUAT * segment, angle * tx, angle * ty, angle * tz);
}
