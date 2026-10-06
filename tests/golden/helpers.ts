import { buildRodInstance, type CatalogSource } from '../../src/data/catalog';
import type { BulkMaterial, DeviceItem, Friction, RodModel } from '../../src/data/schemas';
import { engineSettings, sheathLength, tierParams } from '../../src/data/simConfig';
import { loadAnatomyGraph } from '../../src/data/loaders';
import { projectOntoCenterline, type SimAnatomy, type SimAnatomySegment } from '../../src/sim/anatomy/graph';
import { NEUTRAL_AXES, type InputAxes, type InputFrame } from '../../src/sim/core/records';
import type { SimDeviceSpec } from '../../src/sim/devices/instance';
import { SimEngine, type SimConfig } from '../../src/sim/engine';
import { arcOfNode, centerlinePoint } from '../../src/sim/rod/coaxial';
import { repository } from '../helpers/repository';

/**
 * Golden scene conventions (prompts/M1-foundations.md §8): headless, high tier (2 mm segments, 1 kHz, 2 substeps),
 * fixture devices wire W and catheter K, free space, and the measurements every scene shares.
 */

export const MM = 1e-3;
export const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------------------------
// Fixtures: test data, built through the same catalog the app uses.

const designLength = (mm: number) => ({ value: mm, unit: 'mm' });

const fixtureItems: DeviceItem[] = [
  {
    id: 'gw-fixture-w',
    kind: 'guidewire',
    genericName: 'Golden-scene wire W',
    geometry: {
      diameter: { value: 0.035, unit: 'in', confidence: 'design' },
      length: { value: 400, unit: 'mm', confidence: 'design' },
    },
    mechanics: {
      bodyFlexuralModulus: { value: 9.5, unit: 'GPa', confidence: 'sourced', source: 'harrison2011' },
    },
  },
  {
    id: 'cath-fixture-k',
    kind: 'selective-catheter',
    genericName: 'Golden-scene catheter K',
    geometry: {
      outerDiameter: { value: 5, unit: 'Fr', confidence: 'design' },
      length: { value: 400, unit: 'mm', confidence: 'design' },
    },
  },
  {
    id: 'mc-fixture-m',
    kind: 'microcatheter',
    genericName: 'Golden-scene microcatheter M',
    geometry: {
      outerDiameter: { value: 2.4, unit: 'Fr', confidence: 'design' },
      length: { value: 600, unit: 'mm', confidence: 'design' },
    },
  },
  {
    id: 'gw-fixture-v',
    kind: 'guidewire',
    genericName: 'Golden-scene 0.014 in wire V',
    geometry: {
      diameter: { value: 0.014, unit: 'in', confidence: 'design' },
      length: { value: 800, unit: 'mm', confidence: 'design' },
    },
    mechanics: { bodyFlexuralModulus: { value: 40, unit: 'GPa', confidence: 'design' } },
  },
];

const fixtureRodModels: RodModel[] = [
  {
    id: 'rm-fixture-w',
    deviceId: 'gw-fixture-w',
    variant: {},
    materialId: 'mat-fixture-w',
    sections: [
      {
        name: 'body',
        fromTip: designLength(0),
        toTip: designLength(400),
        youngsModulusRatio: { value: 1, unit: '1', confidence: 'design' },
      },
    ],
    bodyYoungsModulusFrom: 'mechanics.bodyFlexuralModulus',
    restShape: [],
    frictionId: 'fr-fixture-wall',
    radiopacity: {
      tipBoost: { value: 1, unit: '1', confidence: 'design' },
      body: { value: 1, unit: '1', confidence: 'design' },
    },
  },
  {
    id: 'rm-fixture-k',
    deviceId: 'cath-fixture-k',
    variant: {},
    materialId: 'mat-fixture-k',
    innerDiameter: { value: 0.039, unit: 'in', confidence: 'design' },
    sections: [
      {
        name: 'body',
        fromTip: designLength(0),
        toTip: designLength(400),
        youngsModulus: { value: 1.0, unit: 'GPa', confidence: 'design' },
      },
    ],
    // Straight except a 60° bend toward d1 spread over the distal 15 mm.
    restShape: [
      {
        fromTip: designLength(0),
        toTip: designLength(15),
        bendAngle: { value: 60, unit: 'deg', confidence: 'design' },
        toward: 'd1',
      },
    ],
    frictionId: 'fr-fixture-wall',
    // Wire-in-catheter friction: the fr-device-in-device value (docs/M1-plan.md D15).
    lumenFrictionId: 'fr-fixture-lumen',
    radiopacity: {
      tipBoost: { value: 1, unit: '1', confidence: 'design' },
      body: { value: 1, unit: '1', confidence: 'design' },
    },
  },
  {
    id: 'rm-fixture-m',
    deviceId: 'mc-fixture-m',
    variant: {},
    materialId: 'mat-fixture-k',
    innerDiameter: { value: 0.021, unit: 'in', confidence: 'design' },
    sections: [
      {
        name: 'body',
        fromTip: designLength(0),
        toTip: designLength(600),
        youngsModulus: { value: 0.5, unit: 'GPa', confidence: 'design' },
      },
    ],
    restShape: [],
    frictionId: 'fr-fixture-wall',
    lumenFrictionId: 'fr-fixture-lumen',
    radiopacity: {
      tipBoost: { value: 1, unit: '1', confidence: 'design' },
      body: { value: 1, unit: '1', confidence: 'design' },
    },
  },
  {
    id: 'rm-fixture-v',
    deviceId: 'gw-fixture-v',
    variant: {},
    materialId: 'mat-fixture-v',
    sections: [
      {
        name: 'body',
        fromTip: designLength(0),
        toTip: designLength(800),
        youngsModulusRatio: { value: 1, unit: '1', confidence: 'design' },
      },
    ],
    bodyYoungsModulusFrom: 'mechanics.bodyFlexuralModulus',
    // A 45° tip toward d1 over the distal 3 mm.
    restShape: [
      {
        fromTip: designLength(0),
        toTip: designLength(3),
        bendAngle: { value: 45, unit: 'deg', confidence: 'design' },
        toward: 'd1',
      },
    ],
    frictionId: 'fr-fixture-wall',
    radiopacity: {
      tipBoost: { value: 1, unit: '1', confidence: 'design' },
      body: { value: 1, unit: '1', confidence: 'design' },
    },
  },
];

const fixtureFriction: Friction[] = [
  {
    id: 'fr-fixture-wall',
    pair: 'fixture wall',
    coefficient: { value: 0.2, unit: '1', confidence: 'design' },
  },
  {
    id: 'fr-fixture-lumen',
    pair: 'fixture lumen',
    coefficient: { value: 0.1, unit: '1', confidence: 'design' },
  },
];

const fixtureBulk: BulkMaterial[] = [
  {
    id: 'mat-fixture-w',
    name: 'Wire W steel',
    density: { value: 7900, unit: 'kg/m3', confidence: 'design' },
    poissonRatio: { value: 0.3, unit: '1', confidence: 'design' },
  },
  {
    id: 'mat-fixture-k',
    name: 'Catheter K polymer',
    density: { value: 1200, unit: 'kg/m3', confidence: 'design' },
    poissonRatio: { value: 0.4, unit: '1', confidence: 'design' },
  },
  {
    id: 'mat-fixture-v',
    name: 'Wire V nitinol',
    density: { value: 6450, unit: 'kg/m3', confidence: 'design' },
    poissonRatio: { value: 0.33, unit: '1', confidence: 'design' },
  },
];

const fixtureSource: CatalogSource = {
  devices: new Map(fixtureItems.map((item) => [item.id, item])),
  rodModels: new Map(fixtureRodModels.map((model) => [model.id, model])),
  friction: new Map(fixtureFriction.map((entry) => [entry.id, entry])),
  bulk: new Map(fixtureBulk.map((entry) => [entry.id, entry])),
};

export function highTier() {
  return tierParams(repository(), 'high');
}

/** Full-speed insertion (m/s) and rotation (rad/s) rates, from tuning/input; scene speeds are fractions of them. */
export function fullSpeed(): { readonly advance: number; readonly rotate: number } {
  const { speeds } = engineSettings(repository());
  return { advance: speeds.advanceSpeedMax, rotate: speeds.rotationSpeedMax };
}

/** Wire W's flexural modulus fact, for wireWithModulus. */
export const WIRE_W_MODULUS_FACT = fixtureItems[0]!.mechanics!.bodyFlexuralModulus! as {
  readonly confidence: string;
  readonly [key: string]: unknown;
};

/** Wire W: uniform straight rod, 0.035 in, 9.5 GPa, ν 0.3, 7900 kg/m³, 400 mm. */
export function wireW(): SimDeviceSpec {
  return buildRodInstance(fixtureSource, 'rm-fixture-w', highTier().segmentLength);
}

/**
 * Wire W with another device's flexural modulus fact, on a tier: test data for stiffness checks. The diameter and
 * material stay wire W's; the length is wire W's 400 mm unless given (with the 11 cm sheath, 400 mm reaches 290 mm
 * past the sheath tip).
 */
export function wireWithModulus(
  name: string,
  modulus: { readonly confidence: string; readonly [key: string]: unknown },
  tierId = 'high',
  lengthMm = 400,
): SimDeviceSpec {
  const base = fixtureItems[0]!;
  const baseModel = fixtureRodModels[0]!;
  const item: DeviceItem = {
    ...base,
    id: `gw-fixture-${name}`,
    geometry: { ...base.geometry, length: { value: lengthMm, unit: 'mm', confidence: 'design' } },
    mechanics: { bodyFlexuralModulus: modulus },
  };
  const model: RodModel = {
    ...baseModel,
    id: `rm-fixture-${name}`,
    deviceId: item.id,
    sections: baseModel.sections.map((section) => ({ ...section, toTip: designLength(lengthMm) })),
  };
  const source: CatalogSource = {
    ...fixtureSource,
    devices: new Map([...fixtureSource.devices, [item.id, item]]),
    rodModels: new Map([...fixtureSource.rodModels, [model.id, model]]),
  };
  return buildRodInstance(source, model.id, tierParams(repository(), tierId).segmentLength);
}

/** Catheter K: uniform tube, OD 5F, ID 0.039 in, 1.0 GPa, ν 0.4, 1200 kg/m³, 400 mm, 60° over the distal 15 mm. */
export function catheterK(): SimDeviceSpec {
  return buildRodInstance(fixtureSource, 'rm-fixture-k', highTier().segmentLength);
}

/** Catheter S: catheter K without its curve, for comparisons. */
export function catheterStraight(tierId = 'high'): SimDeviceSpec {
  const model: RodModel = { ...fixtureRodModels[1]!, id: 'rm-fixture-s', restShape: [] };
  const source: CatalogSource = {
    ...fixtureSource,
    rodModels: new Map([...fixtureSource.rodModels, [model.id, model]]),
  };
  return buildRodInstance(source, model.id, tierParams(repository(), tierId).segmentLength);
}

/** Catheter K on a tier. */
export function catheterKOn(tierId: string): SimDeviceSpec {
  return buildRodInstance(fixtureSource, 'rm-fixture-k', tierParams(repository(), tierId).segmentLength);
}

/** Microcatheter M: uniform straight tube, OD 2.4F, ID 0.021 in, 0.5 GPa, catheter K's polymer, 600 mm. */
export function microcatheterM(tierId = 'high'): SimDeviceSpec {
  return buildRodInstance(fixtureSource, 'rm-fixture-m', tierParams(repository(), tierId).segmentLength);
}

/** Wire V: 0.014 in, 40 GPa, nitinol density, 800 mm, 45° over the distal 3 mm. */
export function wireV(tierId = 'high'): SimDeviceSpec {
  return buildRodInstance(fixtureSource, 'rm-fixture-v', tierParams(repository(), tierId).segmentLength);
}

/** A repository rod model on the high tier. */
export function rodModel(id: string): SimDeviceSpec {
  return buildRodInstance(repository(), id, highTier().segmentLength);
}

/** Free space: no vessels, one access at the origin pointing +z; the sheath still holds each device. */
export function freeSpace(): SimAnatomy {
  return {
    id: 'free-space',
    nodes: [{ id: 'origin', kind: 'inlet', position: [0, 0, 0] }],
    segments: [],
    access: [{ id: 'inlet-sheath', node: 'origin', position: [0, 0, 0], direction: [0, 0, 1] }],
  };
}

export function phantom(id: string): SimAnatomy {
  return loadAnatomyGraph(repository(), id);
}

export const SHEATH = (): number => sheathLength(repository(), 'sandbox-phantoms');

export interface SceneDevice {
  readonly spec: SimDeviceSpec;
  /** Tip depth past the sheath tip, m. */
  readonly pastSheathTip: number;
  readonly rotation?: number;
}

/**
 * An engine loaded with a golden scene: the repository's solver settings (with any overrides), the high tier, the
 * given devices.
 */
export function sceneEngine(
  anatomy: SimAnatomy,
  devices: readonly SceneDevice[],
  friction?: number,
  tierId = 'high',
  physics: Partial<SimConfig['physics']> = {},
): SimEngine {
  const sheath = SHEATH();
  const settings = engineSettings(repository());
  const config: SimConfig = {
    seed: 1,
    tier: tierParams(repository(), tierId),
    devices: Object.fromEntries(devices.map((device) => [device.spec.rodModelId, device.spec])),
    stack: devices.map((device) => ({
      rodModelId: device.spec.rodModelId,
      inserted: sheath + device.pastSheathTip,
      rotation: device.rotation ?? 0,
    })),
    anatomy,
    accessId: 'inlet-sheath',
    sheathLength: sheath,
    ...settings,
    physics: { ...settings.physics, ...physics },
    frictionOverride: friction ?? null,
  };
  const engine = new SimEngine();
  engine.load(config);
  return engine;
}

/** A Cath-mode frame with the given stick axes (after curves, −1..1). */
export function cathFrame(step: number, axes: Partial<InputAxes> = {}): InputFrame {
  return {
    step,
    mode: 'cath',
    axes: { ...NEUTRAL_AXES, ...axes },
    triggers: { fluoro: 0, inject: 0 },
    buttons: [],
    source: 'replay',
  };
}

export function solverSettings() {
  const { solver } = repository().physics;
  return { settleEnergy: solver.settleKineticEnergy.value, settleSteps: solver.settleSteps.value };
}

/** Steps with a neutral frame until settled (KE below settleKineticEnergy for settleSteps steps). */
export function settle(engine: SimEngine, maxSteps: number, each?: () => void): number {
  const { settleEnergy, settleSteps } = solverSettings();
  let quiet = 0;
  for (let n = 0; n < maxSteps; n += 1) {
    engine.step(cathFrame(engine.currentStep));
    each?.();
    quiet = engine.kineticEnergy() < settleEnergy ? quiet + 1 : 0;
    if (quiet >= settleSteps) {
      return n + 1;
    }
  }
  throw new Error(`Did not settle within ${maxSteps} steps (kinetic energy ${engine.kineticEnergy()} J).`);
}

// ---------------------------------------------------------------------------------------------------------------
// Measurements (prompts/M1-foundations.md §8)

export function nodePosition(engine: SimEngine, device: number, node: number): [number, number, number] {
  const { rod } = engine.device(device);
  return [rod.x[3 * node] ?? 0, rod.x[3 * node + 1] ?? 0, rod.x[3 * node + 2] ?? 0];
}

export function tipPosition(engine: SimEngine, device: number): [number, number, number] {
  return nodePosition(engine, device, engine.device(device).rod.segmentCount);
}

/** Material axis (0 = d1, 1 = d2, 2 = d3) of a segment. */
export function segmentAxis(
  engine: SimEngine,
  device: number,
  segment: number,
  axis: number,
): [number, number, number] {
  const q = engine.device(device).rod.q;
  const x = q[4 * segment] ?? 0;
  const y = q[4 * segment + 1] ?? 0;
  const z = q[4 * segment + 2] ?? 0;
  const w = q[4 * segment + 3] ?? 1;
  if (axis === 0) {
    return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)];
  }
  if (axis === 1) {
    return [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)];
  }
  return [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
}

export function dot(a: readonly number[], b: readonly number[]): number {
  return (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
}

export function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [
    (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
    (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
    (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
  ];
}

/** Angle between two directions, radians. */
export function angleBetween(a: readonly number[], b: readonly number[]): number {
  const c = cross(a, b);
  return Math.atan2(Math.sqrt(dot(c, c)), dot(a, b));
}

/** Largest relative segment-length error of a device's free part. */
export function maxStretchError(engine: SimEngine, device: number): number {
  const view = engine.device(device);
  const { rod } = view;
  let worst = 0;
  for (let j = Math.max(0, view.firstOwned - 1); j < rod.segmentCount; j += 1) {
    const a = nodePosition(engine, device, j);
    const b = nodePosition(engine, device, j + 1);
    const length = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2);
    worst = Math.max(worst, Math.abs(length / rod.segmentLength - 1));
  }
  return worst;
}

/** Tracks the unwrapped rotation of a segment's d1 about its own tangent, relative to the start. */
export class RotationTracker {
  private previous: [number, number, number];
  total = 0;
  constructor(
    private readonly engine: SimEngine,
    private readonly device: number,
    private readonly segment: number,
  ) {
    this.previous = segmentAxis(engine, device, segment, 0);
  }

  update(): number {
    const d1 = segmentAxis(this.engine, this.device, this.segment, 0);
    const tangent = segmentAxis(this.engine, this.device, this.segment, 2);
    this.total += Math.atan2(dot(cross(this.previous, d1), tangent), dot(this.previous, d1));
    this.previous = d1;
    return this.total;
  }
}

/** Steps `count` steps with the same axes, calling `each` after every step. */
export function drive(engine: SimEngine, count: number, axes: Partial<InputAxes>, each?: () => void): void {
  for (let n = 0; n < count; n += 1) {
    engine.step(cathFrame(engine.currentStep, axes));
    each?.();
  }
}

/** The tip's arc coordinate along an anatomy segment's centerline, m: tip advance is its change. */
export function tipArc(engine: SimEngine, device: number, segment: SimAnatomySegment): number {
  const tip = tipPosition(engine, device);
  return projectOntoCenterline(segment, tip[0], tip[1], tip[2]).arc;
}

/**
 * Bend angle of a pre-shaped device: between the tangent of the segment just proximal to the curved region (the
 * segment before the first joint with a rest bend) and the most distal segment, radians.
 */
export function bendAngle(engine: SimEngine, device: number): number {
  const { rod } = engine.device(device);
  let reference = -1;
  for (let j = 0; j + 1 < rod.segmentCount && reference < 0; j += 1) {
    const chord = Math.hypot(
      rod.restChord[3 * j] ?? 0,
      rod.restChord[3 * j + 1] ?? 0,
      rod.restChord[3 * j + 2] ?? 0,
    );
    if (chord > 0) {
      reference = j;
    }
  }
  if (reference < 0) {
    throw new Error('The device has no curved region.');
  }
  return angleBetween(
    segmentAxis(engine, device, reference, 2),
    segmentAxis(engine, device, rod.segmentCount - 1, 2),
  );
}

/**
 * Largest distance of an inner device's nodes inside an outer device from the outer centerline, matched by insertion
 * coordinate (the inner node at arc u from the valve against the outer centerline point at u, while u < outer L), m.
 */
export function coaxialGap(engine: SimEngine, outer: number, inner: number): number {
  const outerView = engine.device(outer);
  const innerView = engine.device(inner);
  const point = new Float64Array(3);
  let worst = 0;
  for (let i = 0; i <= innerView.rod.segmentCount; i += 1) {
    const arc = arcOfNode(innerView.rod, innerView.inserted, i);
    if (arc < 0 || arc > outerView.inserted) {
      continue;
    }
    centerlinePoint(outerView.rod, outerView.inserted, arc, point, 0);
    const x = nodePosition(engine, inner, i);
    worst = Math.max(
      worst,
      Math.hypot(x[0] - (point[0] ?? 0), x[1] - (point[1] ?? 0), x[2] - (point[2] ?? 0)),
    );
  }
  return worst;
}
