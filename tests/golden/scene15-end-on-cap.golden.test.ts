import { describe, expect, it } from 'vitest';
import { buildLumen, createLumenHit, queryLumen } from '../../src/sim/anatomy/lumen';
import { engineSettings } from '../../src/data/simConfig';
import { repository } from '../helpers/repository';
import { demoParam } from './demo';
import {
  cathFrame,
  fullSpeed,
  maxStretchError,
  MM,
  phantom,
  sceneEngine,
  tipPosition,
  WIRE_W_MODULUS_FACT,
  wireWithModulus,
} from './helpers';

// Golden scene 15 (spec 04 §7): a perfectly straight rod pushed end-on into phantom A's cap. Its contact row is a
// combination of its stretch rows, so the first solve at the cap is singular; the fallback of spec 04 §3.2 tilts the
// contact normals and the rod gives way sideways. Wire W at 600 mm reaches the cap with room to buckle. It starts
// 50 mm short of the cap and is pushed at sandbox-a-buckle's speed until 10 mm past the first contact, where the hub
// force is already over 15 N. Pushed further the rod locks up as a helix in the rigid tube: at 20 mm the standard
// tier's largest stretch is 0.44% at over 30 N, and beyond 30 mm one linearization per substep no longer holds 0.5%
// (docs/M2-plan.md Progress log). The hand-force ceiling of spec 04 open question 2 belongs with the case engine (M3).

const START_SHORT = 50 * MM;
const PAST_CONTACT = 10 * MM;
const WIRE_LENGTH_MM = 600;
const CAP_DEPTH = 300 * MM;
const SLACK = 0.05 * MM;
const STRETCH_LIMIT = 0.005;
const TIP_ADVANCE_LIMIT = 2 * MM;
const TIERS = ['high', 'standard'] as const;

describe.each(TIERS)('golden scene 15 · end-on push into a cap, %s tier', (tierId) => {
  it('falls back to tilted contact normals, buckles, and keeps the rod inside the lumen and inextensible', () => {
    const engine = sceneEngine(
      phantom('phantom-a-straight'),
      [
        {
          spec: wireWithModulus('w600', WIRE_W_MODULUS_FACT, tierId, WIRE_LENGTH_MM),
          pastSheathTip: CAP_DEPTH - START_SHORT,
        },
      ],
      undefined,
      tierId,
    );
    const { physics, feedback } = engineSettings(repository());
    const lumen = buildLumen(engine.currentAnatomy, physics.lumenGridCell);
    const hit = createLumenHit();
    const speed = demoParam('sandbox-a-buckle', 'pushSpeed');
    const push = speed / fullSpeed().advance;
    const maxSteps = Math.round(((START_SHORT + PAST_CONTACT) / speed) * engine.stepRate * 2);
    let contactInserted = Number.NaN;
    let contactTip = Number.NaN;
    let furthestTip = Number.NEGATIVE_INFINITY;
    let deepest = Number.POSITIVE_INFINITY;
    let worstStretch = 0;
    let maxHub = 0;
    for (let n = 0; n < maxSteps; n += 1) {
      engine.step(cathFrame(engine.currentStep, { innerPush: push }));
      const device = engine.device(0);
      const { rod } = device;
      for (let i = 1; i <= rod.segmentCount; i += 1) {
        if (rod.kinematic[i] === 1) {
          continue;
        }
        const o = 3 * i;
        queryLumen(
          lumen,
          rod.x[o] ?? 0,
          rod.x[o + 1] ?? 0,
          rod.x[o + 2] ?? 0,
          rod.outerRadius[i - 1] ?? 0,
          physics.lumenMargin,
          hit,
        );
        deepest = Math.min(deepest, hit.depth);
      }
      worstStretch = Math.max(worstStretch, maxStretchError(engine, 0));
      const tip = tipPosition(engine, 0)[2];
      if (Number.isNaN(contactInserted) && device.tipForce > 0) {
        contactInserted = device.inserted;
        contactTip = tip;
      }
      if (!Number.isNaN(contactInserted)) {
        furthestTip = Math.max(furthestTip, tip);
        maxHub = Math.max(maxHub, device.hubForce);
        if (device.inserted - contactInserted >= PAST_CONTACT) {
          break;
        }
      }
    }
    const device = engine.device(0);
    console.info(
      `${tierId}: ${engine.contactFallbacks} substep(s) rescued by tilted normals, ` +
        `${engine.compliantFallbacks} by compliant contact, ${engine.solveFailures} failed; ` +
        `hub ${((device.inserted - contactInserted) / MM).toFixed(2)} mm and tip ` +
        `${((furthestTip - contactTip) / MM).toFixed(3)} mm past contact; deepest excursion ` +
        `${(Math.max(0, -deepest) / MM).toFixed(4)} mm; largest stretch ${(worstStretch * 100).toFixed(3)}%; ` +
        `largest hub force ${maxHub.toFixed(2)} N`,
    );
    // The scene reaches the cap, pushes the full distance, and exercises the fallback.
    expect(device.inserted - contactInserted).toBeGreaterThanOrEqual(PAST_CONTACT);
    expect(engine.contactFallbacks).toBeGreaterThan(0);
    expect(engine.compliantFallbacks).toBe(0);
    expect(engine.solveFailures).toBe(0);
    // The push is stored as buckling, felt at the hub, with the rod inside the lumen and inextensible.
    expect(furthestTip - contactTip).toBeLessThan(TIP_ADVANCE_LIMIT);
    expect(maxHub).toBeGreaterThan(feedback.hubForceDanger);
    expect(deepest).toBeGreaterThanOrEqual(-SLACK);
    expect(worstStretch).toBeLessThan(STRETCH_LIMIT);
  });
});
