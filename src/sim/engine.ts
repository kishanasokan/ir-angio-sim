import type { SimAnatomy } from './anatomy/graph';
import { buildLumen, createLumenHit, queryLumen, type Lumen, type LumenHit } from './anatomy/lumen';
import type { AutopilotView, Vec3 } from './autopilot/types';
import type { SimEvent } from './core/events';
import { createHasher, hashHex, hashNumber, hashTypedArray } from './core/hash';
import { NEUTRAL_AXES, type Command, type InputFrame } from './core/records';
import { createRng, type Rng } from './core/rng';
import { QUAT, VEC3, X, Y, Z } from './core/types';
import type { SimDeviceSpec } from './devices/instance';
import { createStack, deviceInputs, moveActivePair, toggleLock, type StackState } from './devices/stack';
import {
  changeZoom,
  cycleZoom,
  initialCarm,
  saveView,
  stepCarm,
  type CarmParams,
  type CarmState,
} from './imaging/carm';
import { quatAxis } from './math/quat';
import { buildRod, rodKineticEnergy } from './rod/build';
import { slidingFriction } from './rod/friction';
import { createAccessFrame, placeKinematic, placeStraight, type AccessFrame } from './rod/insertion';
import {
  createPhysicsDevice,
  createPhysicsWorld,
  physicsSubstep,
  placeKinematicParts,
  type PhysicsDevice,
  type PhysicsWorld,
} from './rod/substep';
import { wireLeadsCatheter } from './rules/predicates';
import { packDevice, type Snapshot } from './snapshot';

/**
 * SimEngine (prompts/M1-foundations.md §2): load, step, command, snapshot and hash, plus the test-only
 * applyExternalForce. Pure and deterministic (CLAUDE.md rule 4): it reads only the plain data passed to load and
 * the input frames and commands it is given, and time is the fixed step counter.
 */

export interface TierParams {
  readonly id: string;
  /** Hz. */
  readonly stepRate: number;
  readonly substeps: number;
  /** m. */
  readonly segmentLength: number;
}

export interface StackEntry {
  readonly rodModelId: string;
  /** Starting insertion depth L: length distal to the sheath valve, m. */
  readonly inserted: number;
  /** Starting hub rotation φ, rad. */
  readonly rotation: number;
}

export interface SimConfig {
  readonly seed: number;
  readonly tier: TierParams;
  /** Device instances for this tier by rod model id; the stack and swaps draw from them. */
  readonly devices: Readonly<Record<string, SimDeviceSpec>>;
  /** Movable devices, outermost first. */
  readonly stack: readonly StackEntry[];
  /** The anatomy; free space is an anatomy without segments. */
  readonly anatomy: SimAnatomy;
  readonly accessId: string;
  /** m. */
  readonly sheathLength: number;
  readonly physics: {
    readonly linearDamping: number;
    readonly angularDamping: number;
    readonly gravity: number;
    readonly lumenMargin: number;
    readonly lumenGridCell: number;
    readonly contactActivation: number;
    readonly contactPasses: number;
    /** Multiplies every segment's rotational inertia (build.ts). */
    readonly rotationalInertiaScale: number;
    readonly slipSpeed: number;
    readonly slipSpin: number;
    /** Steps the devices relax into their rest shapes at load, before step 0. */
    readonly loadRelaxSteps: number;
    /** Degenerate-contact fallback (spec 04 §3.2): contact-normal tilt, rad, and contact compliance, m/N. */
    readonly symmetryBreak: number;
    readonly contactFallbackCompliance: number;
  };
  readonly feedback: {
    readonly hubForceWarning: number;
    readonly hubForceDanger: number;
    readonly wallStressThreshold: number;
    readonly tipForceNodes: number;
  };
  /** Full-stick speeds: m/s and rad/s. */
  readonly speeds: { readonly advanceSpeedMax: number; readonly rotationSpeedMax: number };
  /** Tests only: replaces every wall and lumen friction coefficient. */
  readonly frictionOverride?: number | null;
  /** The order rule (rules/compatibility → order-catheter-over-wire), for blocked-action events. */
  readonly orderRule?: { readonly id: string; readonly message: string };
  readonly carm?: CarmParams;
  /** Anatomies set-anatomy can switch to, by id. */
  readonly anatomies?: Readonly<Record<string, SimAnatomy>>;
  /** Tiers set-tier can switch to, with their device instances. */
  readonly tiers?: Readonly<
    Record<string, { readonly tier: TierParams; readonly devices: Readonly<Record<string, SimDeviceSpec>> }>
  >;
}

interface DeviceRecord {
  physics: PhysicsDevice;
  readonly spec: SimDeviceSpec;
  /** The most proximal joint of a pre-shaped tip (−1 for a straight device) and the unit direction, in that joint's
   * proximal (d1, d2) frame, that the tip bends toward. */
  readonly bendJoint: number;
  readonly bendD1: number;
  readonly bendD2: number;
  hubForce: number;
  /** The device-in-device friction part of hubForce (spec 04 §2.3), N. */
  frictionForce: number;
  tipForce: number;
  wallStress: number;
  tipSegment: number;
  hubWarning: boolean;
  hubDanger: boolean;
}

interface SwapState {
  phase: 'withdraw' | 'feed';
  readonly target: string;
  feedTo: number;
}

export interface DeviceView {
  readonly rodModelId: string;
  readonly rod: PhysicsDevice['rod'];
  readonly inserted: number;
  readonly rotation: number;
  /** Axial force at the hub, N: positive while the hand pushes against resistance. */
  readonly hubForce: number;
  /** The part of hubForce from friction against the devices around and inside it (spec 04 §2.3), N. */
  readonly frictionForce: number;
  readonly tipForce: number;
  readonly wallStress: number;
  /** Index of the anatomy segment holding the tip, or −1 (inside the sheath, or free space). */
  readonly tipSegment: number;
  readonly tipSegmentId: string | null;
  readonly firstOwned: number;
  readonly firstDynamic: number;
}

export class SimEngine {
  private config: SimConfig | null = null;
  private tier: TierParams | null = null;
  private specs: Readonly<Record<string, SimDeviceSpec>> = {};
  private anatomy: SimAnatomy | null = null;
  private lumen: Lumen | null = null;
  private frame: AccessFrame | null = null;
  private world: PhysicsWorld | null = null;
  private records: DeviceRecord[] = [];
  private stack: StackState = createStack(0);
  private carm: CarmState | null = null;
  private stepCount = 0;
  private queue: Command[] = [];
  private events: SimEvent[] = [];
  private rng: Rng = createRng(0);
  private autopilot: string | null = null;
  private fluoroTime = 0;
  /** The input the last step ran with, for the snapshot; plain fields keep the step allocation-free. */
  private lastMode: InputFrame['mode'] = 'cath';
  private lastFluoro = 0;
  private lastInject = 0;
  private fluoroLastStep = -1;
  private swap: SwapState | null = null;
  private blocked = false;
  private readonly hit: LumenHit = createLumenHit();
  private readonly frictionScratch = new Float64Array(2 * VEC3);

  load(config: SimConfig): void {
    this.config = config;
    this.tier = config.tier;
    this.specs = config.devices;
    this.rng = createRng(config.seed);
    this.stepCount = 0;
    this.queue = [];
    this.events = [];
    this.autopilot = null;
    this.setAnatomy(config.anatomy);
  }

  /** The step the next call to step() simulates. */
  get currentStep(): number {
    return this.stepCount;
  }

  /** The anatomy in use (free space has no segments). */
  get currentAnatomy(): SimAnatomy {
    if (this.anatomy === null) {
      throw new Error('SimEngine: call load(config) first.');
    }
    return this.anatomy;
  }

  get stepRate(): number {
    return this.requireTier().stepRate;
  }

  get deviceCount(): number {
    return this.records.length;
  }

  get autopilotScript(): string | null {
    return this.autopilot;
  }

  /** Substeps whose linear system was not positive definite; zero in a healthy run. */
  get solveFailures(): number {
    return this.world?.solveFailures ?? 0;
  }

  /** Substeps that the degenerate-contact fallback's tilted normals (spec 04 §3.2 step 1) let solve. */
  get contactFallbacks(): number {
    return this.world?.contactFallbacks ?? 0;
  }

  /** Substeps that also needed compliant contact rows (spec 04 §3.2 step 2). */
  get compliantFallbacks(): number {
    return this.world?.compliantFallbacks ?? 0;
  }

  /** Queues a step-stamped command; it applies at the start of its step (or the next step, if already past). */
  command(command: Command): void {
    this.queue.push(command);
  }

  /** Test only: a constant external force on a node, N, until replaced. */
  applyExternalForce(device: number, node: number, force: readonly [number, number, number]): void {
    const rod = this.requireRecord(device).physics.rod;
    const o = VEC3 * node;
    rod.force[o] = force[0];
    rod.force[o + Y] = force[1];
    rod.force[o + Z] = force[2];
  }

  /** Simulates one fixed step of 1 / stepRate with the given input frame. */
  step(frame: InputFrame): void {
    const config = this.requireConfig();
    const tier = this.requireTier();
    const world = this.requireWorld();
    const dt = 1 / tier.stepRate;
    this.applyDueCommands();

    // Buttons first, so a lock press or pair move applies to this step.
    for (const action of frame.buttons) {
      if (frame.mode === 'cath' && action === 'lock-pair') {
        this.stack = toggleLock(this.stack);
      } else if (frame.mode === 'cath' && action === 'pair-up') {
        this.stack = moveActivePair(this.stack, -1);
      } else if (frame.mode === 'cath' && action === 'pair-down') {
        this.stack = moveActivePair(this.stack, 1);
      } else if (this.carm !== null && config.carm !== undefined) {
        if (action === 'fov-cycle') {
          this.carm = cycleZoom(this.carm, config.carm);
        } else if (action === 'fov-wider') {
          this.carm = changeZoom(this.carm, config.carm, -1);
        } else if (action === 'fov-narrower') {
          this.carm = changeZoom(this.carm, config.carm, 1);
        } else if (action === 'save-angle') {
          this.carm = saveView(this.carm, config.carm);
        }
      }
    }

    // Device rates from the active pair; Control mode drives the C-arm instead.
    const inputs = deviceInputs(this.stack, frame.mode === 'cath' ? frame.axes : NEUTRAL_AXES);
    this.records.forEach((record, d) => {
      record.physics.insertRate = (inputs.push[d] ?? 0) * config.speeds.advanceSpeedMax;
      record.physics.rotateRate = (inputs.rotate[d] ?? 0) * config.speeds.rotationSpeedMax;
    });
    this.applySwap(dt);
    this.applyOrderRule(dt);

    if (this.carm !== null && config.carm !== undefined) {
      const axes = frame.mode === 'control' ? frame.axes : NEUTRAL_AXES;
      this.carm = stepCarm(
        this.carm,
        config.carm,
        {
          rotate: axes.carmRotate,
          angulate: axes.carmAngulate,
          detector: axes.detector,
          panLateral: axes.tablePanX,
          panLongitudinal: axes.tablePanY,
          height: axes.tableHeight,
          collimation: axes.collimation,
        },
        dt,
      );
    }
    if (frame.triggers.fluoro > 0) {
      this.fluoroTime += dt;
      this.fluoroLastStep = this.stepCount;
    }
    this.lastMode = frame.mode;
    this.lastFluoro = frame.triggers.fluoro;
    this.lastInject = frame.triggers.inject;

    const h = dt / tier.substeps;
    for (let s = 0; s < tier.substeps; s += 1) {
      physicsSubstep(world, h, (s + 1) * h);
    }
    placeKinematicParts(world);
    this.finishStep(dt);
  }

  /** Kinetic energy of every free node and segment, J: the settle test of the golden scenes. */
  kineticEnergy(): number {
    return this.records.reduce(
      (sum, record) => sum + rodKineticEnergy(record.physics.rod, record.physics.firstOwned),
      0,
    );
  }

  device(index: number): DeviceView {
    const record = this.requireRecord(index);
    const physics = record.physics;
    return {
      rodModelId: physics.rod.rodModelId,
      rod: physics.rod,
      inserted: physics.inserted,
      rotation: physics.rotation,
      hubForce: record.hubForce,
      frictionForce: record.frictionForce,
      tipForce: record.tipForce,
      wallStress: record.wallStress,
      tipSegment: record.tipSegment,
      tipSegmentId: record.tipSegment >= 0 ? (this.lumen?.segmentIds[record.tipSegment] ?? null) : null,
      firstOwned: physics.firstOwned,
      firstDynamic: physics.firstDynamic,
    };
  }

  /** Events since the last call. */
  drainEvents(): SimEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** Emitted by the session runner when an autopilot script finishes (Phase C). */
  /** Emits autopilot-done; the session runner then stops the demo with a logged stop-autopilot command. */
  notifyAutopilotDone(script: string): void {
    this.events.push({ type: 'autopilot-done', step: this.stepCount, script });
  }

  /** The read-only view autopilot scripts react to (docs/M1-plan.md D6). */
  autopilotView(): AutopilotView {
    const tier = this.requireTier();
    const frame = this.requireFrame();
    const axisOf = (q: Float64Array, segment: number, axis: number): Vec3 => {
      const out = new Float64Array(VEC3);
      quatAxis(q, QUAT * segment, axis, out, 0);
      return [out[X] ?? 0, out[Y] ?? 0, out[Z] ?? 0];
    };
    return {
      step: this.stepCount,
      stepRate: tier.stepRate,
      sheathLength: frame.sheathLength,
      anatomy: this.currentAnatomy,
      devices: this.records.map((record) => {
        const { rod } = record.physics;
        const tip = VEC3 * rod.segmentCount;
        const tipTangent = axisOf(rod.q, rod.segmentCount - 1, Z);
        let bendDirection: Vec3 | null = null;
        let bodyTangent = tipTangent;
        if (record.bendJoint >= 0) {
          const d1 = axisOf(rod.q, record.bendJoint, X);
          const d2 = axisOf(rod.q, record.bendJoint, Y);
          bendDirection = [
            record.bendD1 * d1[X] + record.bendD2 * d2[X],
            record.bendD1 * d1[Y] + record.bendD2 * d2[Y],
            record.bendD1 * d1[Z] + record.bendD2 * d2[Z],
          ];
          bodyTangent = axisOf(rod.q, record.bendJoint, Z);
        }
        return {
          rodModelId: rod.rodModelId,
          inserted: record.physics.inserted,
          rotation: record.physics.rotation,
          tip: [rod.x[tip] ?? 0, rod.x[tip + Y] ?? 0, rod.x[tip + Z] ?? 0],
          tipVelocity: [rod.v[tip] ?? 0, rod.v[tip + Y] ?? 0, rod.v[tip + Z] ?? 0],
          tipTangent,
          bendDirection,
          bodyTangent,
          tipSegmentId: record.tipSegment >= 0 ? (this.lumen?.segmentIds[record.tipSegment] ?? null) : null,
          hubForce: record.hubForce,
        };
      }),
    };
  }

  snapshot(): Snapshot {
    const tier = this.requireTier();
    const frame = this.requireFrame();
    return {
      step: this.stepCount,
      timeS: this.stepCount / tier.stepRate,
      anatomyId: this.currentAnatomy.id,
      devices: this.records.map((record) => {
        const segment = record.tipSegment;
        return packDevice({
          rod: record.physics.rod,
          inserted: record.physics.inserted,
          rotation: record.physics.rotation,
          sheathLength: frame.sheathLength,
          tipSegment: segment >= 0 ? (this.lumen?.segmentIds[segment] ?? null) : null,
          tipSegmentName: segment >= 0 ? (this.lumen?.segmentNames[segment] ?? null) : null,
          tipNormalForce: record.tipForce,
          hubForce: record.hubForce,
          wallStress: record.wallStress,
        });
      }),
      stack: { activeOuter: this.stack.activeOuter, locked: this.stack.locked },
      carm: this.carm,
      fluoroTimeS: this.fluoroTime,
      fluoroLastStep: this.fluoroLastStep,
      input: { mode: this.lastMode, fluoro: this.lastFluoro, inject: this.lastInject },
      autopilot: this.autopilot,
      events: [...this.events],
    };
  }

  /** FNV-1a over positions, orientations, velocities and the key scalars (spec 01 §4.6). */
  hash(): string {
    const hasher = createHasher();
    hashNumber(hasher, this.stepCount);
    for (const record of this.records) {
      const { rod } = record.physics;
      hashTypedArray(hasher, rod.x);
      hashTypedArray(hasher, rod.q);
      hashTypedArray(hasher, rod.v);
      hashTypedArray(hasher, rod.omega);
      hashNumber(hasher, record.physics.inserted);
      hashNumber(hasher, record.physics.rotation);
      hashNumber(hasher, record.wallStress);
    }
    hashNumber(hasher, this.stack.activeOuter);
    hashNumber(hasher, this.stack.locked ? 1 : 0);
    if (this.carm !== null) {
      hashNumber(hasher, this.carm.rotation);
      hashNumber(hasher, this.carm.angulation);
      hashNumber(hasher, this.carm.sourceToImageDistance);
      hashNumber(hasher, this.carm.tableLateral);
      hashNumber(hasher, this.carm.tableLongitudinal);
      hashNumber(hasher, this.carm.tableHeight);
      hashNumber(hasher, this.carm.collimation);
      hashNumber(hasher, this.carm.zoomIndex);
    }
    hashNumber(hasher, this.fluoroTime);
    hashNumber(hasher, this.rng.state);
    return hashHex(hasher);
  }

  // -------------------------------------------------------------------------------------------------------------

  private requireConfig(): SimConfig {
    if (this.config === null) {
      throw new Error('SimEngine: call load(config) first.');
    }
    return this.config;
  }

  private requireTier(): TierParams {
    if (this.tier === null) {
      throw new Error('SimEngine: call load(config) first.');
    }
    return this.tier;
  }

  private requireWorld(): PhysicsWorld {
    if (this.world === null) {
      throw new Error('SimEngine: call load(config) first.');
    }
    return this.world;
  }

  private requireFrame(): AccessFrame {
    if (this.frame === null) {
      throw new Error('SimEngine: call load(config) first.');
    }
    return this.frame;
  }

  private requireRecord(index: number): DeviceRecord {
    const record = this.records[index];
    if (record === undefined) {
      throw new Error(`SimEngine: no device ${index}.`);
    }
    return record;
  }

  private spec(rodModelId: string): SimDeviceSpec {
    const spec = this.specs[rodModelId];
    if (spec === undefined) {
      throw new Error(`SimEngine: no device instance for rod model "${rodModelId}".`);
    }
    return spec;
  }

  private friction(value: number): number {
    const override = this.config?.frictionOverride;
    return override === undefined || override === null ? value : override;
  }

  private makeRecord(spec: SimDeviceSpec, inserted: number, rotation: number): DeviceRecord {
    const frame = this.requireFrame();
    const rod = buildRod(spec, this.requireConfig().physics.rotationalInertiaScale);
    const physics = createPhysicsDevice(
      rod,
      this.friction(spec.wallFriction.value),
      this.friction(spec.lumenFriction?.value ?? 0),
    );
    physics.inserted = inserted;
    physics.rotation = rotation;
    physics.currentInserted = inserted;
    physics.currentRotation = rotation;
    placeStraight(rod, frame, inserted, rotation);
    physics.firstDynamic = placeKinematic(rod, frame, inserted, rotation, 0, 0);
    // The pre-shaped tip: rest chords near the tip. A chord (cx, cy) turns d3 toward cy·d1 − cx·d2 (D9).
    let bendJoint = -1;
    let bendD1 = 0;
    let bendD2 = 0;
    for (let j = rod.segmentCount - 2; j >= 0; j -= 1) {
      const cx = rod.restChord[VEC3 * j] ?? 0;
      const cy = rod.restChord[VEC3 * j + Y] ?? 0;
      if (cx === 0 && cy === 0) {
        if (bendJoint >= 0) {
          break;
        }
        continue;
      }
      bendJoint = j;
      bendD1 += cy;
      bendD2 -= cx;
    }
    const bendNorm = Math.sqrt(bendD1 * bendD1 + bendD2 * bendD2);
    return {
      physics,
      spec,
      bendJoint,
      bendD1: bendNorm > 0 ? bendD1 / bendNorm : 0,
      bendD2: bendNorm > 0 ? bendD2 / bendNorm : 0,
      hubForce: 0,
      frictionForce: 0,
      tipForce: 0,
      wallStress: 0,
      tipSegment: -1,
      hubWarning: false,
      hubDanger: false,
    };
  }

  private setAnatomy(anatomy: SimAnatomy): void {
    const config = this.requireConfig();
    const access = anatomy.access.find((entry) => entry.id === config.accessId);
    if (access === undefined) {
      throw new Error(`SimEngine: anatomy ${anatomy.id} has no access "${config.accessId}".`);
    }
    this.anatomy = anatomy;
    this.lumen = anatomy.segments.length > 0 ? buildLumen(anatomy, config.physics.lumenGridCell) : null;
    this.frame = createAccessFrame(access.position, access.direction, config.sheathLength);
    this.resetDevices();
  }

  /** Puts every device of the configured stack back at its starting depth and rotation, straight on the axis. */
  private resetDevices(): void {
    const config = this.requireConfig();
    this.records = config.stack.map((entry) =>
      this.makeRecord(this.spec(entry.rodModelId), entry.inserted, entry.rotation),
    );
    this.stack = createStack(this.records.length);
    this.carm = config.carm === undefined ? null : initialCarm(config.carm);
    this.fluoroTime = 0;
    this.lastMode = 'cath';
    this.lastFluoro = 0;
    this.lastInject = 0;
    this.fluoroLastStep = -1;
    this.swap = null;
    this.blocked = false;
    this.rebuildWorld();
    this.relax();
  }

  /**
   * Lets the devices relax into their rest shapes with no input before step 0, so a pre-shaped tip that starts
   * straight does not snap in the first frame. Deterministic; nothing is recorded.
   */
  private relax(): void {
    const config = this.requireConfig();
    const tier = this.requireTier();
    const world = this.requireWorld();
    const h = 1 / (tier.stepRate * tier.substeps);
    for (const record of this.records) {
      record.physics.insertRate = 0;
      record.physics.rotateRate = 0;
    }
    for (let n = 0; n < config.physics.loadRelaxSteps; n += 1) {
      for (let s = 0; s < tier.substeps; s += 1) {
        physicsSubstep(world, h, (s + 1) * h);
      }
      placeKinematicParts(world);
    }
    for (const record of this.records) {
      record.physics.hubForceSum = 0;
      record.physics.tipForceSum = 0;
      record.tipSegment = this.tipSegmentOf(record);
    }
  }

  private rebuildWorld(): void {
    const config = this.requireConfig();
    this.world = createPhysicsWorld(
      this.records.map((record) => record.physics),
      this.requireFrame(),
      this.lumen,
      {
        linearDamping: config.physics.linearDamping,
        angularDamping: config.physics.angularDamping,
        gravity: config.physics.gravity,
        lumenMargin: config.physics.lumenMargin,
        contactActivation: config.physics.contactActivation,
        contactPasses: config.physics.contactPasses,
        slipSpeed: config.physics.slipSpeed,
        slipSpin: config.physics.slipSpin,
        tipForceNodes: config.feedback.tipForceNodes,
        symmetryBreak: config.physics.symmetryBreak,
        contactFallbackCompliance: config.physics.contactFallbackCompliance,
      },
    );
  }

  private applyDueCommands(): void {
    if (this.queue.length === 0) {
      return;
    }
    const due = this.queue.filter((command) => command.step <= this.stepCount);
    this.queue = this.queue.filter((command) => command.step > this.stepCount);
    for (const command of due) {
      this.applyCommand(command);
    }
  }

  private applyCommand(command: Command): void {
    const config = this.requireConfig();
    switch (command.cmd) {
      case 'reset':
        this.resetDevices();
        break;
      case 'set-anatomy': {
        const id = String(command.args.anatomy ?? '');
        const anatomy = id === config.anatomy.id ? config.anatomy : config.anatomies?.[id];
        if (anatomy !== undefined) {
          this.setAnatomy(anatomy);
        }
        break;
      }
      case 'set-tier': {
        const choice = config.tiers?.[String(command.args.tier ?? '')];
        if (choice !== undefined) {
          this.tier = choice.tier;
          this.specs = choice.devices;
          this.resetDevices();
        }
        break;
      }
      case 'swap-device': {
        const target = String(command.args.device ?? '');
        const inner = this.records[this.records.length - 1];
        if (
          this.specs[target] !== undefined &&
          inner !== undefined &&
          inner.physics.rod.rodModelId !== target
        ) {
          const outer = this.records[this.records.length - 2];
          this.swap = {
            phase: 'withdraw',
            target,
            feedTo: outer?.physics.inserted ?? inner.physics.inserted,
          };
        }
        break;
      }
      case 'start-autopilot':
        this.autopilot = String(command.args.script ?? '');
        break;
      case 'stop-autopilot':
        this.autopilot = null;
        break;
    }
  }

  /**
   * swap-device: withdraw the inner device to the sheath valve at full speed, replace it, then feed the new one to
   * the outer device's tip (prompts/M1-foundations.md §7). User input for the inner device is ignored meanwhile.
   */
  private applySwap(dt: number): void {
    const swap = this.swap;
    if (swap === null) {
      return;
    }
    const config = this.requireConfig();
    const index = this.records.length - 1;
    const inner = this.records[index];
    if (inner === undefined) {
      this.swap = null;
      return;
    }
    const speed = config.speeds.advanceSpeedMax;
    if (swap.phase === 'withdraw') {
      if (inner.physics.inserted <= 0) {
        this.records[index] = this.makeRecord(this.spec(swap.target), 0, inner.physics.rotation);
        this.rebuildWorld();
        swap.phase = 'feed';
      } else {
        inner.physics.insertRate = -Math.min(speed, inner.physics.inserted / dt);
        inner.physics.rotateRate = 0;
        return;
      }
    }
    const fed = this.records[index] as DeviceRecord;
    const remaining = swap.feedTo - fed.physics.inserted;
    if (remaining <= 0) {
      fed.physics.insertRate = 0;
      this.swap = null;
      return;
    }
    fed.physics.insertRate = Math.min(speed, remaining / dt);
    fed.physics.rotateRate = 0;
  }

  /**
   * The order rule order-catheter-over-wire: in the vessel, an outer device cannot advance past the innermost
   * device's tip. A blocked advance is clamped and emits blocked-action once per block.
   */
  private applyOrderRule(dt: number): void {
    const config = this.requireConfig();
    const frame = this.requireFrame();
    const innermost = this.records[this.records.length - 1];
    if (innermost === undefined || this.records.length < 2) {
      return;
    }
    // order-catheter-over-wire: an outer device advances in the vessel only behind the wire tip.
    const wireTip = innermost.physics.inserted + innermost.physics.insertRate * dt;
    let blocked = false;
    for (let d = 0; d < this.records.length - 1; d += 1) {
      const physics = (this.records[d] as DeviceRecord).physics;
      const proposed = physics.inserted + physics.insertRate * dt;
      if (physics.insertRate > 0 && !wireLeadsCatheter(proposed, wireTip, frame.sheathLength)) {
        physics.insertRate = Math.max(0, (Math.max(frame.sheathLength, wireTip) - physics.inserted) / dt);
        blocked = true;
      }
    }
    if (blocked && !this.blocked && config.orderRule !== undefined) {
      this.events.push({
        type: 'blocked-action',
        step: this.stepCount,
        device: (this.records[0] as DeviceRecord).physics.rod.rodModelId,
        ruleId: config.orderRule.id,
        message: config.orderRule.message,
      });
    }
    this.blocked = blocked;
  }

  private finishStep(dt: number): void {
    const config = this.requireConfig();
    const tier = this.requireTier();
    for (const record of this.records) {
      const physics = record.physics;
      physics.inserted = physics.currentInserted;
      physics.rotation = physics.currentRotation;
      record.hubForce = physics.hubForceSum / tier.substeps;
      record.tipForce = physics.tipForceSum / tier.substeps;
      physics.hubForceSum = 0;
      physics.tipForceSum = 0;
    }
    this.addDeviceFriction();
    for (const record of this.records) {
      const physics = record.physics;
      // Wall stress: ∫ max(0, tip normal force − threshold) dt (docs/M1-plan.md D16).
      record.wallStress += Math.max(0, record.tipForce - config.feedback.wallStressThreshold) * dt;

      const warning = record.hubForce >= config.feedback.hubForceWarning;
      const danger = record.hubForce >= config.feedback.hubForceDanger;
      const id = physics.rod.rodModelId;
      if (warning && !record.hubWarning) {
        this.events.push({
          type: 'hub-force-warning',
          step: this.stepCount,
          device: id,
          forceN: record.hubForce,
        });
      }
      if (danger && !record.hubDanger) {
        this.events.push({
          type: 'hub-force-danger',
          step: this.stepCount,
          device: id,
          forceN: record.hubForce,
        });
      }
      record.hubWarning = warning;
      record.hubDanger = danger;

      const segment = this.tipSegmentOf(record);
      if (segment >= 0 && segment !== record.tipSegment && this.lumen !== null) {
        this.events.push({
          type: 'tip-entered-segment',
          step: this.stepCount,
          device: id,
          segment: this.lumen.segmentIds[segment] ?? '',
          name: this.lumen.segmentNames[segment] ?? '',
        });
      }
      record.tipSegment = segment;
    }
    this.stepCount += 1;
  }

  /**
   * Device-in-device friction (spec 04 §2.3). Each device rubs on the innermost device around it at every arc; where
   * their insertion rates differ, the friction acts on both hubs, equal and opposite, against each one's motion
   * relative to the other: the driven hand feels resistance, the pinning hand feels drag. Below frictionSlipSpeed the
   * force grows linearly with the relative speed, as wall friction does.
   */
  private addDeviceFriction(): void {
    const config = this.requireConfig();
    const frame = this.requireFrame();
    for (const record of this.records) {
      record.frictionForce = 0;
    }
    for (let i = 1; i < this.records.length; i += 1) {
      const inner = this.records[i] as DeviceRecord;
      // Arcs held by a device between this pair belong to that device's pair.
      let covered = frame.sheathLength;
      for (let o = i - 1; o >= 0; o -= 1) {
        const outer = this.records[o] as DeviceRecord;
        const upper = Math.min(outer.physics.inserted, inner.physics.inserted);
        const relative = inner.physics.insertRate - outer.physics.insertRate;
        const slip = Math.min(1, Math.max(-1, relative / config.physics.slipSpeed));
        if (upper > covered && slip !== 0) {
          const force =
            slip *
            slidingFriction(
              outer.physics.rod,
              outer.physics.inserted,
              inner.physics.rod,
              inner.physics.inserted,
              covered,
              upper,
              outer.physics.lumenFriction,
              inner.hubForce,
              this.frictionScratch,
            );
          inner.frictionForce += force;
          outer.frictionForce -= force;
        }
        covered = Math.max(covered, outer.physics.inserted);
      }
    }
    for (const record of this.records) {
      record.hubForce += record.frictionForce;
    }
  }

  /** The anatomy segment whose capsule holds the tip most deeply; −1 inside the sheath or in free space. */
  private tipSegmentOf(record: DeviceRecord): number {
    const rod = record.physics.rod;
    const tip = rod.segmentCount;
    if (this.lumen === null || rod.kinematic[tip] === 1) {
      return -1;
    }
    const o = VEC3 * tip;
    const config = this.requireConfig();
    if (
      !queryLumen(
        this.lumen,
        rod.x[o] ?? 0,
        rod.x[o + Y] ?? 0,
        rod.x[o + Z] ?? 0,
        rod.outerRadius[tip - 1] ?? 0,
        config.physics.lumenMargin,
        this.hit,
      )
    ) {
      return -1;
    }
    return this.lumen.segment[this.hit.capsule] ?? -1;
  }
}
