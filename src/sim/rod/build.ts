import { QUAT, VEC3, W, X, Y } from '../core/types';
import type { SimDeviceSpec } from '../devices/instance';
import { sin } from '../math/detTrig';
import { cylinderInertia } from '../math/geometry';
import type { RodState } from './state';

/**
 * Builds a rod from a device instance: node masses (half of each adjacent segment), segment inertias, joint
 * stiffness and the rest shape. Positions and orientations start at the identity; insertion.ts places the rod.
 */
export function buildRod(spec: SimDeviceSpec): RodState {
  const n = spec.segments.count;
  const l = spec.segments.length;
  const nodes = n + 1;
  const joints = Math.max(0, n - 1);
  const rod: RodState = {
    rodModelId: spec.rodModelId,
    segmentCount: n,
    segmentLength: l,
    x: new Float64Array(VEC3 * nodes),
    xPrev: new Float64Array(VEC3 * nodes),
    v: new Float64Array(VEC3 * nodes),
    mass: new Float64Array(nodes),
    force: new Float64Array(VEC3 * nodes),
    kinematic: new Uint8Array(nodes),
    q: new Float64Array(QUAT * n),
    qPrev: new Float64Array(QUAT * n),
    omega: new Float64Array(VEC3 * n),
    inertiaPerpendicular: new Float64Array(n),
    inertiaAxial: new Float64Array(n),
    outerRadius: new Float64Array(spec.segments.outerRadius),
    innerRadius: new Float64Array(spec.segments.innerRadius),
    bendingStiffness: new Float64Array(spec.segments.bendingStiffness),
    torsionalStiffness: new Float64Array(spec.segments.torsionalStiffness),
    massPerLength: new Float64Array(spec.segments.massPerLength),
    restChord: new Float64Array(VEC3 * joints),
    jointBending: new Float64Array(joints),
    jointTorsion: new Float64Array(joints),
    contactForce: new Float64Array(nodes),
    contactNormal: new Float64Array(VEC3 * nodes),
  };

  for (let j = 0; j < n; j += 1) {
    const segmentMass = (rod.massPerLength[j] ?? 0) * l;
    rod.mass[j] = (rod.mass[j] ?? 0) + 0.5 * segmentMass;
    rod.mass[j + 1] = (rod.mass[j + 1] ?? 0) + 0.5 * segmentMass;
    const inertia = cylinderInertia(segmentMass, rod.outerRadius[j] ?? 0, rod.innerRadius[j] ?? 0, l);
    rod.inertiaPerpendicular[j] = inertia.perpendicular;
    rod.inertiaAxial[j] = inertia.axial;
    rod.q[QUAT * j + W] = 1;
    rod.qPrev[QUAT * j + W] = 1;
  }

  const { towardD1, towardD2 } = spec.restShape.distribution;
  for (let j = 0; j < joints; j += 1) {
    rod.jointBending[j] = 0.5 * ((rod.bendingStiffness[j] ?? 0) + (rod.bendingStiffness[j + 1] ?? 0));
    rod.jointTorsion[j] = 0.5 * ((rod.torsionalStiffness[j] ?? 0) + (rod.torsionalStiffness[j + 1] ?? 0));
    // A bend toward d1 is a rotation about +d2; toward d2, about −d1. The rest relative rotation of the joint is
    // the rotation vector ρ = (−a2, a1, 0); storing 2·sin(|ρ|/2)·ρ̂ makes the joint form exactly |ρ| at rest (D9).
    const a1 = towardD1[j] ?? 0;
    const a2 = towardD2[j] ?? 0;
    const angle = Math.sqrt(a1 * a1 + a2 * a2);
    if (angle > 0) {
      const chordPerRadian = (2 * sin(0.5 * angle)) / angle;
      rod.restChord[VEC3 * j + X] = -a2 * chordPerRadian;
      rod.restChord[VEC3 * j + Y] = a1 * chordPerRadian;
    }
  }
  return rod;
}

/**
 * Total kinetic energy of the rod's free part, J: nodes from `firstOwned` and the segments ending at them. Kinematic
 * nodes and nodes carried inside another device have no kinetic energy of their own.
 */
export function rodKineticEnergy(rod: RodState, firstOwned: number): number {
  let energy = 0;
  for (let i = firstOwned; i <= rod.segmentCount; i += 1) {
    const o = VEC3 * i;
    const vx = rod.v[o] ?? 0;
    const vy = rod.v[o + 1] ?? 0;
    const vz = rod.v[o + 2] ?? 0;
    energy += 0.5 * (rod.mass[i] ?? 0) * (vx * vx + vy * vy + vz * vz);
  }
  for (let j = Math.max(0, firstOwned - 1); j < rod.segmentCount; j += 1) {
    const o = VEC3 * j;
    const wx = rod.omega[o] ?? 0;
    const wy = rod.omega[o + 1] ?? 0;
    const wz = rod.omega[o + 2] ?? 0;
    // Spin about d3 uses the axial inertia, the rest the perpendicular one.
    const qo = QUAT * j;
    const qx = rod.q[qo] ?? 0;
    const qy = rod.q[qo + 1] ?? 0;
    const qz = rod.q[qo + 2] ?? 0;
    const qw = rod.q[qo + W] ?? 1;
    const d3x = 2 * (qx * qz + qy * qw);
    const d3y = 2 * (qy * qz - qx * qw);
    const d3z = 1 - 2 * (qx * qx + qy * qy);
    const spin = wx * d3x + wy * d3y + wz * d3z;
    const total2 = wx * wx + wy * wy + wz * wz;
    energy +=
      0.5 * (rod.inertiaAxial[j] ?? 0) * spin * spin +
      0.5 * (rod.inertiaPerpendicular[j] ?? 0) * Math.max(0, total2 - spin * spin);
  }
  return energy;
}
