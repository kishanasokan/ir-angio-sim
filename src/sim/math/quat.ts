import { cos, sin } from './detTrig';

/**
 * Unit quaternions stored (x, y, z, w) in packed Float64Arrays. A segment's quaternion q rotates world axes onto
 * its material frame: d1, d2, d3 are the columns of R(q). Trigonometry goes through detTrig (spec 01 §4.4).
 */

export type QuatArray = Float64Array | number[];

export function quatSet(out: QuatArray, o: number, x: number, y: number, z: number, w: number): void {
  out[o] = x;
  out[o + 1] = y;
  out[o + 2] = z;
  out[o + 3] = w;
}

export function quatCopy(a: QuatArray, ao: number, out: QuatArray, o: number): void {
  quatSet(out, o, a[ao] ?? 0, a[ao + 1] ?? 0, a[ao + 2] ?? 0, a[ao + 3] ?? 1);
}

/** out = a ⊗ b; safe when out aliases a or b. */
export function quatMultiply(
  a: QuatArray,
  ao: number,
  b: QuatArray,
  bo: number,
  out: QuatArray,
  o: number,
): void {
  const ax = a[ao] ?? 0;
  const ay = a[ao + 1] ?? 0;
  const az = a[ao + 2] ?? 0;
  const aw = a[ao + 3] ?? 1;
  const bx = b[bo] ?? 0;
  const by = b[bo + 1] ?? 0;
  const bz = b[bo + 2] ?? 0;
  const bw = b[bo + 3] ?? 1;
  quatSet(
    out,
    o,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  );
}

/** out = conj(a) ⊗ b: b's rotation relative to a, in a's frame. */
export function quatRelative(
  a: QuatArray,
  ao: number,
  b: QuatArray,
  bo: number,
  out: QuatArray,
  o: number,
): void {
  const ax = -(a[ao] ?? 0);
  const ay = -(a[ao + 1] ?? 0);
  const az = -(a[ao + 2] ?? 0);
  const aw = a[ao + 3] ?? 1;
  const bx = b[bo] ?? 0;
  const by = b[bo + 1] ?? 0;
  const bz = b[bo + 2] ?? 0;
  const bw = b[bo + 3] ?? 1;
  quatSet(
    out,
    o,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  );
}

/** Normalizes in place; a zero quaternion becomes the identity. */
export function quatNormalize(q: QuatArray, o: number): void {
  const x = q[o] ?? 0;
  const y = q[o + 1] ?? 0;
  const z = q[o + 2] ?? 0;
  const w = q[o + 3] ?? 0;
  const norm = Math.sqrt(x * x + y * y + z * z + w * w);
  if (norm === 0) {
    quatSet(q, o, 0, 0, 0, 1);
    return;
  }
  quatSet(q, o, x / norm, y / norm, z / norm, w / norm);
}

/** out = R(q)·v; safe when out aliases v. */
export function quatRotate(
  q: QuatArray,
  qo: number,
  v: QuatArray,
  vo: number,
  out: QuatArray,
  o: number,
): void {
  const x = q[qo] ?? 0;
  const y = q[qo + 1] ?? 0;
  const z = q[qo + 2] ?? 0;
  const w = q[qo + 3] ?? 1;
  const vx = v[vo] ?? 0;
  const vy = v[vo + 1] ?? 0;
  const vz = v[vo + 2] ?? 0;
  // t = 2 (q.xyz × v); v' = v + w t + q.xyz × t
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  out[o] = vx + w * tx + (y * tz - z * ty);
  out[o + 1] = vy + w * ty + (z * tx - x * tz);
  out[o + 2] = vz + w * tz + (x * ty - y * tx);
}

/** out = R(q)ᵀ·v, the world vector v expressed in q's frame; safe when out aliases v. */
export function quatRotateInverse(
  q: QuatArray,
  qo: number,
  v: QuatArray,
  vo: number,
  out: QuatArray,
  o: number,
): void {
  const conjugate = [-(q[qo] ?? 0), -(q[qo + 1] ?? 0), -(q[qo + 2] ?? 0), q[qo + 3] ?? 1];
  quatRotate(conjugate, 0, v, vo, out, o);
}

/** Writes material axis d1 (axis 0), d2 (1) or d3 (2) of q: column `axis` of R(q). */
export function quatAxis(q: QuatArray, qo: number, axis: number, out: QuatArray, o: number): void {
  const x = q[qo] ?? 0;
  const y = q[qo + 1] ?? 0;
  const z = q[qo + 2] ?? 0;
  const w = q[qo + 3] ?? 1;
  if (axis === 0) {
    out[o] = 1 - 2 * (y * y + z * z);
    out[o + 1] = 2 * (x * y + z * w);
    out[o + 2] = 2 * (x * z - y * w);
  } else if (axis === 1) {
    out[o] = 2 * (x * y - z * w);
    out[o + 1] = 1 - 2 * (x * x + z * z);
    out[o + 2] = 2 * (y * z + x * w);
  } else {
    out[o] = 2 * (x * z + y * w);
    out[o + 1] = 2 * (y * z - x * w);
    out[o + 2] = 1 - 2 * (x * x + y * y);
  }
}

/** Rotation by `angle` about the unit axis (ax, ay, az), built with detTrig so it is identical in every engine. */
export function quatFromAxisAngle(
  ax: number,
  ay: number,
  az: number,
  angle: number,
  out: QuatArray,
  o: number,
): void {
  const half = 0.5 * angle;
  const s = sin(half);
  quatSet(out, o, ax * s, ay * s, az * s, cos(half));
}

/** Row-major 3×3 rotation matrix of q. */
export function quatToMatrix(q: QuatArray, qo: number, m: QuatArray, mo: number): void {
  const x = q[qo] ?? 0;
  const y = q[qo + 1] ?? 0;
  const z = q[qo + 2] ?? 0;
  const w = q[qo + 3] ?? 1;
  m[mo] = 1 - 2 * (y * y + z * z);
  m[mo + 1] = 2 * (x * y - z * w);
  m[mo + 2] = 2 * (x * z + y * w);
  m[mo + 3] = 2 * (x * y + z * w);
  m[mo + 4] = 1 - 2 * (x * x + z * z);
  m[mo + 5] = 2 * (y * z - x * w);
  m[mo + 6] = 2 * (x * z - y * w);
  m[mo + 7] = 2 * (y * z + x * w);
  m[mo + 8] = 1 - 2 * (x * x + y * y);
}

/** Quaternion of a row-major rotation matrix (Shepperd's method: only + − × ÷ and sqrt). */
export function quatFromMatrix(m: QuatArray, mo: number, out: QuatArray, o: number): void {
  const m00 = m[mo] ?? 1;
  const m01 = m[mo + 1] ?? 0;
  const m02 = m[mo + 2] ?? 0;
  const m10 = m[mo + 3] ?? 0;
  const m11 = m[mo + 4] ?? 1;
  const m12 = m[mo + 5] ?? 0;
  const m20 = m[mo + 6] ?? 0;
  const m21 = m[mo + 7] ?? 0;
  const m22 = m[mo + 8] ?? 1;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 2 * Math.sqrt(1 + trace);
    quatSet(out, o, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s);
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    quatSet(out, o, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    quatSet(out, o, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s);
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    quatSet(out, o, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s);
  }
  quatNormalize(out, o);
}

/**
 * Applies a world-frame rotation increment θ (a small rotation vector) to q in place: q ← q + ½(0, θ)⊗q, then
 * normalizes. This is how XPBD orientation corrections and integration steps are applied.
 */
export function quatApplyWorldRotation(q: QuatArray, o: number, tx: number, ty: number, tz: number): void {
  const x = q[o] ?? 0;
  const y = q[o + 1] ?? 0;
  const z = q[o + 2] ?? 0;
  const w = q[o + 3] ?? 1;
  quatSet(
    q,
    o,
    x + 0.5 * (tx * w + ty * z - tz * y),
    y + 0.5 * (ty * w + tz * x - tx * z),
    z + 0.5 * (tz * w + tx * y - ty * x),
    w - 0.5 * (tx * x + ty * y + tz * z),
  );
  quatNormalize(q, o);
}
