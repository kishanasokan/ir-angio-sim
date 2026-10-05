/**
 * Deterministic trigonometry (spec 01 §4.4). Every trigonometric need in src/sim goes through these functions,
 * which use only + − × ÷ and floor, so results are identical in every JavaScript engine. Accuracy is better than
 * 1e-12 against Math on [−4π, 4π] (unit test 6).
 *
 * The polynomial kernels and argument-reduction constants are those of fdlibm (Sun Microsystems, freely
 * redistributable), the basis of most C math libraries.
 */

// π/2 split into three parts for Cody–Waite argument reduction: k·PIO2_1 is exact for any k this sim produces.
const PIO2_1 = 1.5707963267341256;
const PIO2_2 = 6.077100506303966e-11;
const PIO2_2T = 2.0222662487959506e-21;
const TWO_OVER_PI = 6.366197723675814e-1;

// sin(r) ≈ r + r³·S(r²) on [−π/4, π/4].
const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

// cos(r) ≈ 1 − r²/2 + r⁴·C(r²) on [−π/4, π/4].
const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

function kernelSin(r: number): number {
  const z = r * r;
  return r + r * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}

function kernelCos(r: number): number {
  const z = r * r;
  const hz = 0.5 * z;
  const w = 1 - hz;
  return w + (1 - w - hz + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6))))));
}

/** The multiple k of π/2 nearest to x. */
function quarterTurns(x: number): number {
  return Math.floor(x * TWO_OVER_PI + 0.5);
}

/** x − k·π/2, accurate to about 1e-20 for every k this simulation produces. */
function reduced(x: number, k: number): number {
  return x - k * PIO2_1 - k * PIO2_2 - k * PIO2_2T;
}

export function sin(x: number): number {
  const k = quarterTurns(x);
  const r = reduced(x, k);
  switch (k - 4 * Math.floor(k / 4)) {
    case 0:
      return kernelSin(r);
    case 1:
      return kernelCos(r);
    case 2:
      return -kernelSin(r);
    default:
      return -kernelCos(r);
  }
}

export function cos(x: number): number {
  const k = quarterTurns(x);
  const r = reduced(x, k);
  switch (k - 4 * Math.floor(k / 4)) {
    case 0:
      return kernelCos(r);
    case 1:
      return -kernelSin(r);
    case 2:
      return -kernelCos(r);
    default:
      return kernelSin(r);
  }
}

// atan breakpoints atan(0.5), atan(1), atan(1.5), atan(∞), each split into high and low parts.
const ATAN_HI = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.570796326794896558,
];
const ATAN_LO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17,
];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.1111110405462355788e-1,
  9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2,
  -5.83357013379057348645e-2, 4.97687799461593236017e-2, -3.6531572744216915527e-2, 1.62858201153657823623e-2,
];
const PI = 3.141592653589793116;
const PI_LO = 1.2246467991473532e-16;
const PI_OVER_2 = 1.570796326794896558;

// Breakpoints of the atan reduction.
const ATAN_BREAK_0 = 0.4375;
const ATAN_BREAK_1 = 0.6875;
const ATAN_BREAK_2 = 1.1875;
const ATAN_BREAK_3 = 2.4375;
const ONE_AND_HALF = 1.5;

/** atan of a non-negative argument. */
function atanPositive(a: number): number {
  let id: number;
  let x = a;
  if (x < ATAN_BREAK_0) {
    id = -1;
  } else if (x < ATAN_BREAK_1) {
    id = 0;
    x = (2 * x - 1) / (2 + x);
  } else if (x < ATAN_BREAK_2) {
    id = 1;
    x = (x - 1) / (x + 1);
  } else if (x < ATAN_BREAK_3) {
    id = 2;
    x = (x - ONE_AND_HALF) / (1 + ONE_AND_HALF * x);
  } else {
    id = 3;
    x = -1 / x;
  }
  const z = x * x;
  const w = z * z;
  const at = AT as [number, number, number, number, number, number, number, number, number, number, number];
  const s1 = z * (at[0] + w * (at[2] + w * (at[4] + w * (at[6] + w * (at[8] + w * at[10])))));
  const s2 = w * (at[1] + w * (at[3] + w * (at[5] + w * (at[7] + w * at[9]))));
  if (id < 0) {
    return x - x * (s1 + s2);
  }
  const hi = ATAN_HI[id] ?? 0;
  const lo = ATAN_LO[id] ?? 0;
  return hi - (x * (s1 + s2) - lo - x);
}

/** True for −0, which 1/x turns into −∞. */
function isNegativeZero(value: number): boolean {
  return value === 0 && 1 / value < 0;
}

export function atan2(y: number, x: number): number {
  const yNegative = y < 0 || isNegativeZero(y);
  const xNegative = x < 0 || isNegativeZero(x);
  if (y === 0) {
    // Signed zeros follow Math.atan2: ±0 toward +x, ±π toward −x.
    if (!xNegative) {
      return y;
    }
    return yNegative ? -PI : PI;
  }
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  // atan of |y/x|, computed through the smaller ratio to keep it finite.
  const z = ay <= ax ? atanPositive(ay / ax) : PI_OVER_2 - atanPositive(ax / ay);
  if (!xNegative) {
    return yNegative ? -z : z;
  }
  return yNegative ? z - PI_LO - PI : PI - (z - PI_LO);
}
