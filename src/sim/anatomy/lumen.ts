import { VEC3 } from '../core/types';
import type { SimAnatomy } from './graph';

/**
 * The vessel lumen as a union of capsules (prompts/M1-foundations.md §2): consecutive centerline points of every
 * anatomy segment form a capsule whose radius is interpolated linearly along its axis. A uniform grid indexes the
 * capsules so a query touches only nearby ones.
 */

export interface Lumen {
  readonly capsuleCount: number;
  /** Capsule end points a and b, packed (x, y, z) per capsule. */
  readonly a: Float64Array;
  readonly b: Float64Array;
  readonly radiusA: Float64Array;
  readonly radiusB: Float64Array;
  /** Anatomy segment index of each capsule. */
  readonly segment: Int32Array;
  readonly segmentIds: readonly string[];
  readonly segmentNames: readonly string[];
  readonly cell: number;
  readonly origin: readonly [number, number, number];
  readonly dims: readonly [number, number, number];
  /** Compressed rows: capsules of cell c are cellItems[cellStart[c] .. cellStart[c + 1]). */
  readonly cellStart: Int32Array;
  readonly cellItems: Int32Array;
}

export interface LumenHit {
  /** The capsule that contains the point most deeply, or the least-violated one; −1 when there is none. */
  capsule: number;
  /** Allowed distance minus actual distance from that capsule's axis: ≥ 0 inside, < 0 outside. */
  depth: number;
  /** Allowed distance from the axis at the closest point: max(0, R − r − margin). */
  allowed: number;
  /** Closest point on the capsule axis. */
  readonly axisPoint: Float64Array;
  /** Unit vector from the axis point toward the queried point. */
  readonly normal: Float64Array;
}

export function createLumenHit(): LumenHit {
  return {
    capsule: -1,
    depth: 0,
    allowed: 0,
    axisPoint: new Float64Array(VEC3),
    normal: new Float64Array(VEC3),
  };
}

export function buildLumen(anatomy: SimAnatomy, cell: number): Lumen {
  const capsules: { a: readonly number[]; b: readonly number[]; ra: number; rb: number; segment: number }[] =
    [];
  anatomy.segments.forEach((segment, s) => {
    for (let i = 0; i + 1 < segment.centerline.length; i += 1) {
      capsules.push({
        a: segment.centerline[i] ?? [0, 0, 0],
        b: segment.centerline[i + 1] ?? [0, 0, 0],
        ra: segment.radii[i] ?? 0,
        rb: segment.radii[i + 1] ?? 0,
        segment: s,
      });
    }
  });

  const count = capsules.length;
  const a = new Float64Array(VEC3 * count);
  const b = new Float64Array(VEC3 * count);
  const radiusA = new Float64Array(count);
  const radiusB = new Float64Array(count);
  const segment = new Int32Array(count);
  capsules.forEach((capsule, i) => {
    a.set(capsule.a, VEC3 * i);
    b.set(capsule.b, VEC3 * i);
    radiusA[i] = capsule.ra;
    radiusB[i] = capsule.rb;
    segment[i] = capsule.segment;
  });

  // Each capsule is registered in every cell its bounding box touches, padded by its radius plus one cell so that
  // points slightly outside the lumen still find the capsule they must be projected back into.
  const lower = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const upper = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const boxes = capsules.map((capsule) => {
    const pad = Math.max(capsule.ra, capsule.rb) + cell;
    const low = [0, 1, 2].map((k) => Math.min(capsule.a[k] ?? 0, capsule.b[k] ?? 0) - pad);
    const high = [0, 1, 2].map((k) => Math.max(capsule.a[k] ?? 0, capsule.b[k] ?? 0) + pad);
    for (let k = 0; k < VEC3; k += 1) {
      lower[k] = Math.min(lower[k] ?? 0, low[k] ?? 0);
      upper[k] = Math.max(upper[k] ?? 0, high[k] ?? 0);
    }
    return { low, high };
  });
  const origin: [number, number, number] =
    count === 0 ? [0, 0, 0] : [lower[0] ?? 0, lower[1] ?? 0, lower[2] ?? 0];
  const dims: [number, number, number] =
    count === 0
      ? [1, 1, 1]
      : ([0, 1, 2].map((k) => Math.max(1, Math.floor(((upper[k] ?? 0) - (origin[k] ?? 0)) / cell) + 1)) as [
          number,
          number,
          number,
        ]);
  const cellCount = dims[0] * dims[1] * dims[2];
  const buckets: number[][] = Array.from({ length: cellCount }, () => []);
  boxes.forEach((box, i) => {
    const from = [0, 1, 2].map((k) => Math.floor(((box.low[k] ?? 0) - (origin[k] ?? 0)) / cell));
    const to = [0, 1, 2].map((k) => Math.floor(((box.high[k] ?? 0) - (origin[k] ?? 0)) / cell));
    for (let x = Math.max(0, from[0] ?? 0); x <= Math.min(dims[0] - 1, to[0] ?? 0); x += 1) {
      for (let y = Math.max(0, from[1] ?? 0); y <= Math.min(dims[1] - 1, to[1] ?? 0); y += 1) {
        for (let z = Math.max(0, from[2] ?? 0); z <= Math.min(dims[2] - 1, to[2] ?? 0); z += 1) {
          buckets[(x * dims[1] + y) * dims[2] + z]?.push(i);
        }
      }
    }
  });
  const cellStart = new Int32Array(cellCount + 1);
  buckets.forEach((items, c) => {
    cellStart[c + 1] = (cellStart[c] ?? 0) + items.length;
  });
  const cellItems = new Int32Array(cellStart[cellCount] ?? 0);
  buckets.forEach((items, c) => {
    cellItems.set(items, cellStart[c] ?? 0);
  });

  return {
    capsuleCount: count,
    a,
    b,
    radiusA,
    radiusB,
    segment,
    segmentIds: anatomy.segments.map((entry) => entry.id),
    segmentNames: anatomy.segments.map((entry) => entry.tags.name),
    cell,
    origin,
    dims,
    cellStart,
    cellItems,
  };
}

/** Evaluates one capsule for a point; updates `hit` when this capsule contains the point more deeply. */
function testCapsule(
  lumen: Lumen,
  i: number,
  x: number,
  y: number,
  z: number,
  deviceRadius: number,
  margin: number,
  hit: LumenHit,
): void {
  const o = VEC3 * i;
  const ax = lumen.a[o] ?? 0;
  const ay = lumen.a[o + 1] ?? 0;
  const az = lumen.a[o + 2] ?? 0;
  const ex = (lumen.b[o] ?? 0) - ax;
  const ey = (lumen.b[o + 1] ?? 0) - ay;
  const ez = (lumen.b[o + 2] ?? 0) - az;
  const length2 = ex * ex + ey * ey + ez * ez;
  let t = length2 > 0 ? ((x - ax) * ex + (y - ay) * ey + (z - az) * ez) / length2 : 0;
  t = Math.min(1, Math.max(0, t));
  const cx = ax + t * ex;
  const cy = ay + t * ey;
  const cz = az + t * ez;
  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const radius = (lumen.radiusA[i] ?? 0) + t * ((lumen.radiusB[i] ?? 0) - (lumen.radiusA[i] ?? 0));
  const allowed = Math.max(0, radius - deviceRadius - margin);
  const depth = allowed - distance;
  if (hit.capsule < 0 || depth > hit.depth) {
    hit.capsule = i;
    hit.depth = depth;
    hit.allowed = allowed;
    hit.axisPoint[0] = cx;
    hit.axisPoint[1] = cy;
    hit.axisPoint[2] = cz;
    if (distance > 0) {
      hit.normal[0] = dx / distance;
      hit.normal[1] = dy / distance;
      hit.normal[2] = dz / distance;
    } else {
      // On the axis: any direction perpendicular to it will do; it only matters for projection, which needs none.
      hit.normal[0] = 0;
      hit.normal[1] = 0;
      hit.normal[2] = 0;
    }
  }
}

/**
 * Finds the capsule that contains a point most deeply, for a device of radius r: the allowed distance from a capsule
 * axis is max(0, R − r − margin). Returns false when the lumen is empty (free space).
 */
export function queryLumen(
  lumen: Lumen,
  x: number,
  y: number,
  z: number,
  deviceRadius: number,
  margin: number,
  hit: LumenHit,
): boolean {
  hit.capsule = -1;
  if (lumen.capsuleCount === 0) {
    return false;
  }
  const cx = Math.floor((x - lumen.origin[0]) / lumen.cell);
  const cy = Math.floor((y - lumen.origin[1]) / lumen.cell);
  const cz = Math.floor((z - lumen.origin[2]) / lumen.cell);
  const inGrid =
    cx >= 0 && cy >= 0 && cz >= 0 && cx < lumen.dims[0] && cy < lumen.dims[1] && cz < lumen.dims[2];
  if (inGrid) {
    const c = (cx * lumen.dims[1] + cy) * lumen.dims[2] + cz;
    for (let k = lumen.cellStart[c] ?? 0; k < (lumen.cellStart[c + 1] ?? 0); k += 1) {
      testCapsule(lumen, lumen.cellItems[k] ?? 0, x, y, z, deviceRadius, margin, hit);
    }
  }
  if (hit.capsule < 0) {
    // Far from every registered cell: fall back to every capsule.
    for (let i = 0; i < lumen.capsuleCount; i += 1) {
      testCapsule(lumen, i, x, y, z, deviceRadius, margin, hit);
    }
  }
  return true;
}

/** True when the point lies within the allowed distance of a specific anatomy segment's capsules. */
export function insideSegment(
  lumen: Lumen,
  segmentIndex: number,
  x: number,
  y: number,
  z: number,
  deviceRadius: number,
  margin: number,
): boolean {
  const hit = createLumenHit();
  for (let i = 0; i < lumen.capsuleCount; i += 1) {
    if (lumen.segment[i] === segmentIndex) {
      testCapsule(lumen, i, x, y, z, deviceRadius, margin, hit);
    }
  }
  return hit.capsule >= 0 && hit.depth >= 0;
}
