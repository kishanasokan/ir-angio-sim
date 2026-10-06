import { describe, expect, it } from 'vitest';
import {
  bendingStiffness,
  buildItemInstance,
  buildRodInstance,
  crossSectionArea,
  resolveItemPath,
  secondMomentOfArea,
  shearModulus,
  type RodDeviceInstance,
  type RodSectionInstance,
} from '../../src/data/catalog';
import { CONFIDENCE_LEVELS } from '../../src/data/facts';
import { valueToSI } from '../../src/data/units';
import { relativeError, repository, tierSegmentLength } from '../helpers/repository';

// Unit test 8 (prompts/M1-foundations.md §8): stiffness and catalog. A 0.035 in wire at 9.5 GPa gives
// EI = 2.9127e-4 N·m²; a 5F tube with ID 0.039 in at 1.0 GPa gives 3.3149e-4 N·m² (both ±0.1%);
// rm-glidewire-035-angled-150 resolves a body EI of 2.4528e-4 N·m² (8 GPa, estimated) and a tip section at 2% of it
// (placeholder).

const TOLERANCE = 1e-3;

function section(instance: RodDeviceInstance, name: string): RodSectionInstance {
  const found = instance.sections.find((entry) => entry.name === name);
  if (found === undefined) {
    throw new Error(`${instance.rodModelId} has no ${name} section.`);
  }
  return found;
}

describe('unit test 8 · stiffness and catalog', () => {
  const high = tierSegmentLength('high');
  const standard = tierSegmentLength('standard');
  const glidewire = buildRodInstance(repository(), 'rm-glidewire-035-angled-150', high);
  const berenstein = buildRodInstance(repository(), 'rm-berenstein-5f-65', high);

  it('gives EI = 2.9127e-4 N·m² for a 0.035 in wire at 9.5 GPa', () => {
    const ei = bendingStiffness(valueToSI(9.5, 'GPa'), valueToSI(0.035, 'in'));
    expect(relativeError(ei, 2.9127e-4)).toBeLessThan(TOLERANCE);
  });

  it('gives EI = 3.3149e-4 N·m² for a 5F tube with a 0.039 in lumen at 1.0 GPa', () => {
    const ei = bendingStiffness(valueToSI(1.0, 'GPa'), valueToSI(5, 'Fr'), valueToSI(0.039, 'in'));
    expect(relativeError(ei, 3.3149e-4)).toBeLessThan(TOLERANCE);
  });

  it('resolves the Glidewire body EI from its estimated 8 GPa modulus', () => {
    const body = section(glidewire, 'body');
    expect(glidewire.bodyYoungsModulus?.clinical).toEqual({ value: 8, unit: 'GPa' });
    expect(relativeError(body.bendingStiffness.atFromTip, 2.4528e-4)).toBeLessThan(TOLERANCE);
    expect(body.bendingStiffness.atToTip).toBe(body.bendingStiffness.atFromTip);
    expect(body.bendingProvenance.confidence).toBe('estimated');
  });

  it('resolves the Glidewire tip section at 2% of the body, as a placeholder', () => {
    const tip = section(glidewire, 'tip');
    const body = section(glidewire, 'body');
    expect(tip.bendingStiffness.atFromTip / body.bendingStiffness.atFromTip).toBeCloseTo(0.02, 12);
    expect(tip.bendingProvenance.confidence).toBe('placeholder');
  });

  it('ramps the Glidewire transition linearly from tip to body stiffness', () => {
    const transition = section(glidewire, 'transition');
    expect(transition.bendingStiffness.atFromTip).toBeCloseTo(
      section(glidewire, 'tip').bendingStiffness.atFromTip,
      15,
    );
    expect(transition.bendingStiffness.atToTip).toBeCloseTo(
      section(glidewire, 'body').bendingStiffness.atFromTip,
      15,
    );
    // Segments run from the handle (0) to the tip, so stiffness never rises toward the tip.
    const ei = glidewire.segments.bendingStiffness;
    for (let j = 1; j < ei.length; j += 1) {
      expect(ei[j] ?? Number.NaN).toBeLessThanOrEqual(ei[j - 1] ?? Number.NaN);
    }
    expect(ei[ei.length - 1]).toBeCloseTo(section(glidewire, 'tip').bendingStiffness.atFromTip, 15);
    expect(ei[0]).toBeCloseTo(section(glidewire, 'body').bendingStiffness.atFromTip, 15);
  });

  it("lays segments out from the tip at the tier's length, dropping a short remainder at the handle", () => {
    expect(glidewire.segments.count).toBe(750);
    expect(buildRodInstance(repository(), 'rm-glidewire-035-angled-150', standard).segments.count).toBe(375);
    // 650 mm is 162.5 segments of 4 mm (docs/M1-plan.md D21).
    expect(buildRodInstance(repository(), 'rm-berenstein-5f-65', standard).segments.count).toBe(162);
  });

  it("resolves the 5F Berenstein as a tube with the rod model's placeholder lumen", () => {
    expect(berenstein.outerDiameter.clinical).toEqual({ value: 5, unit: 'Fr' });
    expect(berenstein.innerDiameter?.clinical).toEqual({ value: 0.039, unit: 'in' });
    expect(berenstein.innerDiameter?.provenance.confidence).toBe('placeholder');
    expect(relativeError(section(berenstein, 'body').bendingStiffness.atFromTip, 3.3149e-4)).toBeLessThan(
      TOLERANCE,
    );
    expect(berenstein.wallFriction.value).toBe(0.2);
    expect(berenstein.lumenFriction?.value).toBe(0.1);
    expect(glidewire.lumenFriction).toBeNull();
  });

  it('computes torsional stiffness, mass per length and per-segment radii', () => {
    const d = valueToSI(0.035, 'in');
    const body = section(glidewire, 'body');
    const modulus = valueToSI(8, 'GPa');
    const gj = shearModulus(modulus, 0.33) * 2 * secondMomentOfArea(d);
    expect(relativeError(body.torsionalStiffness.atFromTip, gj)).toBeLessThan(1e-12);
    expect(glidewire.segments.massPerLength[0]).toBeCloseTo(6450 * crossSectionArea(d), 15);
    expect(glidewire.segments.outerRadius[0]).toBe(d / 2);
    expect(glidewire.segments.innerRadius[0]).toBe(0);
    expect(berenstein.segments.innerRadius[0]).toBe(valueToSI(0.039, 'in') / 2);
  });

  it('keeps provenance for every resolved parameter', () => {
    for (const instance of [glidewire, berenstein]) {
      expect(instance.parameters.length).toBeGreaterThan(10);
      for (const parameter of instance.parameters) {
        expect(CONFIDENCE_LEVELS, parameter.label).toContain(parameter.provenance.confidence);
        if (parameter.provenance.confidence === 'sourced' || parameter.provenance.confidence === 'derived') {
          expect(parameter.provenance.sources.length, parameter.label).toBeGreaterThan(0);
        }
      }
    }
    const bend = glidewire.parameters.find((parameter) => parameter.label === 'Rest shape 1: bend angle');
    expect(bend?.clinical).toEqual({ value: 45, unit: 'deg' });
    expect(bend?.provenance.confidence).toBe('placeholder');
  });

  it('lets rules read item paths through selections, aggregates and supplied facts', () => {
    const wireCompatibility = resolveItemPath(berenstein.item, 'geometry.wireCompatibility', 'max');
    expect(wireCompatibility).toMatchObject({ status: 'resolved', value: 0.038, unit: 'in' });
    expect(resolveItemPath(berenstein.item, 'geometry.outerDiameter')).toMatchObject({
      value: 5,
      unit: 'Fr',
    });
    // The Berenstein item has no inner diameter; its rod model supplies one.
    const lumen = resolveItemPath(berenstein.item, 'geometry.innerDiameter');
    expect(lumen).toMatchObject({
      status: 'resolved',
      value: 0.039,
      unit: 'in',
      provenance: { confidence: 'placeholder' },
    });
    expect(resolveItemPath(berenstein.item, 'ratings.maxPressure').status).toBe('missing');

    const sheathItem = repository().devices.get('sheath-introducer');
    if (sheathItem === undefined) {
      throw new Error('sheath-introducer is missing from data/devices/access.json');
    }
    const sheath = buildItemInstance(sheathItem, { innerDiameter: { value: 5, unit: 'Fr' } });
    expect(resolveItemPath(sheath, 'geometry.innerDiameter')).toMatchObject({ value: 5, unit: 'Fr' });
    expect(resolveItemPath(sheath, 'geometry.length')).toMatchObject({
      value: 11,
      unit: 'cm',
      valueSI: 0.11,
    });
    // Without a selection, a list of sizes cannot resolve to one value: rules report unknown, never a pass.
    expect(resolveItemPath(buildItemInstance(sheathItem), 'geometry.innerDiameter').status).toBe('missing');
  });

  it('gives a tapered microcatheter per-section diameters, stiffness, mass and contact radius (spec 04 §5)', () => {
    const high = tierSegmentLength('high');
    const progreat = buildRodInstance(repository(), 'rm-progreat-2.4-130', high);
    const distal = valueToSI(2.4, 'Fr');
    const proximal = valueToSI(2.9, 'Fr');
    const lumen = valueToSI(0.022, 'in');
    const tip = section(progreat, 'tip');
    const body = section(progreat, 'body');
    expect(tip.outerDiameter.clinical).toEqual({ value: 2.4, unit: 'Fr' });
    expect(tip.outerDiameter.provenance.confidence).toBe('sourced');
    expect(body.outerDiameter.clinical).toEqual({ value: 2.9, unit: 'Fr' });
    // The device's own outer diameter is the most proximal section's.
    expect(progreat.outerDiameter.clinical).toEqual({ value: 2.9, unit: 'Fr' });
    expect(
      relativeError(tip.bendingStiffness.atFromTip, bendingStiffness(valueToSI(0.3, 'GPa'), distal, lumen)),
    ).toBeLessThan(1e-12);
    expect(
      relativeError(body.bendingStiffness.atFromTip, bendingStiffness(valueToSI(1, 'GPa'), proximal, lumen)),
    ).toBeLessThan(1e-12);
    const segments = progreat.segments;
    const last = segments.count - 1;
    expect(segments.outerRadius[last]).toBe(distal / 2);
    expect(segments.outerRadius[0]).toBe(proximal / 2);
    expect(segments.innerRadius[last]).toBe(lumen / 2);
    expect(segments.bendingStiffness[last]).toBeCloseTo(tip.bendingStiffness.atFromTip, 20);
    expect(segments.massPerLength[last]).toBeCloseTo(1200 * crossSectionArea(distal, lumen), 15);
    expect(segments.massPerLength[0]).toBeCloseTo(1200 * crossSectionArea(proximal, lumen), 15);
    // The section diameters are inspector parameters with their provenance.
    expect(progreat.parameters.map((parameter) => parameter.label)).toContain('tip section: outer diameter');
    // fit-micro-parent keeps reading the proximal diameter from the item.
    expect(resolveItemPath(progreat.item, 'geometry.outerDiameterProximal')).toMatchObject({
      value: 2.9,
      unit: 'Fr',
    });
  });

  it.each(['high', 'standard'])('builds every rod model in /data on the %s tier', (tierId) => {
    for (const id of repository().physics.rodModels.map((model) => model.id)) {
      const instance = buildRodInstance(repository(), id, tierSegmentLength(tierId));
      expect(instance.segments.count, id).toBeGreaterThan(1);
      for (let j = 0; j < instance.segments.count; j += 1) {
        expect(instance.segments.bendingStiffness[j], id).toBeGreaterThan(0);
        expect(instance.segments.outerRadius[j], id).toBeGreaterThan(instance.segments.innerRadius[j] ?? 0);
      }
    }
  });
});
