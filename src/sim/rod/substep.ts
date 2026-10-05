import { createLumenHit, type Lumen, type LumenHit } from '../anatomy/lumen';
import {
  GROUP_BEND,
  GROUP_CONTACT,
  GROUP_STRETCH,
  GROUPS_PER_UNIT,
  LENGTH_EPSILON,
  MAT3,
  PLACEMENT_VALUES,
  QUAT,
  STRETCH_ROW,
  CONTACT_ROW,
  UNIT_ROWS,
  VEC3,
  W,
  X,
  Y,
  Z,
} from '../core/types';
import { cylinderInertia } from '../math/geometry';
import { setIdentity3, setPerpendicularProjection3, setSkew3 } from '../math/mat3';
import { quatApplyWorldRotation, quatCopy, quatFromAxisAngle, quatMultiply } from '../math/quat';
import {
  accumulateTwist,
  arcOfNode,
  centerlinePoint,
  centerlineVelocity,
  innerBending,
  innerRestChord,
  segmentTangent,
} from './coaxial';
import {
  createContactQuery,
  dampPredictedSliding,
  dampPredictedSpin,
  probeLumen,
  slidingDamping,
  twistDamping,
  type ContactQuery,
} from './contact';
import {
  addEntry,
  addNodeVariable,
  addSegmentVariable,
  addVariableForce,
  applyCorrections,
  beginUnit,
  bendTwist,
  createSolver,
  resetSolver,
  setNodeInverse,
  solveUnits,
  type Solver,
} from './constraints';
import { placeKinematic, type AccessFrame } from './insertion';
import type { RodState } from './state';

/**
 * One physics substep for a stack of devices (outermost first): predict, place the kinematic parts, solve every
 * constraint of every chain together, then update velocities (prompts/M1-foundations.md §2; docs/M1-plan.md D29).
 *
 * Ownership of the arc beyond the sheath tip: the outermost device owns its own length; an inner device owns only
 * the part beyond the tips of the devices around it. Inside them it is carried as a composite (coaxial.ts).
 */

export interface PhysicsSettings {
  /** Velocity damping rates, 1/s: v ← v·(1 − c·h). */
  readonly linearDamping: number;
  readonly angularDamping: number;
  /** m/s², along +y (posterior): the patient lies supine. Zero in M1. */
  readonly gravity: number;
  /** Clearance kept between the device surface and the lumen wall, m. */
  readonly lumenMargin: number;
  /** A node that pressed on the wall and is within this distance inside its allowed surface keeps its contact row, m. */
  readonly contactActivation: number;
  /** Most solves per substep while contact rows are added or released. */
  readonly contactPasses: number;
  /** Below these sliding speeds Coulomb friction is regularized, m/s and rad/s. */
  readonly slipSpeed: number;
  readonly slipSpin: number;
  /** Tip normal force sums the contact forces on this many most-distal nodes. */
  readonly tipForceNodes: number;
}

export interface PhysicsDevice {
  readonly rod: RodState;
  /** Coulomb coefficients against the wall and inside this device's lumen. */
  wallFriction: number;
  lumenFriction: number;
  /** Insertion depth L (m) and hub rotation φ (rad) at the start of the step, and their rates this step. */
  inserted: number;
  rotation: number;
  insertRate: number;
  rotateRate: number;
  /** L and φ at the end of the current substep. */
  currentInserted: number;
  currentRotation: number;
  firstDynamic: number;
  /** Arc where this device's owned part begins, and its first owned node (segmentCount + 1 when none). */
  ownedFrom: number;
  firstOwned: number;
  readonly nodeVariable: Int32Array;
  readonly segmentVariable: Int32Array;
  /** 1 for nodes owned in the previous substep, to start newly freed nodes from the device around them. */
  readonly ownedBefore: Uint8Array;
  /** L, φ and their rates at the last placement of the whole kinematic part (NaN before the first). */
  readonly placed: Float64Array;
  /** Hub force and tip normal force summed over the step's substeps, N. */
  hubForceSum: number;
  tipForceSum: number;
}

export interface PhysicsWorld {
  readonly devices: PhysicsDevice[];
  readonly frame: AccessFrame;
  readonly lumen: Lumen | null;
  readonly settings: PhysicsSettings;
  readonly solver: Solver;
  readonly hit: LumenHit;
  readonly query: ContactQuery;
  /** Substeps whose system was not positive definite; they keep the predicted state. Zero in a healthy run. */
  solveFailures: number;
  /** Linear solves so far, counting each contact pass: a measure of cost. */
  solves: number;
  readonly scratch: {
    readonly vector: Float64Array;
    readonly tangent: Float64Array;
    readonly jacobian: Float64Array;
    readonly quat: Float64Array;
    readonly chord: Float64Array;
    readonly twist: Float64Array[];
    /** Per device: the first unit of its owned chain and the axis its hub force acts along. */
    readonly firstUnit: Int32Array;
    readonly pivotAxis: Float64Array;
  };
}

export function createPhysicsDevice(
  rod: RodState,
  wallFriction: number,
  lumenFriction: number,
): PhysicsDevice {
  return {
    rod,
    wallFriction,
    lumenFriction,
    inserted: 0,
    rotation: 0,
    insertRate: 0,
    rotateRate: 0,
    currentInserted: 0,
    currentRotation: 0,
    firstDynamic: rod.segmentCount + 1,
    ownedFrom: 0,
    firstOwned: rod.segmentCount + 1,
    nodeVariable: new Int32Array(rod.segmentCount + 1).fill(-1),
    segmentVariable: new Int32Array(rod.segmentCount).fill(-1),
    ownedBefore: new Uint8Array(rod.segmentCount + 1),
    placed: new Float64Array(PLACEMENT_VALUES).fill(Number.NaN),
    hubForceSum: 0,
    tipForceSum: 0,
  };
}

export function createPhysicsWorld(
  devices: PhysicsDevice[],
  frame: AccessFrame,
  lumen: Lumen | null,
  settings: PhysicsSettings,
): PhysicsWorld {
  const capacity = devices.reduce((sum, device) => sum + device.rod.segmentCount, 0) + 1;
  return {
    devices,
    frame,
    lumen,
    settings,
    solver: createSolver(capacity),
    hit: createLumenHit(),
    query: createContactQuery(),
    solveFailures: 0,
    solves: 0,
    scratch: {
      vector: new Float64Array(VEC3),
      tangent: new Float64Array(VEC3),
      jacobian: new Float64Array(MAT3),
      quat: new Float64Array(QUAT),
      chord: new Float64Array(VEC3),
      twist: devices.map((device) => new Float64Array(device.rod.segmentCount)),
      firstUnit: new Int32Array(devices.length),
      pivotAxis: new Float64Array(VEC3 * devices.length),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------

/**
 * Integrates velocities into a prediction of the nodes and segments from `from` on. Kinematic ones are placed
 * afterwards, so only the part that was dynamic in the last substep (and a node or two proximal to it, which may just
 * have left the sheath) needs predicting.
 */
function predict(rod: RodState, h: number, from: number): void {
  rod.xPrev.set(rod.x.subarray(VEC3 * from), VEC3 * from);
  rod.qPrev.set(rod.q.subarray(QUAT * from), QUAT * from);
  for (let k = VEC3 * from; k < rod.x.length; k += 1) {
    rod.x[k] = (rod.x[k] ?? 0) + h * (rod.v[k] ?? 0);
  }
  for (let j = from; j < rod.segmentCount; j += 1) {
    const o = VEC3 * j;
    quatApplyWorldRotation(
      rod.q,
      QUAT * j,
      h * (rod.omega[o] ?? 0),
      h * (rod.omega[o + Y] ?? 0),
      h * (rod.omega[o + Z] ?? 0),
    );
  }
}

/** The device whose owned part contains arc distance `arc`, among devices before `before`; −1 for none. */
function ownerOfArc(world: PhysicsWorld, before: number, arc: number): number {
  for (let d = before - 1; d >= 0; d -= 1) {
    const device = world.devices[d];
    if (device !== undefined && arc > device.ownedFrom && arc <= device.currentInserted + LENGTH_EPSILON) {
      return d;
    }
  }
  return -1;
}

/**
 * The inner device's frame inside its owner: the owner's frame at that segment turned about d3 by
 * ψ = (φ_inner − φ_owner) − twist accumulated along the owner, so the inner device keeps its own hub rotation.
 */
function slavedOrientation(
  world: PhysicsWorld,
  owner: number,
  inner: number,
  ownerSegment: number,
  out: Float64Array,
): void {
  const ownerDevice = world.devices[owner] as PhysicsDevice;
  const innerDevice = world.devices[inner] as PhysicsDevice;
  const twist = world.scratch.twist[owner] ?? new Float64Array(0);
  const psi = innerDevice.currentRotation - ownerDevice.currentRotation - (twist[ownerSegment] ?? 0);
  quatFromAxisAngle(0, 0, 1, psi, world.scratch.quat, 0);
  quatMultiply(ownerDevice.rod.q, QUAT * ownerSegment, world.scratch.quat, 0, out, 0);
}

/** Moves inner nodes that sit inside an owner onto its centerline, and starts newly freed nodes from it. */
function carryInnerDevices(world: PhysicsWorld, h: number): void {
  const { devices, frame, scratch } = world;
  for (let d = 1; d < devices.length; d += 1) {
    const device = devices[d] as PhysicsDevice;
    const rod = device.rod;
    for (let i = device.firstDynamic; i <= rod.segmentCount; i += 1) {
      const arc = arcOfNode(rod, device.currentInserted, i);
      if (arc <= frame.sheathLength + LENGTH_EPSILON) {
        continue;
      }
      const owned = i >= device.firstOwned;
      const owner = ownerOfArc(world, d, owned ? Math.min(arc, device.ownedFrom) : arc);
      if (owner < 0) {
        continue;
      }
      const ownerDevice = devices[owner] as PhysicsDevice;
      const o = VEC3 * i;
      if (!owned) {
        centerlinePoint(ownerDevice.rod, ownerDevice.currentInserted, arc, rod.x, o);
      } else if (device.ownedBefore[i] !== 1) {
        // Just left the device around it: start on its centerline (extended past its tip), moving with it.
        centerlinePoint(ownerDevice.rod, ownerDevice.currentInserted, arc, rod.x, o);
        centerlineVelocity(ownerDevice.rod, ownerDevice.currentInserted, arc, rod.v, o);
        const tipSegment = ownerDevice.rod.segmentCount - 1;
        segmentTangent(ownerDevice.rod, tipSegment, scratch.tangent, 0);
        const slide = device.insertRate - ownerDevice.insertRate;
        for (let k = 0; k < VEC3; k += 1) {
          rod.v[o + k] = (rod.v[o + k] ?? 0) + slide * (scratch.tangent[k] ?? 0);
          rod.xPrev[o + k] = (rod.x[o + k] ?? 0) - h * (rod.v[o + k] ?? 0);
        }
        // The segment ending at this node joins the owned chain with the owner's tip frame and spin.
        if (i >= 1) {
          slavedOrientation(world, owner, d, tipSegment, scratch.quat);
          quatCopy(scratch.quat, 0, rod.q, QUAT * (i - 1));
          quatCopy(scratch.quat, 0, rod.qPrev, QUAT * (i - 1));
          for (let k = 0; k < VEC3; k += 1) {
            rod.omega[VEC3 * (i - 1) + k] = ownerDevice.rod.omega[VEC3 * tipSegment + k] ?? 0;
          }
        }
      }
    }
  }
}

/** Composite mass and perpendicular inertia that inner devices add at an arc of the owner. */
function innerLoad(world: PhysicsWorld, owner: number, arc: number): { mass: number; inertia: number } {
  let mass = 0;
  let inertia = 0;
  for (let e = owner + 1; e < world.devices.length; e += 1) {
    const inner = world.devices[e] as PhysicsDevice;
    if (arc > inner.currentInserted || arc <= world.frame.sheathLength) {
      continue;
    }
    const segment = Math.min(
      inner.rod.segmentCount - 1,
      Math.max(
        0,
        Math.floor((arc - inner.currentInserted) / inner.rod.segmentLength + inner.rod.segmentCount),
      ),
    );
    const segmentMass = (inner.rod.massPerLength[segment] ?? 0) * inner.rod.segmentLength;
    mass += segmentMass;
    inertia += cylinderInertia(
      segmentMass,
      inner.rod.outerRadius[segment] ?? 0,
      inner.rod.innerRadius[segment] ?? 0,
      inner.rod.segmentLength,
    ).perpendicular;
  }
  return { mass, inertia };
}

/** Fills the solver with every owned chain: variables, units, contacts and forces; records each device's first unit. */
function buildChains(world: PhysicsWorld, h: number, firstUnit: Int32Array, pivotAxis: Float64Array): void {
  const { devices, frame, lumen, settings, solver, scratch } = world;
  const units = devices.reduce(
    (sum, device) => sum + Math.max(0, device.rod.segmentCount + 1 - device.firstOwned + 1),
    0,
  );
  resetSolver(solver, Math.max(1, units));

  devices.forEach((device, d) => {
    const rod = device.rod;
    const n = rod.segmentCount;
    const l = rod.segmentLength;
    device.nodeVariable.fill(-1);
    device.segmentVariable.fill(-1);
    firstUnit[d] = -1;
    const first = device.firstOwned;
    if (first > n) {
      return;
    }

    // Variables: owned nodes and the segments that end at them, with any inner devices' composite load. Wall friction
    // from the last substep's contact acts implicitly: it damps the predicted sliding and spin, and makes the node
    // heavier along the wall and the segment heavier about its axis for this solve.
    const mu = device.wallFriction;
    for (let i = first; i <= n; i += 1) {
      const mass = (rod.mass[i] ?? 0) + innerLoad(world, d, arcOfNode(rod, device.currentInserted, i)).mass;
      const id = addNodeVariable(solver, d, i, 1 / mass);
      device.nodeVariable[i] = id;
      const o = VEC3 * i;
      // Gravity (along +y, the patient lying supine) and any test force.
      addVariableForce(
        solver,
        id,
        rod.force[o] ?? 0,
        (rod.force[o + Y] ?? 0) + settings.gravity * mass,
        rod.force[o + Z] ?? 0,
      );
      const damping = slidingDamping(rod, i, mu, settings.slipSpeed);
      if (damping > 0) {
        dampPredictedSliding(rod, i, h, mass / (mass + h * damping));
        const normal = rod.contactNormal;
        setNodeInverse(
          solver,
          id,
          normal[o] ?? 0,
          normal[o + Y] ?? 0,
          normal[o + Z] ?? 0,
          1 / mass,
          1 / (mass + h * damping),
        );
      }
    }
    for (let k = first - 1; k < n; k += 1) {
      const midArc = arcOfNode(rod, device.currentInserted, k) + 0.5 * l;
      const extra = innerLoad(world, d, midArc);
      const axial = rod.inertiaAxial[k] ?? 0;
      segmentTangent(rod, k, scratch.tangent, 0);
      const damping = twistDamping(rod, k, k + 1, scratch.tangent, mu, settings.slipSpin);
      if (damping > 0) {
        dampPredictedSpin(rod, k, scratch.tangent, h, axial / (axial + h * damping));
      }
      device.segmentVariable[k] = addSegmentVariable(
        solver,
        d,
        k,
        rod.q,
        QUAT * k,
        1 / ((rod.inertiaPerpendicular[k] ?? 0) + extra.inertia),
        1 / (axial + h * damping),
      );
    }

    // The proximal end of the first owned segment: kinematic at the sheath, or carried by the device around it.
    const proximalArc = arcOfNode(rod, device.currentInserted, first - 1);
    const junctionOwner =
      proximalArc > frame.sheathLength + LENGTH_EPSILON ? ownerOfArc(world, d, proximalArc) : -1;

    for (let k = first - 1; k < n; k += 1) {
      const u = beginUnit(solver, d, k);
      if (k === first - 1) {
        firstUnit[d] = u;
      }
      const jointArc = arcOfNode(rod, device.currentInserted, k);
      const jacobian = scratch.jacobian;

      // --- Bend-twist joint at node k, between segment k − 1 (or the owner's tip frame) and segment k.
      if (k >= 1) {
        let prevQ = rod.q;
        let prevOffset = QUAT * (k - 1);
        let prevVariable = device.segmentVariable[k - 1] ?? -1;
        let voronoi = l;
        if (k === first - 1) {
          // The clamp at the sheath tip or the junction at an outer tip: only the free half of the joint bends (D10).
          voronoi = 0.5 * l;
          if (junctionOwner >= 0) {
            const ownerDevice = devices[junctionOwner] as PhysicsDevice;
            const ownerTip = ownerDevice.rod.segmentCount - 1;
            slavedOrientation(world, junctionOwner, d, ownerTip, scratch.quat);
            prevQ = scratch.quat;
            prevOffset = 0;
            prevVariable = ownerDevice.segmentVariable[ownerTip] ?? -1;
          }
        }
        // Rest chord and stiffness, with inner devices' share where they overlap (composite).
        let bending = rod.jointBending[k - 1] ?? 0;
        let chordX = rod.restChord[VEC3 * (k - 1)] ?? 0;
        let chordY = rod.restChord[VEC3 * (k - 1) + Y] ?? 0;
        const chordZ = rod.restChord[VEC3 * (k - 1) + Z] ?? 0;
        for (let e = d + 1; e < devices.length; e += 1) {
          const inner = devices[e] as PhysicsDevice;
          if (jointArc > inner.currentInserted || jointArc <= frame.sheathLength) {
            continue;
          }
          const innerEI = innerBending(inner.rod, inner.currentInserted, jointArc);
          const twist = scratch.twist[d] ?? new Float64Array(0);
          const psi = inner.currentRotation - device.currentRotation - (twist[k - 1] ?? 0);
          innerRestChord(inner.rod, inner.currentInserted, jointArc, psi, scratch.chord);
          chordX = (bending * chordX + innerEI * (scratch.chord[0] ?? 0)) / (bending + innerEI);
          chordY = (bending * chordY + innerEI * (scratch.chord[1] ?? 0)) / (bending + innerEI);
          bending += innerEI;
        }
        // A pre-shaped segment can only curve once it is out: where a chain starts (at the sheath tip or at an outer
        // device's tip), the first segment's rest bend grows with the length that has emerged.
        let release = 1;
        if (k === first - 1) {
          const emerged = arcOfNode(rod, device.currentInserted, first) - device.ownedFrom;
          release = Math.min(1, Math.max(0, emerged / l));
        }
        scratch.chord[0] = chordX * release;
        scratch.chord[1] = chordY * release;
        scratch.chord[2] = chordZ * release;
        bendTwist(solver, u, prevQ, prevOffset, rod.q, QUAT * k, scratch.chord, 0, voronoi, jacobian);
        addEntry(solver, u, GROUP_BEND, device.segmentVariable[k] ?? -1, jacobian, 0, 1);
        addEntry(solver, u, GROUP_BEND, prevVariable, jacobian, 0, -1);
        const c = solver.units.compliance;
        c[VEC3 * u] = 1 / (bending * voronoi);
        c[VEC3 * u + 1] = 1 / (bending * voronoi);
        c[VEC3 * u + 2] = 1 / ((rod.jointTorsion[k - 1] ?? 0) * voronoi);
      } else {
        // No joint before the handle segment: keep its rows decoupled.
        const c = solver.units.compliance;
        c[VEC3 * u] = 1;
        c[VEC3 * u + 1] = 1;
        c[VEC3 * u + 2] = 1;
      }

      // --- Stretch-shear of segment k: (x[k+1] − x[k]) / l − d3 = 0.
      segmentTangent(rod, k, scratch.tangent, 0);
      const d3x = scratch.tangent[0] ?? 0;
      const d3y = scratch.tangent[1] ?? 0;
      const d3z = scratch.tangent[2] ?? 1;
      const distal = VEC3 * (k + 1);
      let px = rod.x[VEC3 * k] ?? 0;
      let py = rod.x[VEC3 * k + Y] ?? 0;
      let pz = rod.x[VEC3 * k + Z] ?? 0;
      if (k === first - 1 && junctionOwner >= 0) {
        // The slaved node lies on the owner's tip segment, a lever e behind the owner's tip node; axially it follows
        // its own hub, so only lateral motion of the owner moves it.
        const ownerDevice = devices[junctionOwner] as PhysicsDevice;
        const ownerRod = ownerDevice.rod;
        const ownerTip = ownerRod.segmentCount - 1;
        const tipNode = VEC3 * ownerRod.segmentCount;
        segmentTangent(ownerRod, ownerTip, scratch.vector, 0);
        const ox = scratch.vector[0] ?? 0;
        const oy = scratch.vector[1] ?? 0;
        const oz = scratch.vector[2] ?? 1;
        const lever = ownerDevice.currentInserted - proximalArc;
        px = (ownerRod.x[tipNode] ?? 0) - lever * ox;
        py = (ownerRod.x[tipNode + Y] ?? 0) - lever * oy;
        pz = (ownerRod.x[tipNode + Z] ?? 0) - lever * oz;
        rod.x[VEC3 * k] = px;
        rod.x[VEC3 * k + Y] = py;
        rod.x[VEC3 * k + Z] = pz;
        setPerpendicularProjection3(jacobian, 0, ox, oy, oz, -1 / l);
        addEntry(
          solver,
          u,
          GROUP_STRETCH,
          ownerDevice.nodeVariable[ownerRod.segmentCount] ?? -1,
          jacobian,
          0,
          1,
        );
        setSkew3(jacobian, 0, ox, oy, oz, -lever / l);
        addEntry(solver, u, GROUP_STRETCH, ownerDevice.segmentVariable[ownerTip] ?? -1, jacobian, 0, 1);
        pivotAxis[VEC3 * d] = ox;
        pivotAxis[VEC3 * d + 1] = oy;
        pivotAxis[VEC3 * d + 2] = oz;
      } else {
        setIdentity3(jacobian, 0, -1 / l);
        addEntry(solver, u, GROUP_STRETCH, device.nodeVariable[k] ?? -1, jacobian, 0, 1);
        if (k === first - 1) {
          pivotAxis[VEC3 * d] = frame.direction[X] ?? 0;
          pivotAxis[VEC3 * d + 1] = frame.direction[Y] ?? 0;
          pivotAxis[VEC3 * d + 2] = frame.direction[Z] ?? 1;
        }
      }
      const cs = solver.units.constraint;
      cs[UNIT_ROWS * u + STRETCH_ROW] = ((rod.x[distal] ?? 0) - px) / l - d3x;
      cs[UNIT_ROWS * u + STRETCH_ROW + 1] = ((rod.x[distal + Y] ?? 0) - py) / l - d3y;
      cs[UNIT_ROWS * u + STRETCH_ROW + 2] = ((rod.x[distal + Z] ?? 0) - pz) / l - d3z;
      setIdentity3(jacobian, 0, 1 / l);
      addEntry(solver, u, GROUP_STRETCH, device.nodeVariable[k + 1] ?? -1, jacobian, 0, 1);
      setSkew3(jacobian, 0, d3x, d3y, d3z, 1);
      addEntry(solver, u, GROUP_STRETCH, device.segmentVariable[k] ?? -1, jacobian, 0, 1);

      // --- Lumen contact of node k + 1.
      const node = k + 1;
      if (lumen !== null) {
        const radius = rod.outerRadius[k] ?? 0;
        const found = probeLumen(
          lumen,
          world.hit,
          rod.x[distal] ?? 0,
          rod.x[distal + Y] ?? 0,
          rod.x[distal + Z] ?? 0,
          radius,
          settings.lumenMargin,
          world.query,
        );
        // A row from the start for a node predicted beyond the wall, or one that pressed on it last substep and is still
        // within the activation band; others that end up beyond the wall are added after the first solve.
        const pressed = (rod.contactForce[node] ?? 0) > 0;
        const violation = world.query.violation;
        if (found && (violation > LENGTH_EPSILON || (pressed && violation > -settings.contactActivation))) {
          activateContact(world, u, d, node);
        }
      }
    }
  });
}

/** Adds a contact row for a node: its lumen plane from the last probe, evaluated at the node's current position. */
function activateContact(world: PhysicsWorld, u: number, d: number, node: number, shift = 0): void {
  const { solver, query, scratch } = world;
  const device = world.devices[d] as PhysicsDevice;
  solver.units.contactActive[u] = 1;
  solver.units.constraint[UNIT_ROWS * u + CONTACT_ROW] = query.violation - shift;
  scratch.jacobian.fill(0);
  scratch.jacobian[0] = query.normal[0] ?? 0;
  scratch.jacobian[1] = query.normal[1] ?? 0;
  scratch.jacobian[2] = query.normal[2] ?? 0;
  addEntry(solver, u, GROUP_CONTACT, device.nodeVariable[node] ?? -1, scratch.jacobian, 0, 1);
  const o = VEC3 * node;
  device.rod.contactNormal[o] = query.normal[0] ?? 0;
  device.rod.contactNormal[o + Y] = query.normal[1] ?? 0;
  device.rod.contactNormal[o + Z] = query.normal[2] ?? 0;
}

/**
 * After a solve: units whose node ended outside the lumen without a contact row get one, and the substep is solved
 * again from the same prediction. Returns true if any contact was added.
 */
function activateMissedContacts(world: PhysicsWorld): boolean {
  const { solver, lumen, settings, query } = world;
  if (lumen === null) {
    return false;
  }
  let added = false;
  for (let u = 0; u < solver.units.count; u += 1) {
    if (solver.units.contactActive[u] === 1) {
      continue;
    }
    const d = solver.units.device[u] ?? 0;
    const device = world.devices[d] as PhysicsDevice;
    const node = (solver.units.segment[u] ?? 0) + 1;
    const variable = device.nodeVariable[node] ?? -1;
    if (variable < 0) {
      continue;
    }
    const o = VEC3 * node;
    const delta = solver.variables.delta;
    const dx = delta[VEC3 * variable] ?? 0;
    const dy = delta[VEC3 * variable + Y] ?? 0;
    const dz = delta[VEC3 * variable + Z] ?? 0;
    const x = (device.rod.x[o] ?? 0) + dx;
    const y = (device.rod.x[o + Y] ?? 0) + dy;
    const z = (device.rod.x[o + Z] ?? 0) + dz;
    if (
      !probeLumen(
        lumen,
        world.hit,
        x,
        y,
        z,
        device.rod.outerRadius[node - 1] ?? 0,
        settings.lumenMargin,
        query,
      )
    ) {
      continue;
    }
    // Beyond the wall by more than rounding: a resting node with no load must not flip in and out of contact.
    if (query.violation > LENGTH_EPSILON) {
      // The plane found at the corrected position, evaluated at the predicted one (the solve's linearization point).
      const shift = (query.normal[0] ?? 0) * dx + (query.normal[1] ?? 0) * dy + (query.normal[2] ?? 0) * dz;
      activateContact(world, u, d, node, shift);
      added = true;
    }
  }
  return added;
}

/** After a solve: contact rows that pulled their node onto the wall (λ > 0) are released. Returns true if any was. */
function releaseAdhesiveContacts(world: PhysicsWorld): boolean {
  const units = world.solver.units;
  let released = false;
  for (let u = 0; u < units.count; u += 1) {
    if (units.contactActive[u] === 1 && (units.lambda[UNIT_ROWS * u + CONTACT_ROW] ?? 0) > 0) {
      units.contactActive[u] = 0;
      units.entryCount[GROUPS_PER_UNIT * u + GROUP_CONTACT] = 0;
      released = true;
    }
  }
  return released;
}

/** Places every kinematic node and segment for the step's final L and φ: substeps place only those near the sheath. */
export function placeKinematicParts(world: PhysicsWorld): void {
  for (const device of world.devices) {
    const placed = device.placed;
    if (
      placed[0] === device.currentInserted &&
      placed[1] === device.currentRotation &&
      placed[2] === device.insertRate &&
      placed[PLACEMENT_VALUES - 1] === device.rotateRate
    ) {
      // Unchanged since the last full placement; the substeps kept the part near the sheath tip current.
      continue;
    }
    device.firstDynamic = placeKinematic(
      device.rod,
      world.frame,
      device.currentInserted,
      device.currentRotation,
      device.insertRate,
      device.rotateRate,
    );
    placed[0] = device.currentInserted;
    placed[1] = device.currentRotation;
    placed[2] = device.insertRate;
    placed[PLACEMENT_VALUES - 1] = device.rotateRate;
  }
}

/**
 * Runs one substep. `elapsed` is the time from the start of the step to the end of this substep, for interpolating
 * each device's insertion and rotation.
 */
export function physicsSubstep(world: PhysicsWorld, h: number, elapsed: number): void {
  const { devices, frame, settings, solver } = world;
  for (const device of devices) {
    // Insertion moves far less than a segment per substep, so two nodes proximal to the last dynamic part suffice.
    predict(device.rod, h, Math.max(0, device.firstDynamic - 2));
  }

  let reach = frame.sheathLength;
  for (const device of devices) {
    const rod = device.rod;
    device.currentInserted = Math.min(
      rod.segmentCount * rod.segmentLength,
      Math.max(0, device.inserted + device.insertRate * elapsed),
    );
    device.currentRotation = device.rotation + device.rotateRate * elapsed;
    device.firstDynamic = placeKinematic(
      rod,
      frame,
      device.currentInserted,
      device.currentRotation,
      device.insertRate,
      device.rotateRate,
      Math.max(0, device.firstDynamic - 2),
    );
    device.ownedFrom = reach;
    let first = rod.segmentCount + 1;
    for (let i = device.firstDynamic; i <= rod.segmentCount; i += 1) {
      if (arcOfNode(rod, device.currentInserted, i) > reach + LENGTH_EPSILON) {
        first = i;
        break;
      }
    }
    device.firstOwned = first;
    reach = Math.max(reach, device.currentInserted);
  }

  // Twist along each device that has devices inside it, for their orientation in its frame.
  for (let d = 0; d + 1 < devices.length; d += 1) {
    const device = devices[d] as PhysicsDevice;
    accumulateTwist(
      device.rod,
      Math.max(0, device.firstDynamic - 1),
      world.scratch.twist[d] ?? new Float64Array(0),
      world.scratch.quat,
    );
  }
  carryInnerDevices(world, h);

  const { firstUnit, pivotAxis } = world.scratch;
  buildChains(world, h, firstUnit, pivotAxis);
  // Contact only pushes: add rows for nodes that ended beyond the wall, release rows that pulled a node onto it, and
  // solve again until the set of contacts holds, at most contactPasses solves in all.
  let solved = solveUnits(solver, h);
  world.solves += 1;
  for (let pass = 1; solved && pass < settings.contactPasses; pass += 1) {
    const added = activateMissedContacts(world);
    const released = releaseAdhesiveContacts(world);
    if (!added && !released) {
      break;
    }
    solved = solveUnits(solver, h);
    world.solves += 1;
  }
  if (!solved) {
    world.solveFailures += 1;
  } else {
    applyCorrections(
      solver,
      devices.map((device) => device.rod),
    );
  }

  // Contact forces (for friction and the tip force), hub forces, then velocities and damping.
  const h2 = h * h;
  const units = solver.units;
  for (const device of devices) {
    device.rod.contactForce.fill(0);
  }
  if (solved) {
    for (let u = 0; u < units.count; u += 1) {
      if (units.contactActive[u] === 1) {
        const device = devices[units.device[u] ?? 0] as PhysicsDevice;
        const node = (units.segment[u] ?? 0) + 1;
        device.rod.contactForce[node] = Math.max(0, -(units.lambda[UNIT_ROWS * u + CONTACT_ROW] ?? 0) / h2);
      }
    }
  }
  devices.forEach((device, d) => {
    const rod = device.rod;
    const u = firstUnit[d] ?? -1;
    if (solved && u >= 0) {
      const l = rod.segmentLength;
      let axial = 0;
      for (let k = 0; k < VEC3; k += 1) {
        axial += (units.lambda[UNIT_ROWS * u + STRETCH_ROW + k] ?? 0) * (pivotAxis[VEC3 * d + k] ?? 0);
      }
      device.hubForceSum += axial / (l * h2);
    }
    let tip = 0;
    for (let i = Math.max(0, rod.segmentCount + 1 - settings.tipForceNodes); i <= rod.segmentCount; i += 1) {
      tip += rod.contactForce[i] ?? 0;
    }
    device.tipForceSum += tip;

    const linear = 1 - settings.linearDamping * h;
    const angular = 1 - settings.angularDamping * h;
    for (let i = device.firstOwned; i <= rod.segmentCount; i += 1) {
      const o = VEC3 * i;
      for (let k = 0; k < VEC3; k += 1) {
        rod.v[o + k] = (((rod.x[o + k] ?? 0) - (rod.xPrev[o + k] ?? 0)) / h) * linear;
      }
    }
    for (let j = Math.max(0, device.firstOwned - 1); j < rod.segmentCount; j += 1) {
      // World angular velocity from q = Δ ⊗ qPrev, so Δ = q ⊗ conj(qPrev) and ω = 2·Im(Δ)/h on the shortest arc.
      const ax = rod.q[QUAT * j] ?? 0;
      const ay = rod.q[QUAT * j + Y] ?? 0;
      const az = rod.q[QUAT * j + Z] ?? 0;
      const aw = rod.q[QUAT * j + W] ?? 1;
      const bx = -(rod.qPrev[QUAT * j] ?? 0);
      const by = -(rod.qPrev[QUAT * j + Y] ?? 0);
      const bz = -(rod.qPrev[QUAT * j + Z] ?? 0);
      const bw = rod.qPrev[QUAT * j + W] ?? 1;
      const dw = aw * bw - ax * bx - ay * by - az * bz;
      const sign = dw < 0 ? -1 : 1;
      const scale = ((2 * sign) / h) * angular;
      const o = VEC3 * j;
      rod.omega[o] = (aw * bx + ax * bw + ay * bz - az * by) * scale;
      rod.omega[o + Y] = (aw * by - ax * bz + ay * bw + az * bx) * scale;
      rod.omega[o + Z] = (aw * bz + ax * by - ay * bx + az * bw) * scale;
    }
    device.ownedBefore.fill(0, 0, device.firstOwned);
    device.ownedBefore.fill(1, device.firstOwned);
  });

  // Inner nodes inside an owner follow its corrected centerline (for snapshots and the next substep).
  for (let d = 1; d < devices.length; d += 1) {
    const device = devices[d] as PhysicsDevice;
    const rod = device.rod;
    for (let i = device.firstDynamic; i < device.firstOwned && i <= rod.segmentCount; i += 1) {
      const arc = arcOfNode(rod, device.currentInserted, i);
      const owner = ownerOfArc(world, d, arc);
      if (owner >= 0) {
        const ownerDevice = devices[owner] as PhysicsDevice;
        centerlinePoint(ownerDevice.rod, ownerDevice.currentInserted, arc, rod.x, VEC3 * i);
      }
    }
  }
}
