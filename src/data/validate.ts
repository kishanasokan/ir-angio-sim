import {
  CONFIDENCE_LEVELS,
  emptyConfidenceCounts,
  isConfidence,
  isRecord,
  isScalar,
  type Confidence,
  type Selection,
} from './facts';
import { findItemProperty, getPath } from './items';
import { selectionValue } from './quantity';
import {
  SCHEMAS,
  isSchemaId,
  type AnatomyGraphFile,
  type CaseFile,
  type Check,
  type DeviceItem,
  type DevicesFile,
  type MaterialsFile,
  type PhysicsTuning,
  type RulesFile,
  type SchemaId,
  type TuningFile,
} from './schemas';
import { isKnownUnit } from './units';

/**
 * Validates /data against spec 02 §14. `npm run validate-data`, the unit tests and the app share this module, so
 * all three apply the same rules. Checks run in the order of §14: schemas, facts, provenance, orphan quantities,
 * ids, then references between files.
 */

export const ERROR_CODES = [
  'schema',
  'confidence',
  'quantity-shape',
  'unknown-unit',
  'missing-source',
  'unknown-source',
  'unopened-source',
  'derived-note',
  'estimated-note',
  'orphan-quantity',
  'duplicate-id',
  'bad-reference',
  'selection-mismatch',
  'graph',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ValidationError {
  readonly code: ErrorCode;
  /** The file and JSON path, for example devices/guidewires.json#items[3].geometry.diameter. */
  readonly path: string;
  readonly message: string;
}

/** A data file as text, with its path relative to the data root and '/' separators. */
export interface DataFile {
  readonly path: string;
  readonly text: string;
}

export interface ParsedFile {
  readonly path: string;
  /** Undefined when the file is not valid JSON. */
  readonly json: unknown;
  readonly schemaId: SchemaId | null;
  /** True when the file passed its schema. */
  readonly valid: boolean;
}

export interface FileCounts {
  readonly path: string;
  readonly counts: Readonly<Record<Confidence, number>>;
}

export interface PlaceholderEntry {
  readonly path: string;
  readonly note?: string;
}

export interface ValidationReport {
  /** Fact counts by confidence level, per file. */
  readonly files: readonly FileCounts[];
  readonly totals: Readonly<Record<Confidence, number>>;
  readonly placeholders: readonly PlaceholderEntry[];
  /** Registry sources that no fact in /data cites. */
  readonly uncitedSources: readonly string[];
}

export interface ValidationResult {
  readonly errors: readonly ValidationError[];
  readonly report: ValidationReport;
  readonly files: readonly ParsedFile[];
}

type Fail = (code: ErrorCode, path: string, message: string) => void;

export function validateData(files: readonly DataFile[]): ValidationResult {
  const errors: ValidationError[] = [];
  const fail: Fail = (code, path, message) => {
    errors.push({ code, path, message });
  };

  // 1. Every file parses, has a known schema id and passes its schema.
  const parsed = files.map((file) => parseFile(file, fail));
  // 2–4. Facts, provenance and orphan quantities; the same pass counts facts for the report.
  const report = walkFacts(parsed, sourceRegistry(parsed), fail);
  // 5. Ids.
  checkIds(parsed, fail);
  // 6. References between files.
  checkReferences(parsed, fail);

  return { errors, report, files: parsed };
}

// ---------------------------------------------------------------------------------------------------------------
// Paths

function at(file: string, jsonPath: string): string {
  return jsonPath === '' ? file : `${file}#${jsonPath}`;
}

function member(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

function index(path: string, i: number): string {
  return `${path}[${i}]`;
}

function issuePath(parts: readonly PropertyKey[]): string {
  return parts.reduce<string>(
    (path, part) => (typeof part === 'number' ? index(path, part) : member(path, String(part))),
    '',
  );
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Parsing and schemas

function parseFile(file: DataFile, fail: Fail): ParsedFile {
  let json: unknown;
  try {
    json = JSON.parse(file.text) as unknown;
  } catch (error) {
    fail('schema', file.path, `is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return { path: file.path, json: undefined, schemaId: null, valid: false };
  }

  const schemaId = isRecord(json) ? json.schema : undefined;
  if (!isSchemaId(schemaId)) {
    fail(
      'schema',
      at(file.path, 'schema'),
      schemaId === undefined
        ? 'has no "schema" field'
        : `has unknown schema id ${JSON.stringify(schemaId)}; spec 02 §2 lists the known ids`,
    );
    return { path: file.path, json, schemaId: null, valid: false };
  }

  const result = SCHEMAS[schemaId].safeParse(json);
  if (!result.success) {
    for (const issue of result.error.issues) {
      fail('schema', at(file.path, issuePath(issue.path)), issue.message);
    }
  }
  return { path: file.path, json, schemaId, valid: result.success };
}

// ---------------------------------------------------------------------------------------------------------------
// 2–4. Facts, provenance and orphan quantities

function sourceRegistry(parsed: readonly ParsedFile[]): ReadonlyMap<string, { readonly opened: boolean }> {
  const registry = new Map<string, { readonly opened: boolean }>();
  for (const file of parsed) {
    if (file.schemaId !== 'ir-sim/sources@1' || !isRecord(file.json) || !Array.isArray(file.json.sources)) {
      continue;
    }
    for (const source of file.json.sources as unknown[]) {
      if (isRecord(source) && typeof source.id === 'string') {
        registry.set(source.id, { opened: source.opened === true });
      }
    }
  }
  return registry;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function walkFacts(
  parsed: readonly ParsedFile[],
  registry: ReadonlyMap<string, { readonly opened: boolean }>,
  fail: Fail,
): ValidationReport {
  const files: FileCounts[] = [];
  const totals = emptyConfidenceCounts();
  const placeholders: PlaceholderEntry[] = [];
  const cited = new Set<string>();

  for (const file of parsed) {
    if (file.json === undefined) {
      continue;
    }
    const counts = emptyConfidenceCounts();
    // Unit-bearing values in tuning files default to design (spec 02 §4.5), so they are never orphans.
    const tuning = file.schemaId === 'ir-sim/tuning@1';

    const checkFact = (fact: Record<string, unknown>, where: string): void => {
      const { confidence, source } = fact;
      if (!isConfidence(confidence)) {
        fail(
          'confidence',
          where,
          `has confidence ${JSON.stringify(confidence)}; use one of ${CONFIDENCE_LEVELS.join(', ')}`,
        );
        return;
      }
      counts[confidence] += 1;
      if (confidence === 'placeholder') {
        placeholders.push(typeof fact.note === 'string' ? { path: where, note: fact.note } : { path: where });
      }
      if (source !== undefined) {
        if (typeof source !== 'string' || !registry.has(source)) {
          fail('unknown-source', where, `cites ${JSON.stringify(source)}, which is not in data/sources.json`);
        } else {
          cited.add(source);
        }
      }
      if (confidence === 'sourced' || confidence === 'derived') {
        if (source === undefined) {
          fail('missing-source', where, `is ${confidence} but cites no source`);
        } else if (typeof source === 'string' && registry.get(source)?.opened === false) {
          fail(
            'unopened-source',
            where,
            `is ${confidence} but cites "${source}", which was never opened; sourced and derived facts cite only opened sources (spec 02 §3)`,
          );
        }
      }
      if (confidence === 'derived' && !hasText(fact.note) && !hasText(fact.text)) {
        fail('derived-note', where, 'is derived but has no note explaining the derivation');
      }
      if (confidence === 'estimated' && !hasText(fact.note) && source === undefined) {
        fail('estimated-note', where, 'is estimated but has neither a note nor a source');
      }
    };

    const visit = (node: unknown, path: string, inFact: boolean, inSelection: boolean): void => {
      if (Array.isArray(node)) {
        node.forEach((child, i) => {
          visit(child, index(path, i), inFact, inSelection);
        });
        return;
      }
      if (!isRecord(node)) {
        return;
      }
      const where = at(file.path, path);
      const isFact = 'confidence' in node;
      if (isFact) {
        checkFact(node, where);
      }
      checkQuantity(node, where, fail);
      if ('unit' in node && !isFact && !inFact && !inSelection && !tuning) {
        fail(
          'orphan-quantity',
          where,
          'carries a unit but no confidence, outside a fact, a selection or a tuning file (spec 02 §14)',
        );
      }
      for (const [key, child] of Object.entries(node)) {
        visit(
          child,
          member(path, key),
          inFact || isFact,
          inSelection || key === 'select' || key === 'variant',
        );
      }
    };

    visit(file.json, '', false, false);
    files.push({ path: file.path, counts });
    for (const level of CONFIDENCE_LEVELS) {
      totals[level] += counts[level];
    }
  }

  const uncitedSources = [...registry.keys()].filter((id) => !cited.has(id));
  return { files, totals, placeholders, uncitedSources };
}

/** Checks any object that holds a value, options or a range: its shape and its unit (spec 02 §4.1, §5). */
function checkQuantity(node: Record<string, unknown>, where: string, fail: Fail): void {
  const hasValue = 'value' in node;
  const hasOptions = 'options' in node;
  const hasRange = 'min' in node || 'max' in node;
  if (!hasValue && !hasOptions && !hasRange) {
    if ('unit' in node && !isKnownUnit(node.unit)) {
      fail('unknown-unit', where, `uses unit ${JSON.stringify(node.unit)}, which spec 02 §5 does not list`);
    }
    return;
  }

  if (Number(hasValue) + Number(hasOptions) + Number(hasRange) > 1) {
    fail('quantity-shape', where, 'has more than one of value, options and min/max (spec 02 §4.1)');
  }
  if (hasValue && !isScalar(node.value)) {
    fail('quantity-shape', where, 'has a value that is not a number, string or boolean');
  }
  if (hasOptions) {
    const { options } = node;
    const valid =
      Array.isArray(options) &&
      options.length > 0 &&
      options.every((option) => typeof option === 'number' || typeof option === 'string');
    if (!valid) {
      fail('quantity-shape', where, 'has options that are not a non-empty list of numbers or strings');
    }
  }
  if (hasRange) {
    for (const bound of ['min', 'max'] as const) {
      if (bound in node && typeof node[bound] !== 'number') {
        fail('quantity-shape', where, `has a ${bound} that is not a number`);
      }
    }
    if (typeof node.min === 'number' && typeof node.max === 'number' && node.min > node.max) {
      fail('quantity-shape', where, `has min ${node.min} above max ${node.max}`);
    }
  }
  for (const key of ['sd', 'tolerance'] as const) {
    if (key in node && typeof node[key] !== 'number') {
      fail('quantity-shape', where, `has a ${key} that is not a number`);
    }
  }

  const numeric =
    typeof node.value === 'number' ||
    typeof node.min === 'number' ||
    typeof node.max === 'number' ||
    (Array.isArray(node.options) && node.options.some((option) => typeof option === 'number'));
  if ('unit' in node) {
    if (!isKnownUnit(node.unit)) {
      fail('unknown-unit', where, `uses unit ${JSON.stringify(node.unit)}, which spec 02 §5 does not list`);
    }
  } else if (numeric) {
    fail('unknown-unit', where, 'has a numeric value but no unit');
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Ids

function checkIds(parsed: readonly ParsedFile[], fail: Fail): void {
  const deviceOwners = new Map<string, string>();
  const sourceOwners = new Map<string, string>();

  for (const file of parsed) {
    if (file.json === undefined) {
      continue;
    }
    // Ids are unique within each file.
    const seen = new Map<string, string>();
    const visit = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((child, i) => {
          visit(child, index(path, i));
        });
        return;
      }
      if (!isRecord(node)) {
        return;
      }
      if (typeof node.id === 'string') {
        const first = seen.get(node.id);
        if (first === undefined) {
          seen.set(node.id, at(file.path, member(path, 'id')));
        } else {
          fail('duplicate-id', at(file.path, member(path, 'id')), `repeats id "${node.id}" (first at ${first})`);
        }
      }
      for (const [key, child] of Object.entries(node)) {
        visit(child, member(path, key));
      }
    };
    visit(file.json, '');

    // Device ids are unique across all device files, and source ids across registries.
    if (file.schemaId === 'ir-sim/devices@1') {
      claimAcrossFiles(file, 'items', deviceOwners, 'device', fail);
    } else if (file.schemaId === 'ir-sim/sources@1') {
      claimAcrossFiles(file, 'sources', sourceOwners, 'source', fail);
    }
  }
}

function claimAcrossFiles(
  file: ParsedFile,
  listKey: string,
  owners: Map<string, string>,
  label: string,
  fail: Fail,
): void {
  const list = isRecord(file.json) ? file.json[listKey] : undefined;
  if (!Array.isArray(list)) {
    return;
  }
  list.forEach((entry: unknown, i) => {
    if (!isRecord(entry) || typeof entry.id !== 'string') {
      return;
    }
    const owner = owners.get(entry.id);
    if (owner === undefined) {
      owners.set(entry.id, file.path);
    } else if (owner !== file.path) {
      fail(
        'duplicate-id',
        at(file.path, `${listKey}[${i}].id`),
        `${label} id "${entry.id}" is already used in ${owner}`,
      );
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// 6. References

interface References {
  readonly devices: ReadonlyMap<string, DeviceItem>;
  readonly frictionIds: ReadonlySet<string>;
  readonly bulkIds: ReadonlySet<string>;
  readonly rodModelIds: ReadonlySet<string>;
  readonly graphs: ReadonlyMap<string, AnatomyGraphFile>;
  /** Undefined when no physics tuning file is present. */
  readonly ruleParameterKeys: ReadonlySet<string> | undefined;
  /** Undefined when no rules file is present. */
  readonly roles: Readonly<Record<string, readonly string[]>> | undefined;
}

function filesWith<T>(parsed: readonly ParsedFile[], schemaId: SchemaId): { path: string; data: T }[] {
  return parsed
    .filter((file) => file.valid && file.schemaId === schemaId)
    .map((file) => ({ path: file.path, data: file.json as T }));
}

function checkReferences(parsed: readonly ParsedFile[], fail: Fail): void {
  const deviceFiles = filesWith<DevicesFile>(parsed, 'ir-sim/devices@1');
  const materialFiles = filesWith<MaterialsFile>(parsed, 'ir-sim/materials@1');
  const graphFiles = filesWith<AnatomyGraphFile>(parsed, 'ir-sim/anatomy-graph@1');
  const ruleFiles = filesWith<RulesFile>(parsed, 'ir-sim/rules@1');
  const caseFiles = filesWith<CaseFile>(parsed, 'ir-sim/case@0');
  const physicsFiles = filesWith<TuningFile>(parsed, 'ir-sim/tuning@1').filter(
    (file): file is { path: string; data: PhysicsTuning } => file.data.category === 'physics',
  );

  const devices = new Map<string, DeviceItem>();
  for (const file of deviceFiles) {
    for (const item of file.data.items) {
      if (!devices.has(item.id)) {
        devices.set(item.id, item);
      }
    }
  }
  const roles =
    ruleFiles.length === 0
      ? undefined
      : Object.assign({}, ...ruleFiles.map((file) => file.data.roles)) as Record<string, readonly string[]>;

  const refs: References = {
    devices,
    frictionIds: new Set(materialFiles.flatMap((file) => file.data.friction.map((entry) => entry.id))),
    bulkIds: new Set(materialFiles.flatMap((file) => file.data.bulk.map((entry) => entry.id))),
    rodModelIds: new Set(physicsFiles.flatMap((file) => file.data.rodModels.map((model) => model.id))),
    graphs: new Map(graphFiles.map((file) => [file.data.id, file.data])),
    ruleParameterKeys:
      physicsFiles.length === 0
        ? undefined
        : new Set(physicsFiles.flatMap((file) => Object.keys(file.data.ruleParameters))),
    roles,
  };

  for (const file of graphFiles) {
    checkGraph(file.path, file.data, fail);
  }
  for (const file of physicsFiles) {
    checkRodModels(file.path, file.data, refs, fail);
  }
  for (const file of caseFiles) {
    checkCase(file.path, file.data, refs, fail);
  }
  for (const file of ruleFiles) {
    checkRules(file.path, file.data, refs, fail);
  }
}

// Centerline end points must equal their node positions; this only absorbs floating-point noise.
const POINT_TOLERANCE_MM = 1e-9;

function samePoint(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => Math.abs(value - (b[i] ?? Number.NaN)) <= POINT_TOLERANCE_MM);
}

function checkGraph(file: string, graph: AnatomyGraphFile, fail: Fail): void {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  graph.segments.forEach((segment, i) => {
    const base = `segments[${i}]`;
    const from = nodes.get(segment.from);
    const to = nodes.get(segment.to);
    if (from === undefined) {
      fail('graph', at(file, `${base}.from`), `segment ${segment.id} starts at unknown node "${segment.from}"`);
    }
    if (to === undefined) {
      fail('graph', at(file, `${base}.to`), `segment ${segment.id} ends at unknown node "${segment.to}"`);
    }
    const { centerline, radii } = segment;
    if (centerline.length < 2) {
      fail('graph', at(file, `${base}.centerline`), `segment ${segment.id} needs at least two centerline points`);
    }
    if (radii.length !== centerline.length) {
      fail(
        'graph',
        at(file, `${base}.radii`),
        `segment ${segment.id} has ${radii.length} radii for ${centerline.length} centerline points`,
      );
    }
    radii.forEach((radius, k) => {
      if (!(radius > 0)) {
        fail('graph', at(file, `${base}.radii[${k}]`), `segment ${segment.id} has a radius of ${radius}`);
      }
    });
    const first = centerline[0];
    const last = centerline[centerline.length - 1];
    if (from !== undefined && first !== undefined && !samePoint(first, from.position)) {
      fail('graph', at(file, `${base}.centerline[0]`), `segment ${segment.id} does not start at node ${from.id}`);
    }
    if (to !== undefined && last !== undefined && centerline.length >= 2 && !samePoint(last, to.position)) {
      fail(
        'graph',
        at(file, `${base}.centerline[${centerline.length - 1}]`),
        `segment ${segment.id} does not end at node ${to.id}`,
      );
    }
  });
  graph.access.forEach((access, i) => {
    if (!nodes.has(access.node)) {
      fail('graph', at(file, `access[${i}].node`), `access ${access.id} is at unknown node "${access.node}"`);
    }
    if (access.direction.every((component) => component === 0)) {
      fail('graph', at(file, `access[${i}].direction`), `access ${access.id} has a zero direction`);
    }
  });
  (graph.outlets ?? []).forEach((outlet, i) => {
    if (!nodes.has(outlet.node)) {
      fail('graph', at(file, `outlets[${i}].node`), `outlet is at unknown node "${outlet.node}"`);
    }
  });
}

function checkRodModels(file: string, physics: PhysicsTuning, refs: References, fail: Fail): void {
  physics.rodModels.forEach((model, i) => {
    const base = `rodModels[${i}]`;
    const item = refs.devices.get(model.deviceId);
    if (item === undefined) {
      fail('bad-reference', at(file, `${base}.deviceId`), `names device "${model.deviceId}", which no device file defines`);
    }
    if (!refs.bulkIds.has(model.materialId)) {
      fail(
        'bad-reference',
        at(file, `${base}.materialId`),
        `names material "${model.materialId}", which physics/materials.json does not define`,
      );
    }
    for (const key of ['frictionId', 'lumenFrictionId'] as const) {
      const id = model[key];
      if (id !== undefined && !refs.frictionIds.has(id)) {
        fail(
          'bad-reference',
          at(file, `${base}.${key}`),
          `names friction "${id}", which physics/materials.json does not define`,
        );
      }
    }
    if (item === undefined) {
      return;
    }
    if (model.sections.some((section) => section.youngsModulusRatio !== undefined)) {
      const path = model.bodyYoungsModulusFrom;
      if (path === undefined) {
        fail('bad-reference', at(file, base), 'uses youngsModulusRatio but has no bodyYoungsModulusFrom');
      } else {
        const fact = getPath(item, path);
        if (!isRecord(fact) || typeof fact.value !== 'number') {
          fail('bad-reference', at(file, `${base}.bodyYoungsModulusFrom`), `"${path}" is not a numeric fact of ${item.id}`);
        }
      }
    }
    for (const [key, selection] of Object.entries(model.variant)) {
      checkSelection(item, key, selection, at(file, `${base}.variant.${key}`), fail);
    }
  });
}

/** A selection must be one of the item's options or inside its range, in the same unit (spec 02 §4.4). */
function checkSelection(item: DeviceItem, key: string, selection: Selection, where: string, fail: Fail): void {
  const property = findItemProperty(item, key);
  if (property === undefined) {
    if (!(isRecord(selection) && 'confidence' in selection)) {
      fail(
        'selection-mismatch',
        where,
        `${item.id} has no "${key}", so the selection must be a full fact with its own confidence (spec 02 §4.4)`,
      );
    }
    return;
  }

  const chosen = selectionValue(selection);
  const { fact } = property;
  const unit = typeof fact.unit === 'string' ? fact.unit : undefined;
  const label = `${item.id} ${property.path}`;
  if (typeof chosen.value === 'number' && chosen.unit !== unit) {
    fail(
      'selection-mismatch',
      where,
      `selects ${chosen.value} ${chosen.unit ?? '(no unit)'}, but ${label} is in ${unit ?? 'no unit'}`,
    );
    return;
  }
  if (Array.isArray(fact.options)) {
    if (!(fact.options as unknown[]).includes(chosen.value)) {
      fail('selection-mismatch', where, `${String(chosen.value)} is not one of ${label} (${fact.options.join(', ')})`);
    }
    return;
  }
  const min = typeof fact.min === 'number' ? fact.min : undefined;
  const max = typeof fact.max === 'number' ? fact.max : undefined;
  if (min !== undefined || max !== undefined) {
    const outside =
      typeof chosen.value !== 'number' ||
      (min !== undefined && chosen.value < min) ||
      (max !== undefined && chosen.value > max);
    if (outside) {
      fail(
        'selection-mismatch',
        where,
        `${String(chosen.value)} is outside ${label} (${min ?? '…'} to ${max ?? '…'} ${unit ?? ''})`,
      );
    }
    return;
  }
  if (fact.value !== undefined && fact.value !== chosen.value) {
    fail(
      'selection-mismatch',
      where,
      `${String(chosen.value)} differs from ${label}, which is ${JSON.stringify(fact.value)}`,
    );
  }
}

function checkCase(file: string, data: CaseFile, refs: References, fail: Fail): void {
  const { anatomy, start } = data;
  anatomy.options.forEach((id, i) => {
    if (!refs.graphs.has(id)) {
      fail('bad-reference', at(file, `anatomy.options[${i}]`), `names anatomy graph "${id}", which does not exist`);
    }
  });
  if (!anatomy.options.includes(anatomy.default)) {
    fail('bad-reference', at(file, 'anatomy.default'), `"${anatomy.default}" is not one of the anatomy options`);
  }
  for (const id of anatomy.options) {
    const graph = refs.graphs.get(id);
    if (graph !== undefined && !graph.access.some((access) => access.id === start.at)) {
      fail('bad-reference', at(file, 'start.at'), `access "${start.at}" is missing from anatomy graph ${id}`);
    }
  }

  const sheath = refs.devices.get(start.sheath.device);
  if (sheath === undefined) {
    fail(
      'bad-reference',
      at(file, 'start.sheath.device'),
      `names device "${start.sheath.device}", which no device file defines`,
    );
  } else {
    const sheathKinds = refs.roles?.sheath ?? ['sheath'];
    if (!sheathKinds.includes(sheath.kind)) {
      fail('bad-reference', at(file, 'start.sheath.device'), `"${sheath.id}" is a ${sheath.kind}, not a sheath`);
    }
    const selections = Object.entries(start.sheath.select);
    for (const [key, selection] of selections) {
      checkSelection(sheath, key, selection, at(file, `start.sheath.select.${key}`), fail);
    }
    // The sheath choices offered in setup are sizes of the selected property, in its unit.
    const [firstKey, firstSelection] = selections[0] ?? [];
    if (firstKey !== undefined && firstSelection !== undefined) {
      const { unit } = selectionValue(firstSelection);
      (start.sheath.choices ?? []).forEach((choice, i) => {
        const selection: Selection = unit === undefined ? choice : { value: choice, unit };
        checkSelection(sheath, firstKey, selection, at(file, `start.sheath.choices[${i}]`), fail);
      });
    }
  }

  const checkRodModel = (id: string, path: string): void => {
    if (!refs.rodModelIds.has(id)) {
      fail('bad-reference', at(file, path), `names rod model "${id}", which data/tuning/physics.json does not define`);
    }
  };
  start.insertion.forEach((entry, i) => {
    checkRodModel(entry.rodModel, `start.insertion[${i}].rodModel`);
  });
  data.inventory.forEach((entry, i) => {
    checkRodModel(entry.rodModel, `inventory[${i}].rodModel`);
  });
  data.initialStack.forEach((id, i) => {
    checkRodModel(id, `initialStack[${i}]`);
  });
  data.autopilot.forEach((script, i) => {
    if (!refs.graphs.has(script.anatomy)) {
      fail(
        'bad-reference',
        at(file, `autopilot[${i}].anatomy`),
        `names anatomy graph "${script.anatomy}", which does not exist`,
      );
    }
  });
}

function checkPaths(check: Check): string[] {
  switch (check.type) {
    case 'lte':
    case 'lt':
      return [check.left, check.right];
    case 'all':
      return check.of.flatMap(checkPaths);
    case 'sum-lte':
      return [...check.terms, check.limit];
    case 'flag-required':
      return [check.flag, check.when.path];
    case 'device-specific':
      return [check.field];
    case 'state':
      return [];
  }
}

function checkRules(file: string, data: RulesFile, refs: References, fail: Fail): void {
  const roles = data.roles;
  // Paths start with a role, or with case. (the case file) or tuning. (ruleParameters), spec 02 §8.
  const prefixes = new Set([...Object.keys(roles), 'case', 'tuning']);
  data.rules.forEach((rule, i) => {
    const base = `rules[${i}]`;
    rule.pair?.forEach((role, k) => {
      if (!Object.hasOwn(roles, role)) {
        fail('bad-reference', at(file, `${base}.pair[${k}]`), `uses role "${role}", which the roles table does not define`);
      }
    });
    for (const path of checkPaths(rule.check)) {
      const [prefix = '', ...rest] = path.split('.');
      if (!prefixes.has(prefix)) {
        fail('bad-reference', at(file, `${base}.check`), `path "${path}" does not start with a known role`);
      } else if (prefix === 'tuning' && refs.ruleParameterKeys !== undefined && !refs.ruleParameterKeys.has(rest.join('.'))) {
        fail(
          'bad-reference',
          at(file, `${base}.check`),
          `path "${path}" names no ruleParameters entry in data/tuning/physics.json`,
        );
      }
    }
  });
}
