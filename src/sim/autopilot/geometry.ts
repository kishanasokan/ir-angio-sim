import {
  findSegment,
  projectOntoCenterline,
  type Point3,
  type SimAnatomy,
  type SimAnatomySegment,
} from '../anatomy/graph';
import { TINY } from '../core/types';
import type { Vec3 } from './types';

/** Geometry the autopilot scripts read from the anatomy and the device view. */

/** Arc coordinate of a point along an anatomy segment's centerline, from the segment's first point. */
export function arcAlong(anatomy: SimAnatomy, segmentId: string, point: Vec3): number {
  return projectOntoCenterline(findSegment(anatomy, segmentId), point[0], point[1], point[2]).arc;
}

/** Arc coordinate of the last centerline vertex where the centerline turns: the end of the last bend. */
export function bendEndArc(segment: SimAnatomySegment): number {
  const points = segment.centerline;
  let arc = 0;
  let end = 0;
  for (let i = 0; i + 2 < points.length; i += 1) {
    const a = points[i] as Point3;
    const b = points[i + 1] as Point3;
    const c = points[i + 2] as Point3;
    const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const f = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const le = Math.sqrt(e[0]! * e[0]! + e[1]! * e[1]! + e[2]! * e[2]!);
    const lf = Math.sqrt(f[0]! * f[0]! + f[1]! * f[1]! + f[2]! * f[2]!);
    arc += le;
    const cosine = (e[0]! * f[0]! + e[1]! * f[1]! + e[2]! * f[2]!) / (le * lf);
    if (1 - cosine > TINY) {
      end = arc;
    }
  }
  return end;
}

/**
 * True when `direction`, seen along `tangent`, lies within the angle whose cosine is `cosLimit` of `target`: both
 * are projected perpendicular to the tangent first.
 */
export function alignedWithin(direction: Vec3, target: Vec3, tangent: Vec3, cosLimit: number): boolean {
  const project = (v: Vec3): Vec3 => {
    const along = v[0] * tangent[0] + v[1] * tangent[1] + v[2] * tangent[2];
    return [v[0] - along * tangent[0], v[1] - along * tangent[1], v[2] - along * tangent[2]];
  };
  const a = project(direction);
  const b = project(target);
  const na = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  const nb = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]);
  if (na === 0 || nb === 0) {
    return false;
  }
  return (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (na * nb) >= cosLimit;
}

export function length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
