import type { RodDeviceInstance } from './catalog';
import { isConfidence, isRecord, type Confidence } from './facts';
import { loadAnatomyGraph, loadCase, type Repository } from './loaders';
import type { ResolvedValue } from './resolved';
import { sheathInstance } from './sandboxChoices';
import { fromSI, isConvertibleUnit, siUnitOf, valueToSI } from './units';

/**
 * The device inspector's rows (prompts/M1-foundations.md §7; golden rule 2): every value the simulation uses for a
 * device, the sheath, the phantom and the solver, as written in /data and in SI, with its confidence, sources (title
 * and URL) and note. Values come back unformatted; the UI formats them.
 */

export type InspectorValue =
  | { readonly kind: 'number'; readonly value: number; readonly unit: string }
  | { readonly kind: 'range'; readonly min: number; readonly max: number; readonly unit: string }
  | {
      readonly kind: 'options';
      readonly options: readonly (number | string)[];
      readonly unit: string;
      readonly selected: number | string | null;
    }
  | { readonly kind: 'text'; readonly text: string };

export interface InspectorSource {
  readonly id: string;
  readonly title: string;
  readonly url: string | null;
}

export interface InspectorRow {
  readonly label: string;
  readonly clinical: InspectorValue;
  /** The value in SI, when it differs from the clinical value. */
  readonly si: InspectorValue | null;
  readonly confidence: Confidence;
  readonly sources: readonly InspectorSource[];
  readonly note: string | null;
}

export interface InspectorTab {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly rows: readonly InspectorRow[];
}

function sources(repository: Repository, ids: readonly string[]): InspectorSource[] {
  return ids.map((id) => {
    const source = repository.sources.get(id);
    return { id, title: source?.title ?? id, url: source?.url ?? null };
  });
}

/** A resolved catalog value: clinical as written, SI as the simulation uses it. */
export function resolvedRow(repository: Repository, value: ResolvedValue): InspectorRow {
  const same = value.clinical.unit === value.unit && value.clinical.value === value.value;
  return {
    label: value.label,
    clinical: { kind: 'number', value: value.clinical.value, unit: value.clinical.unit },
    si: same ? null : { kind: 'number', value: value.value, unit: value.unit },
    confidence: value.provenance.confidence,
    sources: sources(repository, value.provenance.sources),
    note: value.provenance.note ?? null,
  };
}

function siOf(value: InspectorValue): InspectorValue | null {
  switch (value.kind) {
    case 'number':
      return isConvertibleUnit(value.unit) && siUnitOf(value.unit) !== value.unit
        ? { kind: 'number', value: valueToSI(value.value, value.unit), unit: siUnitOf(value.unit) }
        : null;
    case 'range':
      return isConvertibleUnit(value.unit) && siUnitOf(value.unit) !== value.unit
        ? {
            kind: 'range',
            min: valueToSI(value.min, value.unit),
            max: valueToSI(value.max, value.unit),
            unit: siUnitOf(value.unit),
          }
        : null;
    default:
      return null;
  }
}

/** A fact as written in /data (value, range, options or text); tuning values without a confidence are design. */
export function factRow(
  repository: Repository,
  label: string,
  fact: unknown,
  selected: number | string | null = null,
): InspectorRow | null {
  if (!isRecord(fact)) {
    return null;
  }
  const unit = typeof fact.unit === 'string' ? fact.unit : '';
  let clinical: InspectorValue;
  if (typeof fact.value === 'number') {
    clinical = { kind: 'number', value: fact.value, unit };
  } else if (typeof fact.value === 'boolean') {
    clinical = { kind: 'text', text: fact.value ? 'yes' : 'no' };
  } else if (typeof fact.value === 'string') {
    clinical = { kind: 'text', text: fact.value };
  } else if (typeof fact.text === 'string') {
    clinical = { kind: 'text', text: fact.text };
  } else if (typeof fact.min === 'number' && typeof fact.max === 'number') {
    clinical = { kind: 'range', min: fact.min, max: fact.max, unit };
  } else if (Array.isArray(fact.options)) {
    clinical = {
      kind: 'options',
      options: fact.options.filter((o): o is number | string => typeof o === 'number' || typeof o === 'string'),
      unit,
      selected,
    };
  } else {
    return null;
  }
  const confidence: Confidence = isConfidence(fact.confidence) ? fact.confidence : 'design';
  return {
    label,
    clinical,
    si: siOf(clinical),
    confidence,
    sources: sources(repository, typeof fact.source === 'string' ? [fact.source] : []),
    note: typeof fact.note === 'string' ? fact.note : null,
  };
}

/** "maxStepsPerMessage" → "Max steps per message". */
export function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One row per fact in an object of facts, in file order. */
function factRows(repository: Repository, prefix: string, facts: unknown): InspectorRow[] {
  if (!isRecord(facts)) {
    return [];
  }
  const rows: InspectorRow[] = [];
  for (const [key, fact] of Object.entries(facts)) {
    const row = factRow(repository, `${prefix}${humanize(key)}`, fact);
    if (row !== null) {
      rows.push(row);
    }
  }
  return rows;
}

export function deviceTab(repository: Repository, instance: RodDeviceInstance, role: string): InspectorTab {
  const name = instance.brandName ?? instance.genericName ?? instance.rodModelId;
  const material: InspectorRow = {
    label: 'Material',
    clinical: { kind: 'text', text: instance.material.name },
    si: null,
    confidence: 'design',
    sources: [],
    note: instance.material.assumption ?? null,
  };
  return {
    id: instance.rodModelId,
    title: name,
    subtitle: `${role} · ${instance.genericName ?? instance.kind}`,
    rows: [material, ...instance.parameters.map((value) => resolvedRow(repository, value))],
  };
}

export function sheathTab(repository: Repository, caseId: string, french: number): InspectorTab {
  const instance = sheathInstance(repository, caseId, french);
  const geometry = isRecord(instance.item.geometry) ? instance.item.geometry : {};
  const rows = [
    factRow(repository, 'Inner diameter (selected)', geometry.innerDiameter, french),
    factRow(repository, 'Outer diameter over the labeled size', geometry.outerDiameterOverInner),
    factRow(repository, 'Length', geometry.length),
  ].filter((row): row is InspectorRow => row !== null);
  return {
    id: 'sheath',
    title: instance.item.genericName ?? instance.item.id,
    subtitle: `${french}F · fixed at the access`,
    rows,
  };
}

export function phantomTab(repository: Repository, anatomyId: string): InspectorTab {
  const file = repository.anatomyGraphs.get(anatomyId);
  const graph = loadAnatomyGraph(repository, anatomyId);
  const provenance = file?.provenance;
  const confidence: Confidence = isConfidence(provenance?.confidence) ? provenance.confidence : 'design';
  const rows: InspectorRow[] = [];
  if (typeof provenance?.text === 'string') {
    rows.push({
      label: 'Geometry',
      clinical: { kind: 'text', text: provenance.text },
      si: null,
      confidence,
      sources: [],
      note: null,
    });
  }
  for (const segment of graph.segments) {
    let length = 0;
    for (let i = 1; i < segment.centerline.length; i += 1) {
      const a = segment.centerline[i - 1] ?? [0, 0, 0];
      const b = segment.centerline[i] ?? [0, 0, 0];
      length += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    const minRadius = Math.min(...segment.radii);
    const maxRadius = Math.max(...segment.radii);
    // The graph is written in millimetres; SI is metres.
    const mm = (metres: number): number => fromSI(metres, 'mm');
    rows.push({
      label: `${segment.tags.name}: centerline length`,
      clinical: { kind: 'number', value: mm(length), unit: 'mm' },
      si: { kind: 'number', value: length, unit: 'm' },
      confidence,
      sources: [],
      note: 'Measured along the centerline points in the anatomy graph.',
    });
    const radius: InspectorValue =
      minRadius === maxRadius
        ? { kind: 'number', value: mm(maxRadius), unit: 'mm' }
        : { kind: 'range', min: mm(minRadius), max: mm(maxRadius), unit: 'mm' };
    rows.push({
      label: `${segment.tags.name}: lumen radius`,
      clinical: radius,
      si: siOf(radius),
      confidence,
      sources: [],
      note: null,
    });
  }
  return { id: 'phantom', title: file?.name ?? anatomyId, subtitle: 'Test phantom', rows };
}

export function solverTab(repository: Repository, tierId: string): InspectorTab {
  const tier = repository.physics.tiers.find((entry) => entry.id === tierId);
  const { gantry, table } = repository.imaging;
  const rows = [
    ...factRows(repository, `Tier ${tierId}: `, {
      stepRate: tier?.stepRate,
      substeps: tier?.substeps,
      segmentLength: tier?.segmentLength,
    }),
    ...factRows(repository, 'Solver: ', repository.physics.solver),
    ...factRows(repository, 'Feedback: ', repository.physics.feedback),
    ...factRows(repository, 'Controls: ', repository.input.devices),
    ...factRows(repository, 'Sticks: ', repository.input.sticks),
    ...factRows(repository, 'C-arm: ', gantry),
    ...factRows(repository, 'Table: ', table),
    ...factRows(repository, 'C-arm controls: ', repository.input.control),
    ...factRows(repository, 'C-arm start: ', repository.render.carm),
  ];
  return { id: 'solver', title: 'Solver and feedback', subtitle: `${tierId} tier`, rows };
}

/** Every tab: the stack's devices (outermost first), then the sheath, the phantom and the solver. */
export function inspectorTabs(
  repository: Repository,
  options: {
    readonly caseId: string;
    readonly devices: readonly RodDeviceInstance[];
    readonly sheathFrench: number;
    readonly anatomyId: string;
    readonly tierId: string;
  },
): InspectorTab[] {
  loadCase(repository, options.caseId);
  return [
    ...options.devices.map((instance) =>
      deviceTab(repository, instance, instance.innerDiameter === null ? 'Wire' : 'Catheter'),
    ),
    sheathTab(repository, options.caseId, options.sheathFrench),
    phantomTab(repository, options.anatomyId),
    solverTab(repository, options.tierId),
  ];
}
