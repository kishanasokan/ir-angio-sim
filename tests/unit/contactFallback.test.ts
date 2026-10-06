import { describe, expect, it } from 'vitest';
import { buildLumen, createLumenHit, queryLumen } from '../../src/sim/anatomy/lumen';
import type { SimConfig } from '../../src/sim/engine';
import { engineSettings } from '../../src/data/simConfig';
import { repository } from '../helpers/repository';
import { cathFrame, MM, phantom, sceneEngine, WIRE_W_MODULUS_FACT, wireWithModulus } from '../golden/helpers';

// The degenerate-contact fallback chain (spec 04 §3.2) on a singular system: a straight rod pressed end-on into
// phantom A's cap. Each step of the chain is reached by switching off the ones before it.

const START_SHORT = 2 * MM;
const STEPS = 400;
const CAP_DEPTH = 300 * MM;
const SLACK = 0.05 * MM;

function pushIntoCap(physics: Partial<SimConfig['physics']>) {
  const engine = sceneEngine(
    phantom('phantom-a-straight'),
    [{ spec: wireWithModulus('w', WIRE_W_MODULUS_FACT), pastSheathTip: CAP_DEPTH - START_SHORT }],
    undefined,
    'high',
    physics,
  );
  const settings = engineSettings(repository()).physics;
  const lumen = buildLumen(engine.currentAnatomy, settings.lumenGridCell);
  const hit = createLumenHit();
  let deepest = Number.POSITIVE_INFINITY;
  for (let n = 0; n < STEPS; n += 1) {
    engine.step(cathFrame(engine.currentStep, { innerPush: 1 }));
    const { rod } = engine.device(0);
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
        settings.lumenMargin,
        hit,
      );
      deepest = Math.min(deepest, hit.depth);
    }
  }
  return { engine, deepest };
}

describe('degenerate-contact fallback chain', () => {
  it('rescues the singular solve by tilting the contact normals (step 1)', () => {
    const { engine, deepest } = pushIntoCap({});
    expect(engine.contactFallbacks).toBeGreaterThan(0);
    expect(engine.compliantFallbacks).toBe(0);
    expect(engine.solveFailures).toBe(0);
    expect(deepest).toBeGreaterThanOrEqual(-SLACK);
  });

  it('without a tilt, solves with compliant contact rows (step 2)', () => {
    const { engine } = pushIntoCap({ symmetryBreak: 0 });
    expect(engine.contactFallbacks).toBe(0);
    expect(engine.compliantFallbacks).toBeGreaterThan(0);
    expect(engine.solveFailures).toBe(0);
  });

  it('without either, counts failed solves and projects the nodes back into the lumen (step 3)', () => {
    const { engine, deepest } = pushIntoCap({ symmetryBreak: 0, contactFallbackCompliance: 0 });
    expect(engine.contactFallbacks).toBe(0);
    expect(engine.compliantFallbacks).toBe(0);
    expect(engine.solveFailures).toBeGreaterThan(0);
    expect(deepest).toBeGreaterThanOrEqual(-SLACK);
  });
});
