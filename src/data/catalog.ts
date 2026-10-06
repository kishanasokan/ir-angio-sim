import { isRecord, isScalar, type Selection } from './facts';
import { findItemProperty, getPath } from './items';
import { combineProvenance, provenanceOf, type Provenance } from './provenance';
import { aggregateQuantity, QuantityError, resolveQuantity, type Aggregate } from './quantity';
import { resolveNumber, siValue, type ResolvedValue } from './resolved';
import { distributeRestShape, type BendDirection, type RestShapeDistribution } from './restShape';
import type { BulkMaterial, DeviceItem, Friction, RodModel } from './schemas';
import { isConvertibleUnit, valueToSI } from './units';

/**
 * Device instances (spec 02 §7.3, prompts/M1-foundations.md §1.4). The simulation never reads a device item
 * directly: a rod model plus its item becomes an instance with every value resolved to SI, laid out per segment
 * for a tier, and each value keeps the provenance the device inspector shows.
 */

export class CatalogError extends Error {
  override name = 'CatalogError';
}

/** What the catalog reads; the repository from loaders.ts provides it. */
export interface CatalogSource {
  readonly devices: ReadonlyMap<string, DeviceItem>;
  readonly rodModels: ReadonlyMap<string, RodModel>;
  readonly friction: ReadonlyMap<string, Friction>;
  readonly bulk: ReadonlyMap<string, BulkMaterial>;
}

// ---------------------------------------------------------------------------------------------------------------
// Cross-section formulas (spec 02 §11.1)

/** Second moment of area of a solid rod or a tube: I = π(dₒ⁴ − dᵢ⁴)/64. */
export function secondMomentOfArea(outerDiameter: number, innerDiameter = 0): number {
  const outer2 = outerDiameter * outerDiameter;
  const inner2 = innerDiameter * innerDiameter;
  return (Math.PI * (outer2 * outer2 - inner2 * inner2)) / 64;
}

/** Bending stiffness EI = E·π(dₒ⁴ − dᵢ⁴)/64. */
export function bendingStiffness(youngsModulus: number, outerDiameter: number, innerDiameter = 0): number {
  return youngsModulus * secondMomentOfArea(outerDiameter, innerDiameter);
}

/** Shear modulus G = E / (2(1 + ν)). */
export function shearModulus(youngsModulus: number, poissonRatio: number): number {
  return youngsModulus / (2 * (1 + poissonRatio));
}

/** Cross-section area π(dₒ² − dᵢ²)/4. */
export function crossSectionArea(outerDiameter: number, innerDiameter = 0): number {
  return (Math.PI * (outerDiameter * outerDiameter - innerDiameter * innerDiameter)) / 4;
}

// ---------------------------------------------------------------------------------------------------------------
// Item instances: an item plus selections, for compatibility rules (spec 02 §8)

export interface ItemInstance {
  readonly id: string;
  readonly kind: string;
  readonly item: DeviceItem;
  /** Selections by property name, for example {innerDiameter: {value: 5, unit: 'Fr'}}. */
  readonly selections: Readonly<Record<string, Selection>>;
  /** Facts a rod model supplies when the item lacks them, by path, for example geometry.innerDiameter. */
  readonly supplied: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export function buildItemInstance(
  item: DeviceItem,
  selections: Readonly<Record<string, Selection>> = {},
  supplied: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {},
): ItemInstance {
  return { id: item.id, kind: item.kind, item, selections, supplied };
}

export type PathResolution =
  | {
      readonly status: 'resolved';
      readonly value: number | string | boolean;
      readonly unit?: string;
      /** The value in SI, when it is a number in a convertible unit. */
      readonly valueSI?: number;
      readonly provenance: Provenance;
    }
  | { readonly status: 'missing'; readonly reason: string };

function resolvedPath(value: number | string | boolean, unit: string | undefined, provenance: Provenance): PathResolution {
  const valueSI = typeof value === 'number' && isConvertibleUnit(unit) ? valueToSI(value, unit) : undefined;
  return {
    status: 'resolved',
    value,
    ...(unit === undefined ? {} : { unit }),
    ...(valueSI === undefined ? {} : { valueSI }),
    provenance,
  };
}

/**
 * Resolves a property path such as geometry.wireCompatibility on an instance. When the property has options, the
 * instance's selection is used unless an aggregate is named (spec 02 §8). A value that cannot be resolved comes
 * back `missing`, which compatibility rules report as unknown, never as a pass.
 */
export function resolveItemPath(instance: ItemInstance, path: string, aggregate?: Aggregate): PathResolution {
  const missing = (reason: string): PathResolution => ({ status: 'missing', reason });
  const supplied = instance.supplied[path];
  let node: unknown = supplied ?? instance.item;
  let fact: Readonly<Record<string, unknown>> | undefined = supplied;
  if (supplied === undefined) {
    for (const part of path.split('.')) {
      if (!isRecord(node)) {
        return missing(`${instance.id} has no ${path}`);
      }
      node = node[part];
      if (isRecord(node) && 'confidence' in node) {
        fact = node;
      }
    }
  }
  if (node === undefined) {
    return missing(`${instance.id} has no ${path}`);
  }
  if (fact === undefined) {
    return missing(`${instance.id} ${path} is not part of a fact`);
  }
  const provenance = provenanceOf(fact);
  const factUnit = typeof fact.unit === 'string' ? fact.unit : undefined;

  if (isScalar(node)) {
    // A number inside a fact, such as size.max.
    return resolvedPath(node, factUnit, provenance);
  }
  if (!isRecord(node)) {
    return missing(`${instance.id} ${path} is not a value`);
  }
  if (aggregate !== undefined) {
    const resolved = aggregateQuantity(node, aggregate);
    return resolved === undefined
      ? missing(`${instance.id} ${path} has no ${aggregate}`)
      : resolvedPath(resolved.value, resolved.unit, provenance);
  }
  const key = path.split('.').at(-1) ?? path;
  try {
    const resolved = resolveQuantity(node, instance.selections[key]);
    return resolvedPath(resolved.value, resolved.unit, provenance);
  } catch (error) {
    if (error instanceof QuantityError) {
      return missing(`${instance.id} ${path}: ${error.message}`);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Rod instances

/** A value at the distal (fromTip) and proximal (toTip) end of a section; equal unless the section ramps. */
export interface SectionRange {
  readonly atFromTip: number;
  readonly atToTip: number;
}

export interface RodSectionInstance {
  readonly name: string;
  readonly fromTip: ResolvedValue;
  readonly toTip: ResolvedValue;
  /** Pa. */
  readonly youngsModulus: SectionRange;
  /** EI, N·m². */
  readonly bendingStiffness: SectionRange;
  /** GJ with J = 2I, N·m². */
  readonly torsionalStiffness: SectionRange;
  readonly modulusProvenance: Provenance;
  readonly bendingProvenance: Provenance;
  readonly torsionProvenance: Provenance;
}

/** Per-segment properties; segment j joins nodes j and j+1, from the handle (0) to the tip. */
export interface RodSegments {
  readonly count: number;
  /** Rest length of every segment, metres (the tier's segmentLength). */
  readonly length: number;
  /** Index into the instance's sections. */
  readonly section: Int32Array;
  readonly outerRadius: Float64Array;
  readonly innerRadius: Float64Array;
  /** Pa. */
  readonly youngsModulus: Float64Array;
  /** Pa. */
  readonly shearModulus: Float64Array;
  /** I, m⁴. */
  readonly secondMoment: Float64Array;
  /** EI, N·m². */
  readonly bendingStiffness: Float64Array;
  /** GJ, N·m². */
  readonly torsionalStiffness: Float64Array;
  /** kg/m. */
  readonly massPerLength: Float64Array;
}

export interface RodRestShapeRegion {
  readonly fromTip: ResolvedValue;
  readonly toTip: ResolvedValue;
  readonly bendAngle: ResolvedValue;
  readonly toward: BendDirection;
}

export interface RodDeviceInstance {
  readonly rodModelId: string;
  readonly deviceId: string;
  readonly kind: string;
  readonly genericName?: string;
  readonly brandName?: string;
  readonly manufacturer?: string;
  readonly length: ResolvedValue;
  readonly outerDiameter: ResolvedValue;
  /** Null for solid wires. */
  readonly innerDiameter: ResolvedValue | null;
  readonly material: {
    readonly id: string;
    readonly name: string;
    readonly density: ResolvedValue;
    readonly poissonRatio: ResolvedValue;
    /** An assumed core material when the sources do not state it. */
    readonly assumption?: string;
  };
  readonly wallFriction: ResolvedValue;
  /** Friction inside this device's lumen; null for wires. */
  readonly lumenFriction: ResolvedValue | null;
  readonly bodyYoungsModulus: ResolvedValue | null;
  readonly sections: readonly RodSectionInstance[];
  readonly segments: RodSegments;
  readonly restShape: {
    readonly regions: readonly RodRestShapeRegion[];
    readonly distribution: RestShapeDistribution;
  };
  readonly radiopacity: { readonly tipBoost: ResolvedValue; readonly body: ResolvedValue };
  /** The item with this rod model's selections, for compatibility rules. */
  readonly item: ItemInstance;
  /** Every resolved value with its provenance, in display order, for the device inspector. */
  readonly parameters: readonly ResolvedValue[];
}

// Section bounds and segment counts are compared in metres; this only absorbs floating-point noise.
const LENGTH_TOLERANCE = 1e-9;

export function buildRodInstance(source: CatalogSource, rodModelId: string, segmentLength: number): RodDeviceInstance {
  const model = source.rodModels.get(rodModelId);
  if (model === undefined) {
    throw new CatalogError(`No rod model "${rodModelId}" in data/tuning/physics.json.`);
  }
  const where = `rod model ${model.id}`;
  const item = source.devices.get(model.deviceId);
  if (item === undefined) {
    throw new CatalogError(`${where}: no device item "${model.deviceId}".`);
  }
  const variant = model.variant as Readonly<Record<string, Selection>>;

  // A property comes from the item, with the variant's selection, or from a selection that is itself a full fact
  // because the item lacks the property (spec 02 §4.4).
  const fromItem = (label: string, keys: readonly string[]): ResolvedValue | undefined => {
    for (const key of keys) {
      const selection = variant[key];
      const property = findItemProperty(item, key);
      if (property !== undefined) {
        return resolveNumber(label, property.fact, {
          ...(selection === undefined ? {} : { selection }),
          where: `${where}: ${item.id} ${property.path}`,
        });
      }
      if (isRecord(selection) && 'confidence' in selection) {
        return resolveNumber(label, selection, { where: `${where}: variant.${key}` });
      }
    }
    return undefined;
  };
  const required = (value: ResolvedValue | undefined, what: string): ResolvedValue => {
    if (value === undefined) {
      throw new CatalogError(`${where}: ${item.id} has no ${what}.`);
    }
    return value;
  };
  const design = (label: string, quantity: Parameters<typeof resolveNumber>[1], path: string): ResolvedValue =>
    resolveNumber(label, quantity, { defaultConfidence: 'design', where: `${where}: ${path}` });

  const length = required(fromItem('Length', ['length', 'usableLength']), 'length');
  const outerDiameter = required(fromItem('Outer diameter', ['diameter', 'outerDiameter']), 'diameter');
  const innerDiameter =
    fromItem('Inner diameter', ['innerDiameter']) ??
    (model.innerDiameter === undefined ? undefined : design('Inner diameter', model.innerDiameter, 'innerDiameter')) ??
    null;
  if (innerDiameter === null && findItemProperty(item, 'diameter') === undefined) {
    throw new CatalogError(`${where}: a tube needs an inner diameter (item geometry or rod model innerDiameter).`);
  }

  const bulk = source.bulk.get(model.materialId);
  if (bulk === undefined) {
    throw new CatalogError(`${where}: no material "${model.materialId}" in data/physics/materials.json.`);
  }
  const density = design('Density', bulk.density, `material ${bulk.id} density`);
  const poissonRatio = design('Poisson ratio', bulk.poissonRatio, `material ${bulk.id} poissonRatio`);

  const frictionValue = (label: string, id: string): ResolvedValue => {
    const friction = source.friction.get(id);
    if (friction === undefined) {
      throw new CatalogError(`${where}: no friction "${id}" in data/physics/materials.json.`);
    }
    return design(label, friction.coefficient, `friction ${id}`);
  };
  const wallFriction = frictionValue('Wall friction coefficient', model.frictionId);
  const lumenFriction =
    model.lumenFrictionId === undefined ? null : frictionValue('Lumen friction coefficient', model.lumenFrictionId);

  let bodyYoungsModulus: ResolvedValue | null = null;
  if (model.bodyYoungsModulusFrom !== undefined) {
    const fact = getPath(item, model.bodyYoungsModulusFrom);
    if (!isRecord(fact)) {
      throw new CatalogError(`${where}: ${item.id} has no ${model.bodyYoungsModulusFrom}.`);
    }
    bodyYoungsModulus = resolveNumber("Body Young's modulus", fact, {
      where: `${where}: ${item.id} ${model.bodyYoungsModulusFrom}`,
    });
  }

  const outer = outerDiameter.value;
  const inner = innerDiameter?.value ?? 0;
  const secondMoment = secondMomentOfArea(outer, inner);
  // Torsion uses the polar moment J = 2I (spec 02 §11.1).
  const polarMoment = 2 * secondMoment;
  const geometryProvenance =
    innerDiameter === null ? [outerDiameter.provenance] : [outerDiameter.provenance, innerDiameter.provenance];
  const parameters: ResolvedValue[] = [length, outerDiameter];
  if (innerDiameter !== null) {
    parameters.push(innerDiameter);
  }
  if (bodyYoungsModulus !== null) {
    parameters.push(bodyYoungsModulus);
  }

  const sections = model.sections.map((section, i): RodSectionInstance => {
    const path = `sections[${i}] (${section.name})`;
    const fromTip = design(`${section.name} section: start from tip`, section.fromTip, `${path}.fromTip`);
    const toTip = design(`${section.name} section: end from tip`, section.toTip, `${path}.toTip`);
    const modulus = sectionModulus(section, bodyYoungsModulus, `${where}: ${path}`);
    const bending: SectionRange = {
      atFromTip: modulus.range.atFromTip * secondMoment,
      atToTip: modulus.range.atToTip * secondMoment,
    };
    const torsion: SectionRange = {
      atFromTip: shearModulus(modulus.range.atFromTip, poissonRatio.value) * polarMoment,
      atToTip: shearModulus(modulus.range.atToTip, poissonRatio.value) * polarMoment,
    };
    const bendingProvenance = combineProvenance(
      [modulus.provenance, ...geometryProvenance],
      'EI = E·π(dₒ⁴ − dᵢ⁴)/64',
    );
    const torsionProvenance = combineProvenance(
      [modulus.provenance, poissonRatio.provenance, ...geometryProvenance],
      'GJ = E/(2(1 + ν))·J with J = 2I',
    );

    parameters.push(toTip);
    const ends: readonly (readonly [string, keyof SectionRange])[] =
      modulus.range.atFromTip === modulus.range.atToTip
        ? [['', 'atFromTip']]
        : [
            [' at the distal end', 'atFromTip'],
            [' at the proximal end', 'atToTip'],
          ];
    for (const [suffix, end] of ends) {
      parameters.push(
        siValue(
          `${section.name} section: Young's modulus${suffix}`,
          modulus.range[end],
          'Pa',
          modulus.provenance,
          modulus.clinicalUnit,
        ),
        siValue(`${section.name} section: bending stiffness EI${suffix}`, bending[end], 'N*m2', bendingProvenance),
        siValue(`${section.name} section: torsional stiffness GJ${suffix}`, torsion[end], 'N*m2', torsionProvenance),
      );
    }

    return {
      name: section.name,
      fromTip,
      toTip,
      youngsModulus: modulus.range,
      bendingStiffness: bending,
      torsionalStiffness: torsion,
      modulusProvenance: modulus.provenance,
      bendingProvenance,
      torsionProvenance,
    };
  });

  // Segments are laid out from the tip; a remainder shorter than one segment is dropped at the handle end,
  // which never enters the patient (docs/M1-plan.md D21).
  const count = Math.floor(length.value / segmentLength + LENGTH_TOLERANCE);
  if (count < 2) {
    throw new CatalogError(`${where}: the device is shorter than two segments of ${segmentLength} m.`);
  }
  const tolerance = segmentLength * LENGTH_TOLERANCE;
  const segments: RodSegments = {
    count,
    length: segmentLength,
    section: new Int32Array(count),
    outerRadius: new Float64Array(count),
    innerRadius: new Float64Array(count),
    youngsModulus: new Float64Array(count),
    shearModulus: new Float64Array(count),
    secondMoment: new Float64Array(count),
    bendingStiffness: new Float64Array(count),
    torsionalStiffness: new Float64Array(count),
    massPerLength: new Float64Array(count),
  };
  const massPerLength = density.value * crossSectionArea(outer, inner);
  for (let j = 0; j < count; j += 1) {
    const midpoint = (count - j - 0.5) * segmentLength;
    const k = sections.findIndex(
      (section) => midpoint >= section.fromTip.value - tolerance && midpoint < section.toTip.value - tolerance,
    );
    const section = sections[k];
    if (section === undefined) {
      throw new CatalogError(
        `${where}: the segment ${(midpoint * 1e3).toFixed(1)} mm from the tip falls in no section.`,
      );
    }
    const span = section.toTip.value - section.fromTip.value;
    const t = span > 0 ? (midpoint - section.fromTip.value) / span : 0;
    const modulus =
      section.youngsModulus.atFromTip + (section.youngsModulus.atToTip - section.youngsModulus.atFromTip) * t;
    const shear = shearModulus(modulus, poissonRatio.value);
    segments.section[j] = k;
    segments.outerRadius[j] = outer / 2;
    segments.innerRadius[j] = inner / 2;
    segments.youngsModulus[j] = modulus;
    segments.shearModulus[j] = shear;
    segments.secondMoment[j] = secondMoment;
    segments.bendingStiffness[j] = modulus * secondMoment;
    segments.torsionalStiffness[j] = shear * polarMoment;
    segments.massPerLength[j] = massPerLength;
  }

  parameters.push(density, poissonRatio, wallFriction);
  if (lumenFriction !== null) {
    parameters.push(lumenFriction);
  }

  const regions = model.restShape.map((region, i): RodRestShapeRegion => {
    const path = `restShape[${i}]`;
    const resolved: RodRestShapeRegion = {
      fromTip: design(`Rest shape ${i + 1}: start from tip`, region.fromTip, `${path}.fromTip`),
      toTip: design(`Rest shape ${i + 1}: end from tip`, region.toTip, `${path}.toTip`),
      bendAngle: design(`Rest shape ${i + 1}: bend angle`, region.bendAngle, `${path}.bendAngle`),
      toward: region.toward ?? 'd1',
    };
    parameters.push(resolved.toTip, resolved.bendAngle);
    return resolved;
  });
  const distribution = distributeRestShape(
    regions.map((region) => ({
      fromTip: region.fromTip.value,
      toTip: region.toTip.value,
      bendAngle: region.bendAngle.value,
      toward: region.toward,
    })),
    count,
    segmentLength,
  );

  const radiopacity = {
    tipBoost: design('Radiopacity: tip boost', model.radiopacity.tipBoost, 'radiopacity.tipBoost'),
    body: design('Radiopacity: body', model.radiopacity.body, 'radiopacity.body'),
  };
  parameters.push(radiopacity.tipBoost, radiopacity.body);

  // Rules read geometry.innerDiameter; a rod model supplies it when the item lacks it (spec 02 §11.1).
  const supplied: Record<string, Readonly<Record<string, unknown>>> = {};
  if (findItemProperty(item, 'innerDiameter') === undefined && model.innerDiameter !== undefined) {
    supplied['geometry.innerDiameter'] = model.innerDiameter;
  }
  // A variant selection that is itself a fact supplies a property the item lacks (spec 02 §4.4), for the rules too:
  // the Bentson's length, for example, which limit-wire-length reads.
  for (const [key, selection] of Object.entries(variant)) {
    if (isRecord(selection) && 'confidence' in selection && findItemProperty(item, key) === undefined) {
      supplied[`geometry.${key}`] ??= selection;
    }
  }

  return {
    rodModelId: model.id,
    deviceId: item.id,
    kind: item.kind,
    ...(item.genericName === undefined ? {} : { genericName: item.genericName }),
    ...(item.brandName === undefined ? {} : { brandName: item.brandName }),
    ...(item.manufacturer === undefined ? {} : { manufacturer: item.manufacturer }),
    length,
    outerDiameter,
    innerDiameter,
    material: {
      id: bulk.id,
      name: bulk.name,
      density,
      poissonRatio,
      ...(model.materialAssumption === undefined ? {} : { assumption: model.materialAssumption.text }),
    },
    wallFriction,
    lumenFriction,
    bodyYoungsModulus,
    sections,
    segments,
    restShape: { regions, distribution },
    radiopacity,
    item: buildItemInstance(item, variant, supplied),
    parameters,
  };
}

/**
 * A section's Young's modulus: absolute, or a ratio of the item's body modulus. A {min, max} ratio ramps linearly
 * from min at fromTip to max at toTip, so the section stiffens toward the body.
 */
function sectionModulus(
  section: RodModel['sections'][number],
  body: ResolvedValue | null,
  where: string,
): { readonly range: SectionRange; readonly provenance: Provenance; readonly clinicalUnit: string } {
  if (section.youngsModulus !== undefined) {
    const resolved = resolveNumber(`${section.name} section: Young's modulus`, section.youngsModulus, {
      where: `${where}.youngsModulus`,
    });
    return {
      range: { atFromTip: resolved.value, atToTip: resolved.value },
      provenance: resolved.provenance,
      clinicalUnit: resolved.clinical.unit,
    };
  }
  const ratio = section.youngsModulusRatio;
  if (ratio === undefined || body === null) {
    throw new CatalogError(`${where} uses youngsModulusRatio without a body modulus.`);
  }
  const ends =
    typeof ratio.value === 'number'
      ? [ratio.value, ratio.value]
      : typeof ratio.min === 'number' && typeof ratio.max === 'number'
        ? [ratio.min, ratio.max]
        : undefined;
  if (ends === undefined || ratio.unit !== '1') {
    throw new CatalogError(`${where}: youngsModulusRatio needs a value, or a min and a max, in unit 1.`);
  }
  const [atFromTip = Number.NaN, atToTip = Number.NaN] = ends;
  return {
    range: { atFromTip: atFromTip * body.value, atToTip: atToTip * body.value },
    provenance: combineProvenance([provenanceOf(ratio), body.provenance], "E = Young's modulus ratio × body modulus"),
    clinicalUnit: body.clinical.unit,
  };
}
