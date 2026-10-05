import { isRecord, isScalar, type Scalar, type Selection } from './facts';

/** Resolves quantity facts to single values: a value, or a selection from options or a range (spec 02 §4). */

export type QuantityErrorCode =
  | 'not-a-quantity'
  | 'selection-required'
  | 'out-of-options'
  | 'out-of-range'
  | 'unit-mismatch'
  | 'value-mismatch';

export class QuantityError extends Error {
  override name = 'QuantityError';
  constructor(
    readonly code: QuantityErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** The parts of a quantity that resolution reads; facts and tuning values both fit. */
export interface QuantityLike {
  readonly value?: unknown;
  readonly options?: unknown;
  readonly min?: unknown;
  readonly max?: unknown;
  readonly unit?: unknown;
}

export interface ResolvedQuantity {
  readonly value: Scalar;
  readonly unit?: string;
}

export type Aggregate = 'max' | 'min';

/** Splits a selection into its value and unit. */
export function selectionValue(selection: Selection): { value: number | string; unit?: string } {
  if (typeof selection === 'number' || typeof selection === 'string') {
    return { value: selection };
  }
  return selection.unit === undefined
    ? { value: selection.value }
    : { value: selection.value, unit: selection.unit };
}

function unitOf(quantity: QuantityLike): string | undefined {
  return typeof quantity.unit === 'string' ? quantity.unit : undefined;
}

function withUnit(value: Scalar, unit: string | undefined): ResolvedQuantity {
  return unit === undefined ? { value } : { value, unit };
}

/**
 * Resolves a quantity to one value. A quantity with options or a range needs a selection; the selection must be
 * one of the options or inside the range, written in the quantity's own unit (spec 02 §4.4). A single bound means
 * "at least" or "at most".
 */
export function resolveQuantity(quantity: QuantityLike, selection?: Selection): ResolvedQuantity {
  const unit = unitOf(quantity);
  const chosen = selection === undefined ? undefined : selectionValue(selection);

  if (chosen !== undefined && typeof chosen.value === 'number' && chosen.unit !== unit) {
    throw new QuantityError(
      'unit-mismatch',
      `Selection ${chosen.value} ${chosen.unit ?? '(no unit)'} must use the quantity's unit (${unit ?? 'none'}).`,
    );
  }

  if (quantity.value !== undefined) {
    if (!isScalar(quantity.value)) {
      throw new QuantityError('not-a-quantity', 'A quantity value must be a number, string or boolean.');
    }
    if (chosen !== undefined && chosen.value !== quantity.value) {
      throw new QuantityError(
        'value-mismatch',
        `Selection ${String(chosen.value)} differs from the only value, ${String(quantity.value)}.`,
      );
    }
    return withUnit(quantity.value, unit);
  }

  if (Array.isArray(quantity.options)) {
    if (chosen === undefined) {
      throw new QuantityError('selection-required', 'A quantity with options needs a selection.');
    }
    if (!(quantity.options as unknown[]).includes(chosen.value)) {
      throw new QuantityError(
        'out-of-options',
        `Selection ${String(chosen.value)} is not one of the options (${quantity.options.join(', ')}).`,
      );
    }
    return withUnit(chosen.value, unit);
  }

  const min = typeof quantity.min === 'number' ? quantity.min : undefined;
  const max = typeof quantity.max === 'number' ? quantity.max : undefined;
  if (min !== undefined || max !== undefined) {
    if (chosen === undefined) {
      throw new QuantityError('selection-required', 'A quantity with a range needs a selection.');
    }
    if (typeof chosen.value !== 'number') {
      throw new QuantityError('out-of-range', 'A selection from a range must be a number.');
    }
    if ((min !== undefined && chosen.value < min) || (max !== undefined && chosen.value > max)) {
      throw new QuantityError(
        'out-of-range',
        `Selection ${chosen.value} is outside the range ${min ?? '…'} to ${max ?? '…'}.`,
      );
    }
    return withUnit(chosen.value, unit);
  }

  throw new QuantityError('not-a-quantity', 'The object has no value, options or range.');
}

/**
 * The largest or smallest value a quantity allows, for capability checks such as a catheter's wireCompatibility
 * (spec 02 §8, `leftAgg` and `rightAgg`). Undefined when the quantity has no such bound.
 */
export function aggregateQuantity(quantity: QuantityLike, aggregate: Aggregate): ResolvedQuantity | undefined {
  const unit = unitOf(quantity);
  if (typeof quantity.value === 'number') {
    return withUnit(quantity.value, unit);
  }
  if (Array.isArray(quantity.options)) {
    const numbers = (quantity.options as unknown[]).filter((x): x is number => typeof x === 'number');
    if (numbers.length === 0) {
      return undefined;
    }
    return withUnit(aggregate === 'max' ? Math.max(...numbers) : Math.min(...numbers), unit);
  }
  const bound = aggregate === 'max' ? quantity.max : quantity.min;
  return typeof bound === 'number' ? withUnit(bound, unit) : undefined;
}

/** True when the object has a value, options or a range. */
export function isQuantityLike(value: unknown): value is QuantityLike {
  return (
    isRecord(value) &&
    ('value' in value || 'options' in value || 'min' in value || 'max' in value || 'unit' in value)
  );
}
