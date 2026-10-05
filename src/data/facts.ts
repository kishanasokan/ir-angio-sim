/** Fact shapes and confidence levels (spec 02 §3–§4). */

export const CONFIDENCE_LEVELS = ['sourced', 'derived', 'estimated', 'placeholder', 'design'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export type Scalar = number | string | boolean;

/** A quantity fact: exactly one of value, options or a min/max range (spec 02 §4.1). */
export interface QuantityFact {
  readonly value?: Scalar;
  readonly options?: readonly (number | string)[];
  readonly min?: number;
  readonly max?: number;
  readonly unit?: string;
  readonly sd?: number;
  readonly tolerance?: number;
  readonly confidence: Confidence;
  readonly source?: string;
  readonly note?: string;
  readonly [qualifier: string]: unknown;
}

/** A text fact (spec 02 §4.2). */
export interface TextFact {
  readonly text: string;
  readonly confidence: Confidence;
  readonly source?: string;
  readonly note?: string;
  readonly [key: string]: unknown;
}

/**
 * A choice from an item's options or range (spec 02 §4.4): a bare string or number, or `{value, unit}`. It
 * carries a confidence only when the item lacks the property it selects.
 */
export type Selection =
  | number
  | string
  | {
      readonly value: number | string;
      readonly unit?: string;
      readonly confidence?: Confidence;
      readonly source?: string;
      readonly note?: string;
      readonly [key: string]: unknown;
    };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isConfidence(value: unknown): value is Confidence {
  return typeof value === 'string' && (CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

/** True for any object with a confidence field, which is what makes it a fact (spec 02 §1.2). */
export function isFact(value: unknown): value is Record<string, unknown> & { readonly confidence: unknown } {
  return isRecord(value) && 'confidence' in value;
}

export function isScalar(value: unknown): value is Scalar {
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
}

export function emptyConfidenceCounts(): Record<Confidence, number> {
  return { sourced: 0, derived: 0, estimated: 0, placeholder: 0, design: 0 };
}
