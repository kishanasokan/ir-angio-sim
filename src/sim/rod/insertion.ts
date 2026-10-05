import { LENGTH_EPSILON, QUAT, VEC3, X, Y, Z } from '../core/types';
import { quatFromAxisAngle, quatFromMatrix, quatMultiply } from '../math/quat';
import type { RodState } from './state';

/**
 * Insertion and the sheath (prompts/M1-foundations.md §2). The sheath tip is the access node; the sheath valve sits
 * one sheath length behind it along the access axis. A device's insertion depth L is its length distal to the
 * valve; its hub rotation φ is the accumulated rotation input. Nodes proximal to the sheath tip (inside the sheath
 * or outside the patient) are kinematic on the access axis, so the sheath tip acts as a clamp.
 */

export interface AccessFrame {
  /** The sheath tip: the access node. */
  readonly tip: Float64Array;
  /** Unit vector pointing into the vessel. */
  readonly direction: Float64Array;
  /** The sheath valve: tip − direction × sheath length. */
  readonly valve: Float64Array;
  /** Material frame at hub rotation 0: d1 is world +x projected perpendicular to the access direction. */
  readonly q: Float64Array;
  readonly sheathLength: number;
}

// When the access axis is nearly parallel to +x, project +y instead to define d1.
const MIN_PROJECTION = 0.5;

export function createAccessFrame(
  position: readonly number[],
  direction: readonly number[],
  sheathLength: number,
): AccessFrame {
  const d = new Float64Array(VEC3);
  const norm = Math.sqrt(
    (direction[X] ?? 0) * (direction[X] ?? 0) +
      (direction[Y] ?? 0) * (direction[Y] ?? 0) +
      (direction[Z] ?? 0) * (direction[Z] ?? 0),
  );
  d[X] = (direction[X] ?? 0) / norm;
  d[Y] = (direction[Y] ?? 0) / norm;
  d[Z] = (direction[Z] ?? 1) / norm;

  // d1 = +x projected perpendicular to the access direction (or +y if +x is nearly parallel to it).
  let d1x = 1 - (d[X] ?? 0) * (d[X] ?? 0);
  let d1y = -(d[X] ?? 0) * (d[Y] ?? 0);
  let d1z = -(d[X] ?? 0) * (d[Z] ?? 0);
  if (Math.sqrt(d1x * d1x + d1y * d1y + d1z * d1z) < MIN_PROJECTION) {
    d1x = -(d[Y] ?? 0) * (d[X] ?? 0);
    d1y = 1 - (d[Y] ?? 0) * (d[Y] ?? 0);
    d1z = -(d[Y] ?? 0) * (d[Z] ?? 0);
  }
  const d1Norm = Math.sqrt(d1x * d1x + d1y * d1y + d1z * d1z);
  d1x /= d1Norm;
  d1y /= d1Norm;
  d1z /= d1Norm;
  // d2 = d3 × d1
  const d2x = (d[Y] ?? 0) * d1z - (d[Z] ?? 0) * d1y;
  const d2y = (d[Z] ?? 0) * d1x - (d[X] ?? 0) * d1z;
  const d2z = (d[X] ?? 0) * d1y - (d[Y] ?? 0) * d1x;
  // Columns d1, d2, d3, row-major.
  const matrix = [d1x, d2x, d[X] ?? 0, d1y, d2y, d[Y] ?? 0, d1z, d2z, d[Z] ?? 0];
  const q = new Float64Array(QUAT);
  quatFromMatrix(matrix, 0, q, 0);

  const tip = new Float64Array([position[X] ?? 0, position[Y] ?? 0, position[Z] ?? 0]);
  const valve = new Float64Array([
    (tip[X] ?? 0) - (d[X] ?? 0) * sheathLength,
    (tip[Y] ?? 0) - (d[Y] ?? 0) * sheathLength,
    (tip[Z] ?? 0) - (d[Z] ?? 0) * sheathLength,
  ]);
  return { tip, direction: d, valve, q, sheathLength };
}

/**
 * The hub orientation: the access frame turned by φ about the access axis. Rebuilt from φ with detTrig every time,
 * so no rounding drift accumulates (spec 01 §4.4).
 */
export function hubQuaternion(frame: AccessFrame, rotation: number, out: Float64Array, o: number): void {
  quatFromAxisAngle(0, 0, 1, rotation, out, o);
  quatMultiply(frame.q, 0, out, o, out, o);
}

/** Arc distance of node i from the sheath valve, for insertion depth L. */
export function nodeArc(rod: RodState, inserted: number, node: number): number {
  return inserted - (rod.segmentCount - node) * rod.segmentLength;
}

/** True when a node at this arc distance is kinematic: at or proximal to the sheath tip (D10). */
export function isKinematicArc(frame: AccessFrame, arc: number): boolean {
  return arc <= frame.sheathLength + LENGTH_EPSILON;
}

/**
 * Places the kinematic part of a rod for insertion depth L and hub rotation φ, with velocities from their rates, and
 * returns the index of the first dynamic node (segmentCount + 1 when the whole rod is kinematic). Only nodes from
 * `from` on are placed (and the two before the first dynamic node, wherever it is): a substep needs just the part next
 * to the sheath tip, and the engine places the whole rod once per step.
 */
export function placeKinematic(
  rod: RodState,
  frame: AccessFrame,
  inserted: number,
  rotation: number,
  insertRate: number,
  rotateRate: number,
  from = 0,
): number {
  const nodes = rod.segmentCount + 1;
  // The first dynamic node, searched from `from`: insertion moves far less than a segment per substep.
  let firstDynamic = Math.min(nodes, Math.max(0, from));
  while (firstDynamic > 0 && !isKinematicArc(frame, nodeArc(rod, inserted, firstDynamic - 1))) {
    firstDynamic -= 1;
  }
  while (firstDynamic < nodes && isKinematicArc(frame, nodeArc(rod, inserted, firstDynamic))) {
    firstDynamic += 1;
  }
  const start = Math.max(0, Math.min(from, firstDynamic - 2));
  const vx = frame.valve[X] ?? 0;
  const vy = frame.valve[Y] ?? 0;
  const vz = frame.valve[Z] ?? 0;
  const dx = frame.direction[X] ?? 0;
  const dy = frame.direction[Y] ?? 0;
  const dz = frame.direction[Z] ?? 0;
  const { x, v } = rod;
  for (let i = start; i < firstDynamic; i += 1) {
    const arc = nodeArc(rod, inserted, i);
    const o = VEC3 * i;
    x[o] = vx + dx * arc;
    x[o + Y] = vy + dy * arc;
    x[o + Z] = vz + dz * arc;
    v[o] = dx * insertRate;
    v[o + Y] = dy * insertRate;
    v[o + Z] = dz * insertRate;
  }
  rod.kinematic.fill(1, start, firstDynamic);
  rod.kinematic.fill(0, firstDynamic);
  // A segment is kinematic when both its nodes are. They all share the hub frame and spin.
  if (firstDynamic >= 2) {
    const hub = firstDynamic - 2;
    hubQuaternion(frame, rotation, rod.q, QUAT * hub);
    for (let j = start; j <= hub; j += 1) {
      if (j < hub) {
        rod.q.copyWithin(QUAT * j, QUAT * hub, QUAT * hub + QUAT);
      }
      const o = VEC3 * j;
      rod.omega[o] = (frame.direction[X] ?? 0) * rotateRate;
      rod.omega[o + Y] = (frame.direction[Y] ?? 0) * rotateRate;
      rod.omega[o + Z] = (frame.direction[Z] ?? 0) * rotateRate;
    }
  }
  return firstDynamic;
}

/** Puts the whole rod straight on the access axis at rest: the starting pose (docs/M1-plan.md D15). */
export function placeStraight(rod: RodState, frame: AccessFrame, inserted: number, rotation: number): void {
  for (let i = 0; i <= rod.segmentCount; i += 1) {
    const arc = nodeArc(rod, inserted, i);
    const o = VEC3 * i;
    rod.x[o] = (frame.valve[X] ?? 0) + (frame.direction[X] ?? 0) * arc;
    rod.x[o + Y] = (frame.valve[Y] ?? 0) + (frame.direction[Y] ?? 0) * arc;
    rod.x[o + Z] = (frame.valve[Z] ?? 0) + (frame.direction[Z] ?? 0) * arc;
    rod.kinematic[i] = isKinematicArc(frame, arc) ? 1 : 0;
  }
  rod.xPrev.set(rod.x);
  rod.v.fill(0);
  for (let j = 0; j < rod.segmentCount; j += 1) {
    hubQuaternion(frame, rotation, rod.q, QUAT * j);
  }
  rod.qPrev.set(rod.q);
  rod.omega.fill(0);
  rod.contactForce.fill(0);
}
