import type { SimAnatomy } from '../sim/anatomy/graph';
import type { SimDeviceSpec } from '../sim/devices/instance';
import type { SimConfig, StackEntry, TierParams } from '../sim/engine';
import type { CarmParams } from '../sim/imaging/carm';
import { buildItemInstance, buildRodInstance, resolveItemPath } from './catalog';
import { loadAnatomyGraph, loadCase, type Repository } from './loaders';
import { valueToSI } from './units';

/**
 * Builds SimEngine configurations from /data: every value is converted to SI here, once (CLAUDE.md rule 5), so the
 * engine receives plain numbers.
 */

type Quantity = { readonly value: number; readonly unit: string };

function si(quantity: Quantity): number {
  return valueToSI(quantity.value, quantity.unit);
}

export function tierParams(repository: Repository, tierId: string): TierParams {
  const tier = repository.physics.tiers.find((entry) => entry.id === tierId);
  if (tier === undefined) {
    throw new Error(`No tier "${tierId}" in data/tuning/physics.json.`);
  }
  return {
    id: tier.id,
    stepRate: si(tier.stepRate),
    substeps: tier.substeps.value,
    segmentLength: si(tier.segmentLength),
    model: tier.model,
  };
}

/** Solver, feedback and speed settings in SI. */
export function engineSettings(repository: Repository): Pick<SimConfig, 'physics' | 'feedback' | 'speeds'> {
  const { solver, feedback } = repository.physics;
  const { devices } = repository.input;
  return {
    physics: {
      linearDamping: si(solver.linearDamping),
      angularDamping: si(solver.angularDamping),
      gravity: si(solver.gravity),
      lumenMargin: si(solver.lumenContactMargin),
      lumenGridCell: si(solver.lumenGridCell),
      contactActivation: si(solver.contactActivationDistance),
      contactPasses: solver.contactSolvePasses.value,
      rotationalInertiaScale: solver.rotationalInertiaScale.value,
      slipSpeed: si(solver.frictionSlipSpeed),
      slipSpin: si(solver.frictionSlipSpin),
      loadRelaxSteps: solver.loadRelaxSteps.value,
      symmetryBreak: si(solver.symmetryBreak),
      contactFallbackCompliance: si(solver.contactFallbackCompliance),
      railCapStiffness: si(repository.physics.rail.capStiffness),
    },
    feedback: {
      hubForceWarning: si(feedback.hubForceWarning),
      hubForceDanger: si(feedback.hubForceDanger),
      wallStressThreshold: si(feedback.wallStressThreshold),
      tipForceNodes: feedback.tipForceNodes.value,
    },
    speeds: {
      advanceSpeedMax: si(devices.advanceSpeedMax),
      rotationSpeedMax: si(devices.rotationSpeedMax),
    },
  };
}

/** The selected sheath's length, from the case's sheath device and selection. */
export function sheathLength(repository: Repository, caseId: string): number {
  const sandbox = loadCase(repository, caseId);
  const item = repository.devices.get(sandbox.sheath.deviceId);
  if (item === undefined) {
    throw new Error(`Case ${caseId}: no sheath device "${sandbox.sheath.deviceId}".`);
  }
  const length = resolveItemPath(buildItemInstance(item, sandbox.sheath.select), 'geometry.length');
  if (length.status !== 'resolved' || length.valueSI === undefined) {
    throw new Error(`Case ${caseId}: the sheath has no length.`);
  }
  return length.valueSI;
}

/** The order rule's id and learner message (order-catheter-over-wire). */
export function orderRule(repository: Repository): { readonly id: string; readonly message: string } {
  const rule = repository.rules.rules.find((entry) => entry.id === 'order-catheter-over-wire');
  if (rule === undefined) {
    throw new Error('data/rules/compatibility.json has no order-catheter-over-wire rule.');
  }
  return { id: rule.id, message: rule.failure.message };
}

/** C-arm and table limits, speeds and the starting pose, in SI. */
export function carmParams(repository: Repository): CarmParams {
  const { gantry, table } = repository.imaging;
  const control = repository.input.control;
  const defaults = repository.render.carm;
  const zoomFields = gantry.zoomFields.options
    .filter((option): option is number => typeof option === 'number')
    .map((option) => valueToSI(option, String(gantry.zoomFields.unit)));
  const defaultZoom = si(defaults.defaultZoomField);
  const range = (quantity: { readonly min: number; readonly max: number; readonly unit: string }) => ({
    min: valueToSI(quantity.min, quantity.unit),
    max: valueToSI(quantity.max, quantity.unit),
  });
  return {
    rotation: range(gantry.rotation),
    angulation: range(gantry.angulation),
    rotationSpeedMax: si(gantry.rotationSpeedMax),
    angulationSpeedMax: si(gantry.angulationSpeedMax),
    sourceToImageDistance: range(gantry.sourceToImageDistance),
    focalSpotToIsocenter: si(gantry.focalSpotToIsocenter),
    zoomFields,
    tableHeight: range(table.height),
    tableTravelLateral: si(table.lateralTravel),
    tableTravelLongitudinal: si(table.longitudinalTravel),
    detectorSpeed: si(control.detectorSpeed),
    tablePanSpeed: si(control.tablePanSpeed),
    tableHeightSpeed: si(control.tableHeightSpeed),
    collimationSpeed: si(control.collimationSpeed),
    collimation: { min: si(control.collimationMin), max: si(control.collimationMax) },
    savedViews: control.savedViews.value,
    defaultSourceToImageDistance: si(defaults.defaultSourceToImageDistance),
    // Both sides come from the same unit conversion, so the default matches its option exactly.
    defaultZoomIndex: Math.max(0, zoomFields.indexOf(defaultZoom)),
    defaultTableHeight: si(defaults.defaultTableHeight),
  };
}

/** Device instances for every rod model in /data, laid out for a tier. */
export function deviceInstances(repository: Repository, tierId: string): Record<string, SimDeviceSpec> {
  const { segmentLength } = tierParams(repository, tierId);
  const instances: Record<string, SimDeviceSpec> = {};
  for (const id of repository.rodModels.keys()) {
    instances[id] = buildRodInstance(repository, id, segmentLength);
  }
  return instances;
}

/** The phantom anatomies of a case, in SI, by id. */
export function caseAnatomies(repository: Repository, caseId: string): Record<string, SimAnatomy> {
  const sandbox = loadCase(repository, caseId);
  return Object.fromEntries(sandbox.anatomy.options.map((id) => [id, loadAnatomyGraph(repository, id)]));
}

export interface SandboxOptions {
  readonly caseId?: string;
  readonly tierId?: string;
  readonly anatomyId?: string;
  readonly seed?: number;
  readonly frictionOverride?: number | null;
  /** Start the innermost device's tip this far past the sheath tip (m), the others keeping their distance behind it. */
  readonly startDepth?: number;
  /** One of the case's stack options (sandbox setup's stack choice); the case's first when absent. */
  readonly stackId?: string;
  /**
   * A rod model from the case inventory for the innermost slot of the starting stack (sandbox setup's wire choice). It
   * starts where the case puts that slot's device: the same depth and hub rotation.
   */
  readonly innerDevice?: string;
}

/** The sandbox's engine configuration: the case's stack and start, every phantom and both rod tiers. */
export function sandboxConfig(repository: Repository, options: SandboxOptions = {}): SimConfig {
  const caseId = options.caseId ?? 'sandbox-phantoms';
  const sandbox = loadCase(repository, caseId);
  const tierId = options.tierId ?? 'high';
  const anatomies = caseAnatomies(repository, caseId);
  const anatomyId = options.anatomyId ?? sandbox.anatomy.default;
  const anatomy = anatomies[anatomyId];
  if (anatomy === undefined) {
    throw new Error(`Case ${caseId} has no anatomy "${anatomyId}".`);
  }
  const sheath = sheathLength(repository, caseId);
  const option =
    options.stackId === undefined
      ? sandbox.stackOptions[0]
      : sandbox.stackOptions.find((entry) => entry.id === options.stackId);
  if (option === undefined) {
    throw new Error(`Case ${caseId} has no stack option "${options.stackId ?? ''}".`);
  }
  const slots = option.stack;
  const starts = slots.map(
    (rodModelId) => sandbox.insertion.find((entry) => entry.rodModelId === rodModelId)?.tipBeyondAccess.value ?? 0,
  );
  const shift = options.startDepth === undefined ? 0 : options.startDepth - (starts.at(-1) ?? 0);
  const inner = options.innerDevice;
  if (inner !== undefined && (!sandbox.inventory.includes(inner) || !repository.rodModels.has(inner))) {
    throw new Error(`Case ${caseId}: "${inner}" is not a rod model in its inventory.`);
  }
  const last = slots.length - 1;
  const stack: StackEntry[] = slots.map((slotId, i) => {
    const start = sandbox.insertion.find((entry) => entry.rodModelId === slotId);
    return {
      rodModelId: i === last && inner !== undefined ? inner : slotId,
      inserted: sheath + (starts[i] ?? 0) + shift,
      rotation: start?.hubRotation.value ?? 0,
    };
  });
  // Every tier, the rail fallback included: Settings can force any of them (spec 04 §6).
  const tierIds = repository.physics.tiers.map((tier) => tier.id);
  return {
    seed: options.seed ?? 1,
    tier: tierParams(repository, tierId),
    devices: deviceInstances(repository, tierId),
    stack,
    anatomy,
    accessId: sandbox.accessId,
    sheathLength: sheath,
    ...engineSettings(repository),
    frictionOverride: options.frictionOverride ?? null,
    orderRule: orderRule(repository),
    carm: carmParams(repository),
    anatomies,
    tiers: Object.fromEntries(
      tierIds.map((id) => [id, { tier: tierParams(repository, id), devices: deviceInstances(repository, id) }]),
    ),
  };
}
