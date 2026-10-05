/** 3×3 matrices, row-major, in a Float64Array at an offset. */

export function setIdentity3(out: Float64Array, o: number, s: number): void {
  out.fill(0, o, o + 9);
  out[o] = s;
  out[o + 4] = s;
  out[o + 8] = s;
}

/** The skew matrix [a]× times s, so that [a]×·v = a × v. */
export function setSkew3(out: Float64Array, o: number, ax: number, ay: number, az: number, s: number): void {
  out[o] = 0;
  out[o + 1] = -az * s;
  out[o + 2] = ay * s;
  out[o + 3] = az * s;
  out[o + 4] = 0;
  out[o + 5] = -ax * s;
  out[o + 6] = -ay * s;
  out[o + 7] = ax * s;
  out[o + 8] = 0;
}

/** (I − t·tᵀ)·s: removes the component along the unit vector t. */
export function setPerpendicularProjection3(
  out: Float64Array,
  o: number,
  tx: number,
  ty: number,
  tz: number,
  s: number,
): void {
  out[o] = (1 - tx * tx) * s;
  out[o + 1] = -tx * ty * s;
  out[o + 2] = -tx * tz * s;
  out[o + 3] = -ty * tx * s;
  out[o + 4] = (1 - ty * ty) * s;
  out[o + 5] = -ty * tz * s;
  out[o + 6] = -tz * tx * s;
  out[o + 7] = -tz * ty * s;
  out[o + 8] = (1 - tz * tz) * s;
}

/** a·n·nᵀ + b·(I − n·nᵀ) for a unit vector n: value a along n and b across it. */
export function setAlongAcross3(
  out: Float64Array,
  o: number,
  nx: number,
  ny: number,
  nz: number,
  a: number,
  b: number,
): void {
  const e = a - b;
  out[o] = b + e * nx * nx;
  out[o + 1] = e * nx * ny;
  out[o + 2] = e * nx * nz;
  out[o + 3] = e * ny * nx;
  out[o + 4] = b + e * ny * ny;
  out[o + 5] = e * ny * nz;
  out[o + 6] = e * nz * nx;
  out[o + 7] = e * nz * ny;
  out[o + 8] = b + e * nz * nz;
}

/** out = R·diag(a, a, b)·Rᵀ for a rotation matrix R: an inertia tensor with axial value b along R's third column. */
export function setRotatedDiagonal3(
  out: Float64Array,
  o: number,
  rotation: Float64Array,
  ro: number,
  a: number,
  b: number,
): void {
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const rr =
        (rotation[ro + 3 * r] ?? 0) * (rotation[ro + 3 * c] ?? 0) +
        (rotation[ro + 3 * r + 1] ?? 0) * (rotation[ro + 3 * c + 1] ?? 0);
      out[o + 3 * r + c] = a * rr + b * (rotation[ro + 3 * r + 2] ?? 0) * (rotation[ro + 3 * c + 2] ?? 0);
    }
  }
}
