/**
 * Tube meshes around a polyline (devices from snapshot nodes, vessels from centerlines), written into caller-owned
 * typed arrays so device tubes are rebuilt every frame without allocating. Pure, with no three.js, so it is
 * unit-tested in Node.
 *
 * Rings follow parallel-transport frames: each ring's normal is the previous one with its component along the new
 * tangent removed, so the tube never twists or flips along a smooth curve. A tube can end in a dome (a vessel's
 * capped end, a device tip).
 */

export interface TubeLayout {
  /** Vertices around each ring. */
  readonly radial: number;
  /** Rings in each end dome; 0 for an open end. */
  readonly domeRings: number;
}

export interface TubeBuffers {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** One value per vertex, copied from the point it belongs to (radiopacity, for example). */
  readonly values: Float32Array;
  readonly indices: Uint32Array;
}

/** Vertices and indices a tube of `points` points needs, with a dome at each end that asks for one. */
export function tubeSize(
  points: number,
  layout: TubeLayout,
  domes: { readonly start: boolean; readonly end: boolean },
): { readonly vertices: number; readonly indices: number } {
  const domeCount = (domes.start ? 1 : 0) + (domes.end ? 1 : 0);
  const rings = points + domeCount * layout.domeRings;
  // Each dome also closes with one apex vertex.
  const vertices = rings * layout.radial + domeCount;
  const quads = Math.max(0, rings - 1) * layout.radial;
  const fans = domeCount * layout.radial;
  return { vertices, indices: 6 * quads + 3 * fans };
}

export function createTubeBuffers(vertices: number, indices: number): TubeBuffers {
  return {
    positions: new Float32Array(3 * vertices),
    normals: new Float32Array(3 * vertices),
    values: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

const EPSILON = 1e-9;

/**
 * Writes a tube around `count` points (packed x, y, z from `offset` point on) into `out`. `radius(i)` and `value(i)`
 * give each point's radius and per-vertex value. Returns the vertex and index counts written.
 */
export function writeTube(
  points: ArrayLike<number>,
  offset: number,
  count: number,
  radius: (i: number) => number,
  value: (i: number) => number,
  layout: TubeLayout,
  domes: { readonly start: boolean; readonly end: boolean },
  out: TubeBuffers,
): { readonly vertices: number; readonly indices: number } {
  if (count < 2) {
    return { vertices: 0, indices: 0 };
  }
  const { radial, domeRings } = layout;
  const at = (i: number, axis: number): number => points[3 * (offset + i) + axis] ?? 0;

  // Tangents by central differences, normalized.
  const tangent = (i: number): [number, number, number] => {
    const a = Math.max(0, i - 1);
    const b = Math.min(count - 1, i + 1);
    const x = at(b, 0) - at(a, 0);
    const y = at(b, 1) - at(a, 1);
    const z = at(b, 2) - at(a, 2);
    const length = Math.sqrt(x * x + y * y + z * z);
    return length < EPSILON ? [0, 0, 1] : [x / length, y / length, z / length];
  };

  // The first normal: the world axis least aligned with the first tangent, made perpendicular.
  let t = tangent(0);
  const ax = Math.abs(t[0]);
  const ay = Math.abs(t[1]);
  const az = Math.abs(t[2]);
  const seed: [number, number, number] = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
  let n = perpendicular(seed, t);

  let vertex = 0;
  let index = 0;
  const ring = (
    cx: number,
    cy: number,
    cz: number,
    tangentVector: readonly [number, number, number],
    normal: readonly [number, number, number],
    r: number,
    along: number,
    v: number,
  ): void => {
    // Binormal b = t × n.
    const bx = tangentVector[1] * normal[2] - tangentVector[2] * normal[1];
    const by = tangentVector[2] * normal[0] - tangentVector[0] * normal[2];
    const bz = tangentVector[0] * normal[1] - tangentVector[1] * normal[0];
    // `along` moves a dome ring onto the sphere of radius r around the point: 0 on the tube, ±1 at an apex.
    const side = Math.sqrt(Math.max(0, 1 - along * along));
    for (let k = 0; k < radial; k += 1) {
      const angle = (2 * Math.PI * k) / radial;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const dx = (c * normal[0] + s * bx) * side + tangentVector[0] * along;
      const dy = (c * normal[1] + s * by) * side + tangentVector[1] * along;
      const dz = (c * normal[2] + s * bz) * side + tangentVector[2] * along;
      const o = 3 * vertex;
      out.positions[o] = cx + r * dx;
      out.positions[o + 1] = cy + r * dy;
      out.positions[o + 2] = cz + r * dz;
      out.normals[o] = dx;
      out.normals[o + 1] = dy;
      out.normals[o + 2] = dz;
      out.values[vertex] = v;
      vertex += 1;
    }
  };
  const apex = (
    cx: number,
    cy: number,
    cz: number,
    direction: readonly [number, number, number],
    r: number,
    v: number,
  ): number => {
    const o = 3 * vertex;
    out.positions[o] = cx + r * direction[0];
    out.positions[o + 1] = cy + r * direction[1];
    out.positions[o + 2] = cz + r * direction[2];
    out.normals[o] = direction[0];
    out.normals[o + 1] = direction[1];
    out.normals[o + 2] = direction[2];
    out.values[vertex] = v;
    vertex += 1;
    return vertex - 1;
  };
  const quadStrip = (first: number, second: number): void => {
    for (let k = 0; k < radial; k += 1) {
      const k1 = (k + 1) % radial;
      const a = first + k;
      const b = first + k1;
      const c = second + k;
      const d = second + k1;
      // Counter-clockwise seen from outside, so normals face out.
      out.indices[index] = a;
      out.indices[index + 1] = b;
      out.indices[index + 2] = c;
      out.indices[index + 3] = b;
      out.indices[index + 4] = d;
      out.indices[index + 5] = c;
      index += 6;
    }
  };
  const fan = (ringStart: number, apexIndex: number, flip: boolean): void => {
    for (let k = 0; k < radial; k += 1) {
      const a = ringStart + k;
      const b = ringStart + ((k + 1) % radial);
      out.indices[index] = apexIndex;
      out.indices[index + 1] = flip ? b : a;
      out.indices[index + 2] = flip ? a : b;
      index += 3;
    }
  };

  // Start dome: from its apex (fan) through rings that widen to the tube.
  let previousRing = -1;
  if (domes.start && domeRings > 0) {
    const r0 = radius(0);
    const back: [number, number, number] = [-t[0], -t[1], -t[2]];
    const apexIndex = apex(at(0, 0), at(0, 1), at(0, 2), back, r0, value(0));
    for (let q = domeRings; q >= 1; q -= 1) {
      const along = -Math.cos((Math.PI / 2) * (1 - q / (domeRings + 1)));
      const ringStart = vertex;
      ring(at(0, 0), at(0, 1), at(0, 2), t, n, r0, along, value(0));
      if (previousRing < 0) {
        fan(ringStart, apexIndex, true);
      } else {
        quadStrip(previousRing, ringStart);
      }
      previousRing = ringStart;
    }
  }

  for (let i = 0; i < count; i += 1) {
    if (i > 0) {
      t = tangent(i);
      n = perpendicular(n, t);
    }
    const ringStart = vertex;
    ring(at(i, 0), at(i, 1), at(i, 2), t, n, radius(i), 0, value(i));
    if (previousRing >= 0) {
      quadStrip(previousRing, ringStart);
    }
    previousRing = ringStart;
  }

  if (domes.end && domeRings > 0) {
    const last = count - 1;
    const r1 = radius(last);
    for (let q = 1; q <= domeRings; q += 1) {
      const along = Math.cos((Math.PI / 2) * (1 - q / (domeRings + 1)));
      const ringStart = vertex;
      ring(at(last, 0), at(last, 1), at(last, 2), t, n, r1, along, value(last));
      quadStrip(previousRing, ringStart);
      previousRing = ringStart;
    }
    const apexIndex = apex(at(last, 0), at(last, 1), at(last, 2), t, r1, value(last));
    fan(previousRing, apexIndex, false);
  }

  return { vertices: vertex, indices: index };
}

/** `v` with its component along unit `t` removed, normalized; falls back to any perpendicular if they align. */
function perpendicular(
  v: readonly [number, number, number],
  t: readonly [number, number, number],
): [number, number, number] {
  const d = v[0] * t[0] + v[1] * t[1] + v[2] * t[2];
  const x = v[0] - d * t[0];
  const y = v[1] - d * t[1];
  const z = v[2] - d * t[2];
  const length = Math.sqrt(x * x + y * y + z * z);
  if (length < EPSILON) {
    // v was along t: use the axis least aligned with t.
    const ax = Math.abs(t[0]);
    const ay = Math.abs(t[1]);
    const az = Math.abs(t[2]);
    const seed: [number, number, number] =
      ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
    return perpendicular(seed, t);
  }
  return [x / length, y / length, z / length];
}
