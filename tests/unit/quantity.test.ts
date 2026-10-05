import { describe, expect, it } from 'vitest';
import {
  QuantityError,
  aggregateQuantity,
  resolveQuantity,
  type QuantityErrorCode,
} from '../../src/data/quantity';

// Unit test 2 (prompts/M1-foundations.md §8): quantity resolution for a value, options with a selection, ranges
// with a selection and single-bound ranges; out-of-options and out-of-range selections fail.

function failureCode(resolve: () => unknown): QuantityErrorCode | 'no error' | 'other error' {
  try {
    resolve();
  } catch (error) {
    return error instanceof QuantityError ? error.code : 'other error';
  }
  return 'no error';
}

// Shapes from data/devices: the Glidewire's diameter options and length range, an angled-tip option list.
const sheathLength = { value: 11, unit: 'cm', confidence: 'placeholder' } as const;
const wireDiameter = {
  options: [0.018, 0.025, 0.032, 0.035, 0.038],
  unit: 'in',
  confidence: 'sourced',
} as const;
const tipShapes = { options: ['straight', 'angled', 'J 1.5 mm', 'J 3.0 mm'], confidence: 'sourced' } as const;
const wireLength = { min: 80, max: 450, unit: 'cm', confidence: 'sourced' } as const;

describe('unit test 2 · quantity resolution', () => {
  it('resolves a single value, with or without a matching selection', () => {
    expect(resolveQuantity(sheathLength)).toEqual({ value: 11, unit: 'cm' });
    expect(resolveQuantity(sheathLength, { value: 11, unit: 'cm' })).toEqual({ value: 11, unit: 'cm' });
    expect(failureCode(() => resolveQuantity(sheathLength, { value: 12, unit: 'cm' }))).toBe(
      'value-mismatch',
    );
  });

  it('resolves options with a selection', () => {
    expect(resolveQuantity(wireDiameter, { value: 0.035, unit: 'in' })).toEqual({ value: 0.035, unit: 'in' });
    expect(resolveQuantity(tipShapes, 'angled')).toEqual({ value: 'angled' });
  });

  it('resolves ranges with a selection, bounds included', () => {
    expect(resolveQuantity(wireLength, { value: 150, unit: 'cm' })).toEqual({ value: 150, unit: 'cm' });
    expect(resolveQuantity(wireLength, { value: 80, unit: 'cm' }).value).toBe(80);
    expect(resolveQuantity(wireLength, { value: 450, unit: 'cm' }).value).toBe(450);
  });

  it('treats one bound alone as "at least" or "at most"', () => {
    const atLeast = { min: 5, unit: 'Fr', confidence: 'sourced' };
    const atMost = { max: 8, unit: 'Fr', confidence: 'sourced' };
    expect(resolveQuantity(atLeast, { value: 21, unit: 'Fr' }).value).toBe(21);
    expect(failureCode(() => resolveQuantity(atLeast, { value: 4, unit: 'Fr' }))).toBe('out-of-range');
    expect(resolveQuantity(atMost, { value: 5, unit: 'Fr' }).value).toBe(5);
    expect(failureCode(() => resolveQuantity(atMost, { value: 9, unit: 'Fr' }))).toBe('out-of-range');
  });

  it('fails a selection that is not one of the options', () => {
    expect(failureCode(() => resolveQuantity(wireDiameter, { value: 0.036, unit: 'in' }))).toBe(
      'out-of-options',
    );
    expect(failureCode(() => resolveQuantity(tipShapes, 'J 2 mm'))).toBe('out-of-options');
  });

  it('fails a selection outside the range', () => {
    expect(failureCode(() => resolveQuantity(wireLength, { value: 79, unit: 'cm' }))).toBe('out-of-range');
    expect(failureCode(() => resolveQuantity(wireLength, { value: 451, unit: 'cm' }))).toBe('out-of-range');
  });

  it('needs a selection for options and ranges', () => {
    expect(failureCode(() => resolveQuantity(wireDiameter))).toBe('selection-required');
    expect(failureCode(() => resolveQuantity(wireLength))).toBe('selection-required');
  });

  it('fails a selection written in another unit (spec 02 §4.4)', () => {
    expect(failureCode(() => resolveQuantity(wireDiameter, { value: 0.889, unit: 'mm' }))).toBe(
      'unit-mismatch',
    );
    expect(failureCode(() => resolveQuantity(wireLength, 150))).toBe('unit-mismatch');
  });

  it('fails an object with no value, options or range', () => {
    expect(failureCode(() => resolveQuantity({ unit: 'mm' }))).toBe('not-a-quantity');
  });

  it('aggregates options and ranges for capability checks such as wireCompatibility', () => {
    const wireCompatibility = { options: [0.035, 0.038], unit: 'in', confidence: 'sourced' };
    expect(aggregateQuantity(wireCompatibility, 'max')).toEqual({ value: 0.038, unit: 'in' });
    expect(aggregateQuantity(wireCompatibility, 'min')).toEqual({ value: 0.035, unit: 'in' });
    expect(aggregateQuantity(wireLength, 'max')).toEqual({ value: 450, unit: 'cm' });
    expect(aggregateQuantity({ min: 5, unit: 'Fr' }, 'max')).toBeUndefined();
    expect(aggregateQuantity(sheathLength, 'min')).toEqual({ value: 11, unit: 'cm' });
  });
});
