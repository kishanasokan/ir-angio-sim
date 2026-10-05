/**
 * Rest shapes (spec 02 §11.1, prompts/M1-foundations.md §1.5). A region turns the tip by exactly its bend angle:
 * the angle is shared equally among the joints whose positions fall inside [fromTip, toTip]; if none does, the
 * nearest joint takes all of it, so the total survives any segment length.
 *
 * Joint j joins segments j and j+1 and sits at node j+1. Nodes run from the handle (index 0) to the tip (last
 * index), so joint j lies (segmentCount − 1 − j) segment lengths from the tip.
 */

export type BendDirection = 'd1' | 'd2';

export interface RestShapeRegion {
  /** Metres from the tip. */
  readonly fromTip: number;
  readonly toTip: number;
  /** Radians. */
  readonly bendAngle: number;
  /** The material axis the tip turns toward. */
  readonly toward: BendDirection;
}

export interface JointShare {
  readonly region: number;
  readonly joint: number;
  /** Metres from the tip. */
  readonly distanceFromTip: number;
  /** Radians. */
  readonly angle: number;
  readonly toward: BendDirection;
}

export interface RestShapeDistribution {
  /** Rest bend per joint toward d1 (a rotation about d2), radians; length segmentCount − 1. */
  readonly towardD1: Float64Array;
  /** Rest bend per joint toward d2 (a rotation about −d1), radians. */
  readonly towardD2: Float64Array;
  readonly shares: readonly JointShare[];
}

// Region ends that land on a joint include it; this only absorbs floating-point noise in metre values.
const BOUNDARY_TOLERANCE = 1e-9;

export function jointDistanceFromTip(joint: number, segmentCount: number, segmentLength: number): number {
  return (segmentCount - 1 - joint) * segmentLength;
}

export function distributeRestShape(
  regions: readonly RestShapeRegion[],
  segmentCount: number,
  segmentLength: number,
): RestShapeDistribution {
  const jointCount = segmentCount - 1;
  if (jointCount < 1) {
    throw new Error('A rod needs at least two segments to carry a rest shape.');
  }
  const towardD1 = new Float64Array(jointCount);
  const towardD2 = new Float64Array(jointCount);
  const shares: JointShare[] = [];
  const tolerance = segmentLength * BOUNDARY_TOLERANCE;

  regions.forEach((region, regionIndex) => {
    if (region.toTip < region.fromTip) {
      throw new Error(`Rest-shape region ${regionIndex} ends before it starts.`);
    }
    const inside: number[] = [];
    for (let joint = 0; joint < jointCount; joint += 1) {
      const distance = jointDistanceFromTip(joint, segmentCount, segmentLength);
      if (distance >= region.fromTip - tolerance && distance <= region.toTip + tolerance) {
        inside.push(joint);
      }
    }
    const joints = inside.length > 0 ? inside : [nearestJoint(region, segmentCount, segmentLength)];
    const angle = region.bendAngle / joints.length;
    const target = region.toward === 'd1' ? towardD1 : towardD2;
    for (const joint of joints) {
      target[joint] = (target[joint] ?? 0) + angle;
      shares.push({
        region: regionIndex,
        joint,
        distanceFromTip: jointDistanceFromTip(joint, segmentCount, segmentLength),
        angle,
        toward: region.toward,
      });
    }
  });

  return { towardD1, towardD2, shares };
}

/** The joint closest to a region; ties go to the more distal joint. */
function nearestJoint(region: RestShapeRegion, segmentCount: number, segmentLength: number): number {
  let best = segmentCount - 2;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let joint = segmentCount - 2; joint >= 0; joint -= 1) {
    const distance = jointDistanceFromTip(joint, segmentCount, segmentLength);
    const gap = Math.max(region.fromTip - distance, 0, distance - region.toTip);
    if (gap < bestGap) {
      best = joint;
      bestGap = gap;
    }
  }
  return best;
}
