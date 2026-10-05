import { isConfidence, type Confidence } from './facts';

/** Where a resolved value came from, for the device inspector's badges (spec 02 §7.3). */
export interface Provenance {
  readonly confidence: Confidence;
  /** Source ids from data/sources.json; a computed value lists every input's source. */
  readonly sources: readonly string[];
  readonly note?: string;
}

// Claims rank from strongest to weakest; design values make no claim about reality (spec 02 §3).
const CLAIM_RANK: Readonly<Record<Exclude<Confidence, 'design'>, number>> = {
  sourced: 4,
  derived: 3,
  estimated: 2,
  placeholder: 1,
};

/**
 * The provenance of one fact. Tuning values without a confidence are design choices (spec 02 §4.5), so callers
 * reading tuning files pass `design` as the default.
 */
export function provenanceOf(
  fact: { readonly confidence?: unknown; readonly source?: unknown; readonly note?: unknown },
  defaultConfidence?: Confidence,
): Provenance {
  const confidence = isConfidence(fact.confidence) ? fact.confidence : defaultConfidence;
  if (confidence === undefined) {
    throw new Error('The fact has no valid confidence level.');
  }
  return {
    confidence,
    sources: typeof fact.source === 'string' ? [fact.source] : [],
    ...(typeof fact.note === 'string' ? { note: fact.note } : {}),
  };
}

/**
 * The provenance of a value computed from several inputs (docs/M1-plan.md D13). The weakest input claim wins,
 * design inputs never lower it, and a value computed only from design inputs stays design. A formula result is at
 * most derived; it lists every input source and keeps the formula as its note.
 */
export function combineProvenance(inputs: readonly Provenance[], formula: string): Provenance {
  let weakest: Exclude<Confidence, 'design'> | undefined;
  for (const input of inputs) {
    if (input.confidence === 'design') {
      continue;
    }
    if (weakest === undefined || CLAIM_RANK[input.confidence] < CLAIM_RANK[weakest]) {
      weakest = input.confidence;
    }
  }
  const confidence: Confidence = weakest === undefined ? 'design' : weakest === 'sourced' ? 'derived' : weakest;
  const sources = [...new Set(inputs.flatMap((input) => input.sources))];
  return { confidence, sources, note: formula };
}
