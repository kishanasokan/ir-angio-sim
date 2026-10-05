import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextUint32 } from '../../src/sim/core/rng';

// Unit test 5 (prompts/M1-foundations.md §8): the seeded PRNG.

const sequence = (seed: number, count: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => nextUint32(rng));
};

describe('seeded PRNG', () => {
  it('gives identical sequences for identical seeds', () => {
    expect(sequence(42, 1000)).toEqual(sequence(42, 1000));
  });

  it('gives different sequences for different seeds', () => {
    const a = sequence(1, 1000);
    const b = sequence(2, 1000);
    expect(a).not.toEqual(b);
    expect(a.filter((value, i) => value === b[i]).length).toBeLessThan(5);
  });

  it('draws floats in [0, 1) and keeps its state a plain number', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i += 1) {
      const value = nextFloat(rng);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    const copy = createRng(0);
    copy.state = rng.state;
    expect(nextUint32(copy)).toBe(nextUint32(rng));
  });
});
