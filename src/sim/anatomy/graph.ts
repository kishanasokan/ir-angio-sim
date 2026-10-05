/**
 * The anatomy graph as the simulation receives it at load: metres, LPS patient frame (x left, y posterior,
 * z superior). The data layer converts the /data graph (spec 02 §9.2) into this shape.
 */

export type Point3 = readonly [number, number, number];

export interface SimAnatomySegment {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly centerline: readonly Point3[];
  /** Lumen radius at each centerline point. */
  readonly radii: readonly number[];
  readonly tags: { readonly name: string; readonly territory: string };
}

export interface SimAnatomy {
  readonly id: string;
  readonly nodes: readonly { readonly id: string; readonly kind: string; readonly position: Point3 }[];
  readonly segments: readonly SimAnatomySegment[];
  readonly access: readonly {
    readonly id: string;
    readonly node: string;
    readonly position: Point3;
    /** Unit vector pointing into the vessel. */
    readonly direction: Point3;
  }[];
}

export interface CenterlineProjection {
  /** Arc length from the segment's first centerline point to the closest point. */
  readonly arc: number;
  /** Distance from the point to the centerline. */
  readonly distance: number;
}

/**
 * Projects a point onto a segment's centerline polyline: the arc coordinate golden scenes use for "tip advance" and
 * "past the carina" (prompts/M1-foundations.md §8).
 */
export function projectOntoCenterline(
  segment: SimAnatomySegment,
  x: number,
  y: number,
  z: number,
): CenterlineProjection {
  let bestDistance2 = Number.POSITIVE_INFINITY;
  let bestArc = 0;
  let arcStart = 0;
  const points = segment.centerline;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i] as Point3;
    const b = points[i + 1] as Point3;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const ez = b[2] - a[2];
    const length2 = ex * ex + ey * ey + ez * ez;
    const length = Math.sqrt(length2);
    let t = length2 > 0 ? ((x - a[0]) * ex + (y - a[1]) * ey + (z - a[2]) * ez) / length2 : 0;
    t = Math.min(1, Math.max(0, t));
    const dx = x - (a[0] + t * ex);
    const dy = y - (a[1] + t * ey);
    const dz = z - (a[2] + t * ez);
    const distance2 = dx * dx + dy * dy + dz * dz;
    if (distance2 < bestDistance2) {
      bestDistance2 = distance2;
      bestArc = arcStart + t * length;
    }
    arcStart += length;
  }
  return { arc: bestArc, distance: Math.sqrt(bestDistance2) };
}

/** Total centerline length of a segment. */
export function centerlineLength(segment: SimAnatomySegment): number {
  let total = 0;
  const points = segment.centerline;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i] as Point3;
    const b = points[i + 1] as Point3;
    total += Math.sqrt(
      (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) + (b[2] - a[2]) * (b[2] - a[2]),
    );
  }
  return total;
}

export function findSegment(anatomy: SimAnatomy, id: string): SimAnatomySegment {
  const segment = anatomy.segments.find((entry) => entry.id === id);
  if (segment === undefined) {
    throw new Error(`Anatomy ${anatomy.id} has no segment "${id}".`);
  }
  return segment;
}
