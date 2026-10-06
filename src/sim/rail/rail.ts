import type { SimAnatomy } from '../anatomy/graph';
import { LENGTH_EPSILON, QUAT, VEC3, X, Y, Z } from '../core/types';
import { atan2, cos, sin } from '../math/detTrig';
import { quatAxis, quatCopy, quatFromAxisAngle, quatMultiply } from '../math/quat';
import { hubQuaternion, type AccessFrame } from '../rod/insertion';
import type { RodState } from '../rod/state';

/**
 * The rail model (spec 04 §6), the fallback tier for machines too slow for rods. Every device lies on one shared path
 * of vessel centerlines from the sheath valve: insertion moves its nodes along the path, an inner device rides inside
 * its outer device on the same path, and the device that leads chooses the branch at each junction its tip reaches:
 * the daughter whose direction best matches the tip's rest bend, turned by the hub rotation (golden scene 16). A cap
 * stops the tips; the extra push raises the hub force at `capStiffness`. Pulling every tip back behind a junction
 * forgets the choice, so the learner can turn the tip and choose again. The rods' arrays carry the result, so
 * snapshots, rendering and the HUD need no change.
 */

/** What the rail needs of each device, outermost first. */
export interface RailDevice {
  rod: RodState;
  /** Insertion depth from the sheath valve and hub rotation at the end of the step, m and rad. */
  inserted: number;
  rotation: number;
  /** The tip's rest bend: its direction in the tip frame (d1, d2) and its total angle, rad (0 for a straight tip). */
  bendD1: number;
  bendD2: number;
  bendAngle: number;
}

/** Per-device results of a rail step. */
export interface RailResult {
  /** Push beyond the cap, m, and the hub and tip forces it makes, N. */
  readonly excess: Float64Array;
  readonly hubForce: Float64Array;
  /** First node beyond the sheath tip, per device. */
  readonly firstFree: Int32Array;
}

export interface RailWorld {
  readonly anatomy: SimAnatomy;
  readonly frame: AccessFrame;
  readonly capStiffness: number;
  readonly lumenMargin: number;
  /** Path points (x, y, z) and the arc from the valve at each: valve, sheath tip, then vessel centerlines. */
  readonly points: Float64Array;
  readonly arcs: Float64Array;
  count: number;
  /** The anatomy segment each path part runs along, the arc it starts at, and the node it ends at. */
  readonly partSegment: Int32Array;
  readonly partStart: Float64Array;
  readonly partPoint: Int32Array;
  parts: number;
  endNode: string;
  /** Lumen radius at the path's end, m. */
  endRadius: number;
  readonly result: RailResult;
  readonly scratch: {
    readonly quat: Float64Array;
    readonly a: Float64Array;
    readonly b: Float64Array;
    readonly direction: Float64Array;
    readonly choice: Float64Array;
  };
}

export function createRailWorld(
  anatomy: SimAnatomy,
  frame: AccessFrame,
  accessNode: string,
  deviceCount: number,
  capStiffness: number,
  lumenMargin: number,
): RailWorld {
  // Two sheath points, then at most every centerline point once.
  const capacity = anatomy.segments.reduce((sum, segment) => sum + segment.centerline.length, 2);
  const world: RailWorld = {
    anatomy,
    frame,
    capStiffness,
    lumenMargin,
    points: new Float64Array(VEC3 * capacity),
    arcs: new Float64Array(capacity),
    count: 0,
    partSegment: new Int32Array(anatomy.segments.length + 1),
    partStart: new Float64Array(anatomy.segments.length + 1),
    partPoint: new Int32Array(anatomy.segments.length + 1),
    parts: 0,
    endNode: accessNode,
    endRadius: 0,
    result: {
      excess: new Float64Array(deviceCount),
      hubForce: new Float64Array(deviceCount),
      firstFree: new Int32Array(deviceCount),
    },
    scratch: {
      quat: new Float64Array(QUAT),
      a: new Float64Array(VEC3),
      b: new Float64Array(VEC3),
      direction: new Float64Array(VEC3),
      choice: new Float64Array(VEC3),
    },
  };
  pushPoint(world, frame.valve[X] ?? 0, frame.valve[Y] ?? 0, frame.valve[Z] ?? 0);
  pushPoint(world, frame.tip[X] ?? 0, frame.tip[Y] ?? 0, frame.tip[Z] ?? 0);
  const first = anatomy.segments.findIndex(
    (segment) => segment.from === accessNode || segment.to === accessNode,
  );
  if (first >= 0) {
    appendSegment(world, first);
  }
  return world;
}

function pushPoint(world: RailWorld, x: number, y: number, z: number): void {
  const n = world.count;
  const o = VEC3 * n;
  if (n > 0) {
    const dx = x - (world.points[o - VEC3] ?? 0);
    const dy = y - (world.points[o - VEC3 + Y] ?? 0);
    const dz = z - (world.points[o - VEC3 + Z] ?? 0);
    const step = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (step <= LENGTH_EPSILON) {
      return;
    }
    world.arcs[n] = (world.arcs[n - 1] ?? 0) + step;
  } else {
    world.arcs[n] = 0;
  }
  world.points[o] = x;
  world.points[o + Y] = y;
  world.points[o + Z] = z;
  world.count = n + 1;
}

/** Appends an anatomy segment to the path, walking it away from the path's end node. */
function appendSegment(world: RailWorld, index: number): void {
  const segment = world.anatomy.segments[index];
  if (segment === undefined) {
    return;
  }
  const forward = segment.from === world.endNode;
  const points = segment.centerline;
  world.partSegment[world.parts] = index;
  world.partStart[world.parts] = world.arcs[world.count - 1] ?? 0;
  world.partPoint[world.parts] = world.count - 1;
  world.parts += 1;
  for (let k = 0; k < points.length; k += 1) {
    const p = points[forward ? k : points.length - 1 - k];
    if (p !== undefined) {
      pushPoint(world, p[X], p[Y], p[Z]);
    }
  }
  world.endNode = forward ? segment.to : segment.from;
  world.endRadius = (forward ? segment.radii.at(-1) : segment.radii[0]) ?? 0;
}

/** Drops the path's last part, back to the node it started at. */
function dropLastPart(world: RailWorld): void {
  world.parts -= 1;
  const index = world.partSegment[world.parts] ?? 0;
  const segment = world.anatomy.segments[index];
  world.count = (world.partPoint[world.parts] ?? 0) + 1;
  if (segment !== undefined) {
    // The node the dropped part began at: the end node it led away from.
    world.endNode = segment.to === world.endNode ? segment.from : segment.to;
    const previous = world.anatomy.segments[world.partSegment[world.parts - 1] ?? -1];
    world.endRadius =
      previous === undefined
        ? 0
        : ((previous.to === world.endNode ? previous.radii.at(-1) : previous.radii[0]) ?? 0);
  }
}

/** Anatomy segments leaving the path's end node, other than the one the path arrived on. */
function daughters(world: RailWorld): number[] {
  const arrived = world.parts > 0 ? (world.partSegment[world.parts - 1] ?? -1) : -1;
  const out: number[] = [];
  world.anatomy.segments.forEach((segment, i) => {
    if (i !== arrived && (segment.from === world.endNode || segment.to === world.endNode)) {
      out.push(i);
    }
  });
  return out;
}

/** The unit direction of a segment's first step away from `node`. */
function leavingDirection(world: RailWorld, index: number, out: Float64Array): void {
  const segment = world.anatomy.segments[index];
  const points = segment?.centerline ?? [];
  const forward = segment?.from === world.endNode;
  const a = points[forward ? 0 : points.length - 1];
  const b = points[forward ? 1 : points.length - 2];
  const dx = (b?.[X] ?? 0) - (a?.[X] ?? 0);
  const dy = (b?.[Y] ?? 0) - (a?.[Y] ?? 0);
  const dz = (b?.[Z] ?? 0) - (a?.[Z] ?? 0);
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  out[X] = length > 0 ? dx / length : 0;
  out[Y] = length > 0 ? dy / length : 0;
  out[Z] = length > 0 ? dz / length : 0;
}

/** The farthest arc a device's tip can reach: the cap's allowed surface, or the junction the path ends at. */
function tipLimit(world: RailWorld, rod: RodState): number {
  const end = world.arcs[world.count - 1] ?? 0;
  const radius = rod.outerRadius[rod.segmentCount - 1] ?? 0;
  return daughters(world).length === 0
    ? end + Math.max(0, world.endRadius - radius - world.lumenMargin)
    : end;
}

/** The point at arc `arc` on the path; before the valve and past the end it continues straight. */
function pathPoint(world: RailWorld, arc: number, hint: number, out: Float64Array, o: number): number {
  const last = world.count - 1;
  let k = Math.min(Math.max(0, hint), Math.max(0, last - 1));
  while (k + 1 < last && arc > (world.arcs[k + 1] ?? 0)) {
    k += 1;
  }
  while (k > 0 && arc < (world.arcs[k] ?? 0)) {
    k -= 1;
  }
  const a0 = world.arcs[k] ?? 0;
  const a1 = world.arcs[k + 1] ?? a0;
  const t = a1 > a0 ? (arc - a0) / (a1 - a0) : 0;
  const pa = VEC3 * k;
  const pb = VEC3 * (k + 1);
  for (let c = 0; c < VEC3; c += 1) {
    const p0 = world.points[pa + c] ?? 0;
    out[o + c] = p0 + t * ((world.points[pb + c] ?? p0) - p0);
  }
  return k;
}

/**
 * Turns quaternion `q` (segment `from`) to the next segment's tangent with the smallest rotation, writing segment
 * `to`'s quaternion: parallel transport of the material frame along the path.
 */
function transport(rod: RodState, from: number, to: number, world: RailWorld): void {
  const { a, b, quat } = world.scratch;
  quatAxis(rod.q, QUAT * from, Z, a, 0);
  const o = VEC3 * to;
  const dx = (rod.x[o + VEC3] ?? 0) - (rod.x[o] ?? 0);
  const dy = (rod.x[o + VEC3 + Y] ?? 0) - (rod.x[o + Y] ?? 0);
  const dz = (rod.x[o + VEC3 + Z] ?? 0) - (rod.x[o + Z] ?? 0);
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length <= LENGTH_EPSILON) {
    quatCopy(rod.q, QUAT * from, rod.q, QUAT * to);
    return;
  }
  b[X] = dx / length;
  b[Y] = dy / length;
  b[Z] = dz / length;
  const cx = (a[Y] ?? 0) * (b[Z] ?? 0) - (a[Z] ?? 0) * (b[Y] ?? 0);
  const cy = (a[Z] ?? 0) * (b[X] ?? 0) - (a[X] ?? 0) * (b[Z] ?? 0);
  const cz = (a[X] ?? 0) * (b[Y] ?? 0) - (a[Y] ?? 0) * (b[X] ?? 0);
  const s = Math.sqrt(cx * cx + cy * cy + cz * cz);
  const c = (a[X] ?? 0) * (b[X] ?? 0) + (a[Y] ?? 0) * (b[Y] ?? 0) + (a[Z] ?? 0) * (b[Z] ?? 0);
  if (s <= LENGTH_EPSILON) {
    quatCopy(rod.q, QUAT * from, rod.q, QUAT * to);
    return;
  }
  quatFromAxisAngle(cx / s, cy / s, cz / s, atan2(s, c), quat, 0);
  quatMultiply(quat, 0, rod.q, QUAT * from, rod.q, QUAT * to);
}

/**
 * Places a device's nodes on the path for an effective insertion depth, and its frames by parallel transport.
 * Returns its first node beyond the sheath tip.
 */
function place(world: RailWorld, device: RailDevice, depth: number): number {
  const { rod } = device;
  const n = rod.segmentCount;
  const l = rod.segmentLength;
  const sheath = world.frame.sheathLength;
  let hint = 0;
  let firstFree = n + 1;
  for (let i = 0; i <= n; i += 1) {
    const arc = depth - (n - i) * l;
    const o = VEC3 * i;
    if (arc <= 0) {
      // Outside the patient, on the access axis behind the valve.
      for (let c = 0; c < VEC3; c += 1) {
        rod.x[o + c] = (world.frame.valve[c] ?? 0) + arc * (world.frame.direction[c] ?? 0);
      }
    } else {
      hint = pathPoint(world, arc, hint, rod.x, o);
    }
    const kinematic = arc <= sheath + LENGTH_EPSILON ? 1 : 0;
    rod.kinematic[i] = kinematic;
    if (kinematic === 0 && firstFree > n) {
      firstFree = i;
    }
  }
  hubQuaternion(world.frame, device.rotation, rod.q, 0);
  for (let j = 1; j < n; j += 1) {
    transport(rod, j - 1, j, world);
  }
  rod.omega.fill(0);
  rod.contactForce.fill(0);
  return firstFree;
}

/** The leading device's tip direction in the world: its last segment's tangent turned by its rest bend. */
function tipDirection(world: RailWorld, device: RailDevice, out: Float64Array): void {
  const { rod } = device;
  const { a, b } = world.scratch;
  const tip = QUAT * (rod.segmentCount - 1);
  quatAxis(rod.q, tip, Z, out, 0);
  quatAxis(rod.q, tip, X, a, 0);
  quatAxis(rod.q, tip, Y, b, 0);
  const s = sin(device.bendAngle);
  const c = cos(device.bendAngle);
  for (let k = 0; k < VEC3; k += 1) {
    out[k] = c * (out[k] ?? 0) + s * (device.bendD1 * (a[k] ?? 0) + device.bendD2 * (b[k] ?? 0));
  }
}

/**
 * One rail step: grows or trims the shared path for the leading tip, places every device and reports the push beyond
 * the cap. `h` is the step's duration, for node velocities (0 at load).
 */
export function railStep(world: RailWorld, devices: readonly RailDevice[], h: number): RailResult {
  const { result } = world;
  const { direction, choice } = world.scratch;
  for (const device of devices) {
    device.rod.xPrev.set(device.rod.x);
  }
  // The leading device: the one inserted farthest (the innermost, by the order rule).
  let lead = -1;
  devices.forEach((device, d) => {
    if (lead < 0 || device.inserted > (devices[lead]?.inserted ?? 0)) {
      lead = d;
    }
  });
  const leader = devices[lead];
  if (leader !== undefined) {
    // Forget branches every tip has left; then choose at each junction the leading tip reaches.
    while (world.parts > 1 && leader.inserted < (world.partStart[world.parts - 1] ?? 0)) {
      dropLastPart(world);
    }
    for (let guard = 0; guard <= world.anatomy.segments.length; guard += 1) {
      const options = daughters(world);
      if (options.length === 0 || leader.inserted <= (world.arcs[world.count - 1] ?? 0)) {
        break;
      }
      // Place the leader on the path so far, to read its tip frame at the junction.
      place(world, leader, Math.min(leader.inserted, world.arcs[world.count - 1] ?? 0));
      tipDirection(world, leader, direction);
      let best = options[0] ?? -1;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const option of options) {
        leavingDirection(world, option, choice);
        const score =
          (direction[X] ?? 0) * (choice[X] ?? 0) +
          (direction[Y] ?? 0) * (choice[Y] ?? 0) +
          (direction[Z] ?? 0) * (choice[Z] ?? 0);
        if (score > bestScore) {
          bestScore = score;
          best = option;
        }
      }
      appendSegment(world, best);
    }
  }
  devices.forEach((device, d) => {
    const limit = tipLimit(world, device.rod);
    const depth = Math.min(device.inserted, limit);
    result.excess[d] = device.inserted - depth;
    result.hubForce[d] = world.capStiffness * (device.inserted - depth);
    result.firstFree[d] = place(world, device, depth);
    const { rod } = device;
    for (let k = 0; k < rod.x.length; k += 1) {
      rod.v[k] = h > 0 ? ((rod.x[k] ?? 0) - (rod.xPrev[k] ?? 0)) / h : 0;
    }
  });
  return result;
}

/** The total rest bend of a rod's tip, rad: each joint's rest chord is 2·sin(θ/2) (docs/M1-plan.md D9). */
export function restBendAngle(rod: RodState): number {
  let total = 0;
  for (let j = 0; j + 1 < rod.segmentCount; j += 1) {
    const cx = rod.restChord[VEC3 * j] ?? 0;
    const cy = rod.restChord[VEC3 * j + Y] ?? 0;
    const cz = rod.restChord[VEC3 * j + Z] ?? 0;
    const half = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
    total += 2 * atan2(half, Math.sqrt(Math.max(0, 1 - half * half)));
  }
  return total;
}
