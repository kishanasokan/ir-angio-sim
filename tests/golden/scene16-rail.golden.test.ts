import { describe, expect, it } from 'vitest';
import { engineSettings, tierParams } from '../../src/data/simConfig';
import { projectOntoCenterline } from '../../src/sim/anatomy/graph';
import type { SimEngine } from '../../src/sim/engine';
import { repository } from '../helpers/repository';
import { DEG, drive, fullSpeed, MM, phantom, rodModelOn, sceneEngine, SHEATH, tipPosition } from './helpers';

// Golden scene 16 (spec 04 §7): the rail fallback tier. Golden scene 8's setup on the fallback tier puts the
// Glidewire's tip in c-left at hub rotation 0 and in c-right at 180°, and a rail device never leaves the centerline.
// Also: pulling the tip back behind the carina forgets the branch, so turning it chooses again; a catheter follows
// the wire's branch; and a cap stops the tip while the extra push raises the hub force at rail.capStiffness.

const TIER = 'fallback';
const CARINA = 150 * MM;
const ADVANCE = 80 * MM;
const SPEED = 10 * MM;
const ON_CENTERLINE = 1e-9;

function steps(distance: number): number {
  return Math.round((distance / SPEED) * tierParams(repository(), TIER).stepRate);
}

/** Largest distance of any free node of any device from the nearest anatomy centerline, m. */
function offCenterline(engine: SimEngine): number {
  let worst = 0;
  for (let d = 0; d < engine.deviceCount; d += 1) {
    const { rod } = engine.device(d);
    for (let i = 0; i <= rod.segmentCount; i += 1) {
      if (rod.kinematic[i] === 1) {
        continue;
      }
      const x = rod.x[3 * i] ?? 0;
      const y = rod.x[3 * i + 1] ?? 0;
      const z = rod.x[3 * i + 2] ?? 0;
      const nearest = Math.min(
        ...engine.currentAnatomy.segments.map((segment) => projectOntoCenterline(segment, x, y, z).distance),
      );
      worst = Math.max(worst, nearest);
    }
  }
  return worst;
}

describe('golden scene 16 · rail branch selection', () => {
  it.each([
    [0, 'c-left'],
    [180, 'c-right'],
  ])('at hub rotation %i° the tip enters %s and stays on the centerline', (rotation, branch) => {
    const engine = sceneEngine(
      phantom('phantom-c-bifurcation'),
      [
        {
          spec: rodModelOn('rm-glidewire-035-angled-150', TIER),
          pastSheathTip: CARINA - 60 * MM,
          rotation: rotation * DEG,
        },
      ],
      undefined,
      TIER,
    );
    let worst = 0;
    drive(engine, steps(ADVANCE), { innerPush: SPEED / fullSpeed().advance }, () => {
      worst = Math.max(worst, offCenterline(engine));
    });
    expect(engine.device(0).tipSegmentId).toBe(branch);
    const entered = engine.drainEvents().filter((event) => event.type === 'tip-entered-segment');
    expect(entered.at(-1)).toMatchObject({ segment: branch });
    expect(worst).toBeLessThan(ON_CENTERLINE);
  });

  it('chooses again after a pull-back behind the carina, and the catheter follows the wire', () => {
    const engine = sceneEngine(
      phantom('phantom-c-bifurcation'),
      [
        { spec: rodModelOn('rm-berenstein-5f-65', TIER), pastSheathTip: CARINA - 80 * MM },
        { spec: rodModelOn('rm-glidewire-035-angled-150', TIER), pastSheathTip: CARINA - 60 * MM },
      ],
      undefined,
      TIER,
    );
    const push = SPEED / fullSpeed().advance;
    drive(engine, steps(ADVANCE), { innerPush: push });
    expect(engine.device(1).tipSegmentId).toBe('c-left');
    // The catheter follows the wire into c-left.
    drive(engine, steps(100 * MM), { outerPush: push });
    expect(engine.device(0).tipSegmentId).toBe('c-left');
    // Both back behind the carina, the wire turned half a turn, then the wire forward again: c-right.
    drive(engine, steps(110 * MM), { outerPush: -push, innerPush: -push });
    const half = Math.PI / fullSpeed().rotate;
    drive(engine, Math.round(half * tierParams(repository(), TIER).stepRate), { innerRotate: 1 });
    // The wire tip is 60 mm past the sheath tip again: forward to 20 mm past the carina, as before.
    drive(engine, steps(110 * MM), { innerPush: push });
    expect(engine.device(1).tipSegmentId).toBe('c-right');
    expect(offCenterline(engine)).toBeLessThan(ON_CENTERLINE);
  });

  it('stops the tip at a cap and turns the extra push into hub force', () => {
    const engine = sceneEngine(
      phantom('phantom-a-straight'),
      [{ spec: rodModelOn('rm-glidewire-035-angled-150', TIER), pastSheathTip: 280 * MM }],
      undefined,
      TIER,
    );
    const extra = 40 * MM;
    drive(engine, steps(20 * MM + extra), { innerPush: SPEED / fullSpeed().advance });
    const { physics, feedback } = engineSettings(repository());
    const device = engine.device(0);
    const radius = device.rod.outerRadius[device.rod.segmentCount - 1] ?? 0;
    // The cap's allowed surface: phantom A's 4 mm radius less the wire's radius and the margin, past z = 300 mm.
    const capZ = 300 * MM + (4 * MM - radius - physics.lumenMargin);
    expect(tipPosition(engine, 0)[2]).toBeCloseTo(capZ, 9);
    // Insertion counts from the sheath valve, one sheath length behind the access at z = 0.
    const excess = device.inserted - (SHEATH() + capZ);
    expect(excess).toBeGreaterThan(extra - 5 * MM);
    expect(device.hubForce).toBeCloseTo(physics.railCapStiffness * excess, 9);
    expect(device.hubForce).toBeGreaterThan(feedback.hubForceDanger);
    expect(engine.drainEvents().some((event) => event.type === 'hub-force-danger')).toBe(true);
  });
});
