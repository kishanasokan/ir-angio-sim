import { QUAT, VEC3, W, Y, Z } from '../core/types';
import { atan2, cos, sin } from '../math/detTrig';
import { quatAxis, quatRelative } from '../math/quat';
import type { RodState } from './state';

/**
 * Coaxial coupling as a composite rod (docs/M1-plan.md D29). Devices share the sheath valve, so the inner device's
 * node at arc distance u from the valve sits on the outer device's centerline at u while u is inside the outer
 * device. Where they overlap, the inner device's bending stiffness and rest curvature add to the outer device's
 * joints, so the stiffer member dominates the shared curvature: a wire straightens a curved catheter, and pulling it
 * back lets the curve re-form. Beyond the outer tip the inner device continues as its own rod, attached at the tip
 * like a combined beam (spec 04 §2.1). Each device follows its own hub, so sliding between devices is kinematic, and
 * friction between them shows in the sliding device's hub force (spec 04 §2.3; friction.ts).
 */

/** Arc distance of node i from the sheath valve. */
export function arcOfNode(rod: RodState, inserted: number, node: number): number {
  return inserted - (rod.segmentCount - node) * rod.segmentLength;
}

/** Fractional node coordinate of an arc distance: node i sits at i. */
function nodeCoordinate(rod: RodState, inserted: number, arc: number): number {
  return (arc - inserted) / rod.segmentLength + rod.segmentCount;
}

/**
 * The point at arc distance `arc` on a rod's centerline polyline; beyond the tip it continues along the tip segment.
 */
export function centerlinePoint(
  rod: RodState,
  inserted: number,
  arc: number,
  out: Float64Array,
  o: number,
): void {
  const n = rod.segmentCount;
  const t = nodeCoordinate(rod, inserted, arc);
  const i0 = Math.min(n - 1, Math.max(0, Math.floor(t)));
  const f = t - i0;
  const a = VEC3 * i0;
  const b = VEC3 * (i0 + 1);
  out[o] = (rod.x[a] ?? 0) + f * ((rod.x[b] ?? 0) - (rod.x[a] ?? 0));
  out[o + Y] = (rod.x[a + Y] ?? 0) + f * ((rod.x[b + Y] ?? 0) - (rod.x[a + Y] ?? 0));
  out[o + Z] = (rod.x[a + Z] ?? 0) + f * ((rod.x[b + Z] ?? 0) - (rod.x[a + Z] ?? 0));
}

/** The same interpolation for node velocities. */
export function centerlineVelocity(
  rod: RodState,
  inserted: number,
  arc: number,
  out: Float64Array,
  o: number,
): void {
  const n = rod.segmentCount;
  const t = nodeCoordinate(rod, inserted, arc);
  const i0 = Math.min(n - 1, Math.max(0, Math.floor(t)));
  const f = Math.min(1, Math.max(0, t - i0));
  const a = VEC3 * i0;
  const b = VEC3 * (i0 + 1);
  out[o] = (rod.v[a] ?? 0) + f * ((rod.v[b] ?? 0) - (rod.v[a] ?? 0));
  out[o + Y] = (rod.v[a + Y] ?? 0) + f * ((rod.v[b + Y] ?? 0) - (rod.v[a + Y] ?? 0));
  out[o + Z] = (rod.v[a + Z] ?? 0) + f * ((rod.v[b + Z] ?? 0) - (rod.v[a + Z] ?? 0));
}

/** Index of the segment containing arc distance `arc`, clamped to the rod. */
export function segmentAtArc(rod: RodState, inserted: number, arc: number): number {
  const t = nodeCoordinate(rod, inserted, arc);
  return Math.min(rod.segmentCount - 1, Math.max(0, Math.floor(t)));
}

/** The twist about d3 of the relative rotation between two segments, on the shortest arc (swing-twist split). */
export function jointTwist(rod: RodState, joint: number, scratch: Float64Array): number {
  quatRelative(rod.q, QUAT * joint, rod.q, QUAT * (joint + 1), scratch, 0);
  const sign = (scratch[W] ?? 1) < 0 ? -1 : 1;
  return 2 * atan2(sign * (scratch[Z] ?? 0), sign * (scratch[W] ?? 1));
}

/**
 * The outer device's accumulated twist from the hub to each joint: twist[j] is the sum of joint twists up to and
 * including joint j − 1, so twist[j] is the twist of segment j relative to the hub frame. `from` is the first segment
 * that may have left the hub frame.
 */
export function accumulateTwist(rod: RodState, from: number, out: Float64Array, scratch: Float64Array): void {
  // Segments before `from` (the first dynamic segment) are kinematic and share the hub frame: their twist is zero.
  const start = Math.max(1, from);
  out.fill(0, 0, Math.min(rod.segmentCount, start));
  for (let j = start; j < rod.segmentCount; j += 1) {
    out[j] = (out[j - 1] ?? 0) + jointTwist(rod, j - 1, scratch);
  }
}

/**
 * The inner device's rest chord at arc distance `arc`, interpolated between its joints and turned by ψ about d3
 * into the outer device's frame. Writes (x, y) into out; zero outside the inner device.
 */
export function innerRestChord(
  inner: RodState,
  innerInserted: number,
  arc: number,
  psi: number,
  out: Float64Array,
): void {
  // Joint j sits at node j + 1.
  const t = nodeCoordinate(inner, innerInserted, arc) - 1;
  const j0 = Math.floor(t);
  const f = t - j0;
  let cx = 0;
  let cy = 0;
  const joints = inner.segmentCount - 1;
  if (j0 >= 0 && j0 < joints) {
    cx += (1 - f) * (inner.restChord[VEC3 * j0] ?? 0);
    cy += (1 - f) * (inner.restChord[VEC3 * j0 + Y] ?? 0);
  }
  if (j0 + 1 >= 0 && j0 + 1 < joints) {
    cx += f * (inner.restChord[VEC3 * (j0 + 1)] ?? 0);
    cy += f * (inner.restChord[VEC3 * (j0 + 1) + Y] ?? 0);
  }
  const c = cos(psi);
  const s = sin(psi);
  out[0] = c * cx - s * cy;
  out[1] = s * cx + c * cy;
}

/** The inner device's bending stiffness at arc distance `arc` (its segment there). */
export function innerBending(inner: RodState, innerInserted: number, arc: number): number {
  return inner.bendingStiffness[segmentAtArc(inner, innerInserted, arc)] ?? 0;
}

/** Writes the d3 axis of a segment. */
export function segmentTangent(rod: RodState, segment: number, out: Float64Array, o: number): void {
  quatAxis(rod.q, QUAT * segment, 2, out, o);
}
