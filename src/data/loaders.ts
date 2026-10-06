import type { CatalogSource } from './catalog';
import type { Selection } from './facts';
import { resolveNumber, type ResolvedValue } from './resolved';
import type {
  AnatomyGraphFile,
  BulkMaterial,
  CaseFile,
  DeviceItem,
  DevicesFile,
  Friction,
  ImagingFile,
  InputTuning,
  MaterialsFile,
  PhysicsTuning,
  RenderTuning,
  RodModel,
  RulesFile,
  SchemaId,
  Source,
  SourcesFile,
  TuningFile,
} from './schemas';
import { valueToSI } from './units';
import { validateData, type DataFile, type ValidationError, type ValidationResult } from './validate';

/**
 * Loads /data for the app, the worker, scripts and tests. Every load validates first (spec 02 §1.5), so code only
 * ever reads data that passed spec 02 §14.
 */

export class DataLoadError extends Error {
  override name = 'DataLoadError';
  constructor(
    message: string,
    readonly errors: readonly ValidationError[] = [],
  ) {
    super(message);
  }
}

export interface Repository extends CatalogSource {
  readonly validation: ValidationResult;
  readonly sources: ReadonlyMap<string, Source>;
  readonly accessed: string;
  readonly devices: ReadonlyMap<string, DeviceItem>;
  readonly rules: RulesFile;
  readonly friction: ReadonlyMap<string, Friction>;
  readonly bulk: ReadonlyMap<string, BulkMaterial>;
  readonly anatomyGraphs: ReadonlyMap<string, AnatomyGraphFile>;
  readonly physics: PhysicsTuning;
  readonly input: InputTuning;
  readonly render: RenderTuning;
  readonly rodModels: ReadonlyMap<string, RodModel>;
  readonly imaging: ImagingFile;
  readonly cases: ReadonlyMap<string, CaseFile>;
}

export function loadRepository(files: readonly DataFile[]): Repository {
  const validation = validateData(files);
  if (validation.errors.length > 0) {
    const shown = validation.errors
      .slice(0, 5)
      .map((error) => `[${error.code}] ${error.path}: ${error.message}`)
      .join('\n');
    throw new DataLoadError(
      `/data has ${validation.errors.length} validation errors (run npm run validate-data):\n${shown}`,
      validation.errors,
    );
  }

  const all = <T>(schemaId: SchemaId): T[] =>
    validation.files.filter((file) => file.schemaId === schemaId).map((file) => file.json as T);
  const one = <T>(items: readonly T[], what: string): T => {
    const [first] = items;
    if (items.length !== 1 || first === undefined) {
      throw new DataLoadError(`Expected exactly one ${what} in /data, found ${items.length}.`);
    }
    return first;
  };

  const sourcesFile = one(all<SourcesFile>('ir-sim/sources@1'), 'source registry');
  const materials = one(all<MaterialsFile>('ir-sim/materials@1'), 'materials file');
  const tuning = all<TuningFile>('ir-sim/tuning@1');
  const physics = one(
    tuning.filter((file): file is PhysicsTuning => file.category === 'physics'),
    'physics tuning file',
  );

  return {
    validation,
    sources: new Map(sourcesFile.sources.map((source) => [source.id, source])),
    accessed: sourcesFile.accessed,
    devices: new Map(all<DevicesFile>('ir-sim/devices@1').flatMap((file) => file.items.map((item) => [item.id, item]))),
    rules: one(all<RulesFile>('ir-sim/rules@1'), 'rules file'),
    friction: new Map(materials.friction.map((entry) => [entry.id, entry])),
    bulk: new Map(materials.bulk.map((entry) => [entry.id, entry])),
    anatomyGraphs: new Map(all<AnatomyGraphFile>('ir-sim/anatomy-graph@1').map((graph) => [graph.id, graph])),
    physics,
    input: one(
      tuning.filter((file): file is InputTuning => file.category === 'input'),
      'input tuning file',
    ),
    render: one(
      tuning.filter((file): file is RenderTuning => file.category === 'render'),
      'render tuning file',
    ),
    rodModels: new Map(physics.rodModels.map((model) => [model.id, model])),
    imaging: one(all<ImagingFile>('ir-sim/imaging@1'), 'imaging file'),
    cases: new Map(all<CaseFile>('ir-sim/case@0').map((entry) => [entry.id, entry])),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Anatomy graphs in SI

export type Vec3 = readonly [number, number, number];

/** An anatomy graph converted to metres, still in the LPS patient frame (x left, y posterior, z superior). */
export interface AnatomyGraphSI {
  readonly id: string;
  readonly name: string;
  readonly nodes: readonly { readonly id: string; readonly kind: string; readonly position: Vec3 }[];
  readonly segments: readonly {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly centerline: readonly Vec3[];
    /** Lumen radius at each centerline point. */
    readonly radii: readonly number[];
    readonly tags: { readonly name: string; readonly territory: string; readonly variant?: string };
  }[];
  readonly access: readonly {
    readonly id: string;
    readonly node: string;
    readonly position: Vec3;
    /** Unit vector pointing into the vessel. */
    readonly direction: Vec3;
  }[];
  readonly landmarks: readonly { readonly id: string; readonly kind: string; readonly position: Vec3 }[];
}

export function loadAnatomyGraph(repository: Repository, id: string): AnatomyGraphSI {
  const graph = repository.anatomyGraphs.get(id);
  if (graph === undefined) {
    throw new DataLoadError(`No anatomy graph "${id}" in /data.`);
  }
  const length = (value: number): number => valueToSI(value, graph.units);
  const point = (p: readonly [number, number, number]): Vec3 => [length(p[0]), length(p[1]), length(p[2])];
  const positions = new Map(graph.nodes.map((node) => [node.id, point(node.position)]));

  return {
    id: graph.id,
    name: graph.name,
    nodes: graph.nodes.map((node) => ({ id: node.id, kind: node.kind, position: point(node.position) })),
    segments: graph.segments.map((segment) => ({
      id: segment.id,
      from: segment.from,
      to: segment.to,
      centerline: segment.centerline.map(point),
      radii: segment.radii.map(length),
      tags: {
        name: segment.tags.name,
        territory: segment.tags.territory,
        ...(segment.tags.variant === undefined ? {} : { variant: segment.tags.variant }),
      },
    })),
    access: graph.access.map((access) => {
      const [x, y, z] = access.direction;
      const norm = Math.sqrt(x * x + y * y + z * z);
      const position = positions.get(access.node);
      if (position === undefined) {
        throw new DataLoadError(`Anatomy graph ${id}: access ${access.id} is at unknown node ${access.node}.`);
      }
      return { id: access.id, node: access.node, position, direction: [x / norm, y / norm, z / norm] as Vec3 };
    }),
    landmarks: graph.landmarks.map((landmark) => ({
      id: landmark.id,
      kind: landmark.kind,
      position: point(landmark.position),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Cases in SI

export interface CaseSI {
  readonly id: string;
  readonly title: string;
  readonly modes: readonly string[];
  readonly summary: string;
  readonly anatomy: { readonly options: readonly string[]; readonly default: string };
  readonly sheath: {
    readonly deviceId: string;
    readonly select: Readonly<Record<string, Selection>>;
    /** Sizes offered in sandbox setup, in the unit of the selection. */
    readonly choices: readonly number[];
  };
  /** The access id in the anatomy graph where the sheath sits. */
  readonly accessId: string;
  readonly insertion: readonly {
    readonly rodModelId: string;
    /** Initial tip depth past the sheath tip, metres. */
    readonly tipBeyondAccess: ResolvedValue;
    /** Initial hub angle, radians. */
    readonly hubRotation: ResolvedValue;
  }[];
  readonly inventory: readonly string[];
  /** Movable devices, outermost first. */
  readonly initialStack: readonly string[];
  /** The starting stacks setup offers, the default first; one built from initialStack when the case lists none. */
  readonly stackOptions: readonly { readonly id: string; readonly label: string; readonly stack: readonly string[] }[];
  readonly targetDistance: ResolvedValue | null;
  readonly autopilot: readonly {
    readonly id: string;
    readonly anatomy: string;
    readonly description: string;
    readonly params: Readonly<Record<string, ResolvedValue>>;
  }[];
}

export function loadCase(repository: Repository, id: string): CaseSI {
  const data = repository.cases.get(id);
  if (data === undefined) {
    throw new DataLoadError(`No case "${id}" in /data.`);
  }
  const where = `case ${id}`;
  return {
    id: data.id,
    title: data.title,
    modes: data.modes,
    summary: data.summary,
    anatomy: { options: data.anatomy.options, default: data.anatomy.default },
    sheath: {
      deviceId: data.start.sheath.device,
      select: data.start.sheath.select,
      choices: data.start.sheath.choices ?? [],
    },
    accessId: data.start.at,
    insertion: data.start.insertion.map((entry, i) => ({
      rodModelId: entry.rodModel,
      tipBeyondAccess: resolveNumber('Tip beyond the sheath tip', entry.tipBeyondAccess, {
        where: `${where}: start.insertion[${i}].tipBeyondAccess`,
      }),
      hubRotation: resolveNumber('Hub rotation', entry.hubRotation, {
        where: `${where}: start.insertion[${i}].hubRotation`,
      }),
    })),
    inventory: data.inventory.map((entry) => entry.rodModel),
    initialStack: data.initialStack,
    stackOptions: data.stackOptions ?? [{ id: 'default', label: 'Default stack', stack: data.initialStack }],
    targetDistance:
      data.targetDistance === undefined
        ? null
        : resolveNumber('Target distance', data.targetDistance, { where: `${where}: targetDistance` }),
    autopilot: data.autopilot.map((script) => ({
      id: script.id,
      anatomy: script.anatomy,
      description: script.description,
      params: Object.fromEntries(
        Object.entries(script.params).map(([key, param]) => [
          key,
          resolveNumber(key, param, { where: `${where}: autopilot ${script.id} params.${key}` }),
        ]),
      ),
    })),
  };
}
