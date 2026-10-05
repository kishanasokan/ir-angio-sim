/**
 * Seeded pseudo-random numbers: mulberry32 (spec 01 §4.2). The only randomness allowed in src/sim. The state is a
 * plain number, so it can be hashed, saved and replayed.
 */

export interface Rng {
  state: number;
}

const GOLDEN_GAMMA = 0x6d2b79f5;
const UINT32_RANGE = 4294967296;
const SHIFT_A = 15;
const SHIFT_B = 7;
const SHIFT_C = 14;
const MIX = 61;

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** The next 32-bit unsigned integer. */
export function nextUint32(rng: Rng): number {
  rng.state = (rng.state + GOLDEN_GAMMA) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> SHIFT_A), t | 1);
  t ^= t + Math.imul(t ^ (t >>> SHIFT_B), t | MIX);
  return (t ^ (t >>> SHIFT_C)) >>> 0;
}

/** The next number in [0, 1). */
export function nextFloat(rng: Rng): number {
  return nextUint32(rng) / UINT32_RANGE;
}
