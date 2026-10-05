import { describe, expect, it } from 'vitest';
import { buildLumen } from '../../src/sim/anatomy/lumen';
import { createLumenHit } from '../../src/sim/anatomy/lumen';
import { sin } from '../../src/sim/math/detTrig';
import { quatAxis, quatFromAxisAngle, quatMultiply } from '../../src/sim/math/quat';
import { buildRod, rodKineticEnergy } from '../../src/sim/rod/build';
import {
  accumulateTwist,
  arcOfNode,
  centerlinePoint,
  innerBending,
  innerRestChord,
  jointTwist,
  segmentAtArc,
} from '../../src/sim/rod/coaxial';
import {
  createContactQuery,
  dampPredictedSliding,
  dampPredictedSpin,
  probeLumen,
  slidingDamping,
  twistDamping,
} from '../../src/sim/rod/contact';
import {
  createAccessFrame,
  hubQuaternion,
  isKinematicArc,
  placeKinematic,
  placeStraight,
} from '../../src/sim/rod/insertion';
import { catheterK, freeSpace, MM, phantom, wireW } from '../golden/helpers';

const DEG = Math.PI / 180;
const axis = (q: Float64Array, offset: number, which: number) => {
  const out = new Float64Array(3);
  quatAxis(q, offset, which, out, 0);
  return [...out];
};
const close = (actual: readonly number[], expected: readonly number[], limit = 1e-12) =>
  actual.forEach((value, k) => expect(Math.abs(value - (expected[k] ?? 0))).toBeLessThan(limit));

describe('rod build', () => {
  it('lumps half of each segment mass on its nodes', () => {
    const spec = wireW();
    const rod = buildRod(spec);
    const total = spec.segments.massPerLength.reduce((sum, m) => sum + m * spec.segments.length, 0);
    expect(rod.mass.reduce((sum, m) => sum + m, 0)).toBeCloseTo(total, 15);
    expect(rod.mass[0]).toBeCloseTo(0.5 * (spec.segments.massPerLength[0] ?? 0) * spec.segments.length, 15);
  });

  it('stores rest chords that turn each joint exactly its share of the bend toward d1 (D9)', () => {
    const rod = buildRod(catheterK());
    let total = 0;
    for (let j = 0; j + 1 < rod.segmentCount; j += 1) {
      const chordY = rod.restChord[3 * j + 1] ?? 0;
      expect(Math.abs(rod.restChord[3 * j] ?? 0)).toBe(0);
      // |chord| = 2·sin(θ/2) about +d2, so a bend toward d1.
      total += 2 * Math.asin(chordY / 2);
    }
    expect(total / DEG).toBeCloseTo(60, 9);
    expect(rod.jointBending[0]).toBeCloseTo(
      0.5 * ((rod.bendingStiffness[0] ?? 0) + (rod.bendingStiffness[1] ?? 0)),
      18,
    );
  });

  it('counts kinetic energy of free nodes and segments only', () => {
    const rod = buildRod(wireW());
    rod.v[3 * 10] = 2;
    rod.v[3 * rod.segmentCount + 2] = 1;
    const tip = 0.5 * (rod.mass[rod.segmentCount] ?? 0);
    expect(rodKineticEnergy(rod, rod.segmentCount)).toBeCloseTo(tip, 18);
    expect(rodKineticEnergy(rod, 0)).toBeCloseTo(tip + 0.5 * (rod.mass[10] ?? 0) * 4, 18);
  });
});

describe('insertion', () => {
  const frame = createAccessFrame([0, 0, 0], [0, 0, 1], 0.11);

  it('puts the valve one sheath length behind the access node, with d1 = +x at hub rotation 0', () => {
    close([...frame.valve], [0, 0, -0.11]);
    close(axis(frame.q, 0, 0), [1, 0, 0]);
    close(axis(frame.q, 0, 2), [0, 0, 1]);
  });

  it('turns d1 by φ about the access axis', () => {
    const q = new Float64Array(4);
    hubQuaternion(frame, 90 * DEG, q, 0);
    close(axis(q, 0, 0), [0, 1, 0]);
    close(axis(q, 0, 2), [0, 0, 1]);
  });

  it('places nodes proximal to the sheath tip on the axis and finds the first dynamic node', () => {
    const rod = buildRod(wireW());
    const inserted = 0.11 + 50 * MM;
    placeStraight(rod, frame, inserted, 0);
    const first = placeKinematic(rod, frame, inserted, 0, 0.01, 0.5);
    expect(isKinematicArc(frame, arcOfNode(rod, inserted, first - 1))).toBe(true);
    expect(isKinematicArc(frame, arcOfNode(rod, inserted, first))).toBe(false);
    // The node exactly at the sheath tip is kinematic (D10).
    expect(arcOfNode(rod, inserted, first - 1)).toBeCloseTo(0.11, 12);
    close(
      [rod.x[3 * (first - 1)] ?? 0, rod.x[3 * (first - 1) + 1] ?? 0, rod.x[3 * (first - 1) + 2] ?? 0],
      [0, 0, 0],
    );
    expect(rod.v[3 * 5 + 2]).toBeCloseTo(0.01, 15);
    expect(rod.omega[3 * 5 + 2]).toBeCloseTo(0.5, 15);
    expect(rod.kinematic[first - 1]).toBe(1);
    expect(rod.kinematic[first]).toBe(0);
    // Searching from a hint near the boundary finds the same node.
    expect(placeKinematic(rod, frame, inserted, 0, 0.01, 0.5, first + 3)).toBe(first);
    expect(placeKinematic(rod, frame, inserted, 0, 0.01, 0.5, Math.max(0, first - 7))).toBe(first);
  });
});

describe('coaxial helpers', () => {
  const rod = buildRod(wireW());
  const frame = createAccessFrame([0, 0, 0], [0, 0, 1], 0.11);
  const inserted = 0.2;
  placeStraight(rod, frame, inserted, 0);

  it('measures arcs from the valve and interpolates the centerline, extending past the tip', () => {
    expect(arcOfNode(rod, inserted, rod.segmentCount)).toBeCloseTo(inserted, 15);
    const point = new Float64Array(3);
    centerlinePoint(rod, inserted, 0.15, point, 0);
    close([...point], [0, 0, 0.04]);
    centerlinePoint(rod, inserted, inserted + 5 * MM, point, 0);
    close([...point], [0, 0, 0.09 + 5 * MM]);
    expect(segmentAtArc(rod, inserted, inserted - 0.5 * MM)).toBe(rod.segmentCount - 1);
    expect(innerBending(rod, inserted, 0.15)).toBe(rod.bendingStiffness[0]);
  });

  it('reads a pure twist between segments and accumulates it from the first dynamic segment', () => {
    const twist = new Float64Array(rod.segmentCount);
    const scratch = new Float64Array(4);
    const turn = new Float64Array(4);
    quatFromAxisAngle(0, 0, 1, 10 * DEG, turn, 0);
    const last = rod.segmentCount - 1;
    quatMultiply(rod.q, 4 * (last - 1), turn, 0, rod.q, 4 * last);
    expect(jointTwist(rod, last - 1, scratch) / DEG).toBeCloseTo(10, 9);
    accumulateTwist(rod, last - 3, twist, scratch);
    expect(twist[last]! / DEG).toBeCloseTo(10, 9);
    expect(twist[last - 1]).toBe(0);
    placeStraight(rod, frame, inserted, 0);
  });

  it("turns an inner device's rest chord by ψ into the outer frame", () => {
    const catheter = buildRod(catheterK());
    const cathInserted = 0.2;
    const out = new Float64Array(2);
    const jointArc = arcOfNode(catheter, cathInserted, catheter.segmentCount - 1);
    innerRestChord(catheter, cathInserted, jointArc, 0, out);
    const straight = [out[0]!, out[1]!];
    innerRestChord(catheter, cathInserted, jointArc, 90 * DEG, out);
    close([out[0]!, out[1]!], [-straight[1]!, straight[0]!]);
  });
});

describe('contact helpers', () => {
  it('finds no contact in free space and the outward normal outside a phantom wall', () => {
    const hit = createLumenHit();
    const query = createContactQuery();
    expect(probeLumen(buildLumen(freeSpace(), 0.01), hit, 0, 0, 0, 0.0004, 0.00002, query)).toBe(false);
    const lumen = buildLumen(phantom('phantom-a-straight'), 0.01);
    expect(probeLumen(lumen, hit, 0.005, 0, 0.05, 0.0004, 0.00002, query)).toBe(true);
    expect(query.violation).toBeGreaterThan(0);
    close([...query.normal], [1, 0, 0]);
  });

  it('turns Coulomb friction into damping that opposes sliding and spin', () => {
    const rod = buildRod(wireW());
    const node = 50;
    rod.contactForce[node] = 0.2;
    rod.contactNormal.set([1, 0, 0], 3 * node);
    rod.v.set([0.3, 0, 0.004], 3 * node);
    // Sliding at 4 mm/s against μN = 0.04 N: c = 0.04 / 0.004.
    expect(slidingDamping(rod, node, 0.2, 0.001)).toBeCloseTo(0.04 / 0.004, 12);
    // Below the slip speed the damping saturates.
    rod.v.set([0.3, 0, 0.0001], 3 * node);
    expect(slidingDamping(rod, node, 0.2, 0.001)).toBeCloseTo(0.04 / 0.001, 12);
    expect(slidingDamping(rod, node, 0, 0.001)).toBe(0);
    rod.omega.set([0, 0, 3], 3 * (node - 1));
    const tangent = new Float64Array([0, 0, 1]);
    expect(twistDamping(rod, node - 1, node, tangent, 0.2, 0.1)).toBeCloseTo(
      (0.04 * (rod.outerRadius[0] ?? 0)) / 3,
      15,
    );
  });

  it('damps only the tangential part of a predicted move, and spin only about the tangent', () => {
    const rod = buildRod(wireW());
    const node = 20;
    rod.contactNormal.set([1, 0, 0], 3 * node);
    rod.v.set([0.2, 0.1, 0.4], 3 * node);
    rod.x.set([0, 0, 0], 3 * node);
    dampPredictedSliding(rod, node, 0.001, 0.25);
    close(
      [rod.x[3 * node]!, rod.x[3 * node + 1]!, rod.x[3 * node + 2]!],
      [0, -0.001 * 0.75 * 0.1, -0.001 * 0.75 * 0.4],
    );
    const segment = 7;
    rod.omega.set([0, 0, 2], 3 * segment);
    dampPredictedSpin(rod, segment, new Float64Array([0, 0, 1]), 0.001, 0.5);
    // Turned back by h·(1 − keep)·ω = 0.001 rad about z, with the predictor's first-order rotation update.
    close(axis(rod.q, 4 * segment, 0), [Math.cos(-0.001), sin(-0.001), 0], 1e-9);
    close(axis(rod.q, 4 * segment, 2), [0, 0, 1]);
  });
});
