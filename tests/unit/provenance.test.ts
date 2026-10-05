import { describe, expect, it } from 'vitest';
import { combineProvenance, provenanceOf, type Provenance } from '../../src/data/provenance';

// How computed values inherit confidence (docs/M1-plan.md D13).

const sourced: Provenance = { confidence: 'sourced', sources: ['terumo-glidewire-brochure'] };
const estimated: Provenance = { confidence: 'estimated', sources: [], note: 'Standard shaft assumed.' };
const placeholder: Provenance = { confidence: 'placeholder', sources: [] };
const design: Provenance = { confidence: 'design', sources: [] };

describe('provenance', () => {
  it('reads a fact, defaulting tuning values without a confidence to design', () => {
    expect(provenanceOf({ confidence: 'sourced', source: 'harrison2011' })).toEqual({
      confidence: 'sourced',
      sources: ['harrison2011'],
    });
    // A tuning value such as {"value": 0, "unit": "mm"} carries no confidence of its own.
    expect(provenanceOf({}, 'design')).toEqual({ confidence: 'design', sources: [] });
    expect(() => provenanceOf({})).toThrow();
  });

  it('lets the weakest claim win and design inputs stay neutral', () => {
    // The Glidewire body: design ratio 1.0, estimated 8 GPa modulus, sourced diameter.
    expect(combineProvenance([design, estimated, sourced], 'EI').confidence).toBe('estimated');
    // The Glidewire tip: placeholder ratio 0.02 on top of the same inputs.
    expect(combineProvenance([placeholder, estimated, sourced], 'EI').confidence).toBe('placeholder');
    expect(combineProvenance([design, design], 'EI').confidence).toBe('design');
  });

  it('caps a formula result at derived and keeps every input source and the formula', () => {
    const result = combineProvenance(
      [sourced, { confidence: 'sourced', sources: ['harrison2011'] }],
      'EI = E·I',
    );
    expect(result).toEqual({
      confidence: 'derived',
      sources: ['terumo-glidewire-brochure', 'harrison2011'],
      note: 'EI = E·I',
    });
  });
});
