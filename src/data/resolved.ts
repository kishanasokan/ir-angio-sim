import type { Confidence, Selection } from './facts';
import { combineProvenance, provenanceOf, type Provenance } from './provenance';
import { QuantityError, resolveQuantity, type QuantityLike } from './quantity';
import { fromSI, siUnitOf, valueToSI } from './units';

/**
 * A number resolved from /data: SI for the simulation, the value as written for clinical display, and its
 * provenance for the device inspector (spec 02 §7.3, CLAUDE.md rule 5).
 */
export interface ResolvedValue {
  readonly label: string;
  /** SI value. */
  readonly value: number;
  /** SI unit, for example m, Pa or N*m2. */
  readonly unit: string;
  /** The value and unit as written in /data. */
  readonly clinical: { readonly value: number; readonly unit: string };
  readonly provenance: Provenance;
}

export class DataResolveError extends Error {
  override name = 'DataResolveError';
}

type ProvenanceFields = {
  readonly confidence?: unknown;
  readonly source?: unknown;
  readonly note?: unknown;
};

export interface ResolveOptions {
  readonly selection?: Selection;
  /** Tuning values without a confidence are design choices (spec 02 §4.5). */
  readonly defaultConfidence?: Confidence;
  /** Names the value in error messages, for example "rod model rm-x tip section toTip". */
  readonly where: string;
}

/** Resolves a numeric quantity, with an optional selection, to SI and keeps its provenance. */
export function resolveNumber(
  label: string,
  quantity: QuantityLike & ProvenanceFields,
  options: ResolveOptions,
): ResolvedValue {
  let resolved;
  try {
    resolved = resolveQuantity(quantity, options.selection);
  } catch (error) {
    if (error instanceof QuantityError) {
      throw new DataResolveError(`${options.where}: ${error.message}`);
    }
    throw error;
  }
  if (typeof resolved.value !== 'number' || resolved.unit === undefined) {
    throw new DataResolveError(`${options.where}: ${label} must be a number with a unit.`);
  }
  return {
    label,
    value: valueToSI(resolved.value, resolved.unit),
    unit: siUnitOf(resolved.unit),
    clinical: { value: resolved.value, unit: resolved.unit },
    provenance: provenanceOf(quantity, options.defaultConfidence),
  };
}

/**
 * An SI value whose provenance is already known. `clinicalUnit` names the unit to display it in, such as GPa for a
 * modulus; without it the clinical display is the SI value.
 */
export function siValue(
  label: string,
  value: number,
  unit: string,
  provenance: Provenance,
  clinicalUnit?: string,
): ResolvedValue {
  return {
    label,
    value,
    unit,
    clinical: clinicalUnit === undefined ? { value, unit } : { value: fromSI(value, clinicalUnit), unit: clinicalUnit },
    provenance,
  };
}

/** A value computed by a formula from resolved inputs; its provenance follows docs/M1-plan.md D13. */
export function computedValue(
  label: string,
  value: number,
  unit: string,
  inputs: readonly Provenance[],
  formula: string,
  clinicalUnit?: string,
): ResolvedValue {
  return siValue(label, value, unit, combineProvenance(inputs, formula), clinicalUnit);
}
