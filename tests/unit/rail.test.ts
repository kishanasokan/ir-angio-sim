import { describe, expect, it } from 'vitest';
import { createRailWorld, railStep, restBendAngle, type RailDevice } from '../../src/sim/rail/rail';
import { buildRod } from '../../src/sim/rod/build';
import { createAccessFrame } from '../../src/sim/rod/insertion';
import type { SimAnatomy } from '../../src/sim/anatomy/graph';
import { MM, phantom, rodModelOn, wireW } from '../golden/helpers';

// The rail model's pure parts (spec 04 §6, §7): the path builder, branch choice by the tip's bend, forgetting a
// branch every tip has left, and the cap limit.

const SHEATH = 110 * MM;
const DEG = Math.PI / 180;

function setup(anatomy: SimAnatomy, devices: readonly Omit<RailDevice, 'bendAngle'>[], bendAngle = 0) {
  const access = anatomy.access[0]!;
  const frame = createAccessFrame(access.position, access.direction, SHEATH);
  const world = createRailWorld(anatomy, frame, access.node, devices.length, 25, 0.02 * MM);
  const inputs = devices.map((device) => ({ ...device, bendAngle }));
  return { world, inputs };
}

describe('rail model', () => {
  const c = phantom('phantom-c-bifurcation');

  it('starts its path at the valve, through the sheath, along the access segment to the first junction', () => {
    const { world } = setup(c, []);
    expect(world.arcs[0]).toBe(0);
    expect(world.arcs[1]).toBeCloseTo(SHEATH, 12);
    expect(world.parts).toBe(1);
    // Phantom C's parent segment ends at the carina, 150 mm past the access.
    expect(world.arcs[world.count - 1]).toBeCloseTo(SHEATH + 150 * MM, 9);
    expect(world.endNode).not.toBe(c.access[0]!.node);
  });

  it('chooses the daughter the bent tip points to, and the straight one when the tip is straight', () => {
    const wire = rodModelOn('rm-glidewire-035-angled-150', 'fallback');
    const depth = SHEATH + 170 * MM;
    for (const [d1, branch] of [
      [1, 'c-left'],
      [-1, 'c-right'],
    ] as const) {
      const rod = buildRod(wire);
      const { world, inputs } = setup(
        c,
        [{ rod, inserted: depth, rotation: 0, bendD1: d1, bendD2: 0 }],
        restBendAngle(rod),
      );
      railStep(world, inputs, 0);
      expect(c.segments[world.partSegment[world.parts - 1]!]?.id).toBe(branch);
    }
    expect(restBendAngle(buildRod(wire))).toBeCloseTo(45 * DEG, 9);
    expect(restBendAngle(buildRod(wireW()))).toBe(0);
  });

  it('forgets a branch once every tip is back behind the junction', () => {
    const rod = buildRod(rodModelOn('rm-glidewire-035-angled-150', 'fallback'));
    const { world, inputs } = setup(
      c,
      [{ rod, inserted: SHEATH + 170 * MM, rotation: 0, bendD1: 1, bendD2: 0 }],
      1,
    );
    railStep(world, inputs, 0);
    expect(world.parts).toBe(2);
    inputs[0]!.inserted = SHEATH + 140 * MM;
    railStep(world, inputs, 0);
    expect(world.parts).toBe(1);
  });

  it('stops the tip at a cap and reports the push beyond it', () => {
    const a = phantom('phantom-a-straight');
    const rod = buildRod(wireW());
    const { world, inputs } = setup(a, [
      { rod, inserted: SHEATH + 320 * MM, rotation: 0, bendD1: 0, bendD2: 0 },
    ]);
    const result = railStep(world, inputs, 0);
    const radius = rod.outerRadius[rod.segmentCount - 1]!;
    const limit = SHEATH + 300 * MM + (4 * MM - radius - 0.02 * MM);
    expect(result.excess[0]).toBeCloseTo(SHEATH + 320 * MM - limit, 12);
    expect(result.hubForce[0]).toBeCloseTo(25 * result.excess[0]!, 12);
    expect(rod.x[3 * rod.segmentCount + 2]).toBeCloseTo(limit - SHEATH, 12);
  });
});
