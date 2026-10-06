import { describe, expect, it } from 'vitest';
import { bendingStiffness } from '../../src/data/catalog';
import { valueToSI } from '../../src/data/units';
import { repository } from '../helpers/repository';
import {
  cathFrame,
  freeSpace,
  maxStretchError,
  MM,
  phantom,
  sceneEngine,
  settle,
  tipPosition,
  wireWithModulus,
} from './helpers';

// Spec 01 §15, open question 1, measured for M2: does the solver hold the stiffest rail wires (up to 158 GPa
// effective modulus, harrison2011) on both rod tiers? Wire R is wire W with the flexural modulus of the stiffest wire
// in /data, the Lunderquist Extra Stiff (sourced). Each check uses an M1 golden scene's own criterion:
// - scene 1's cantilever, with the tip load scaled by the stiffness ratio so the expected deflection is again 1.43 mm,
//   within 5%;
// - scene 3's push-pull with full-speed rotation in phantom B, through wall contact at the bend, segments within 0.5%
//   at every step.
// A perfectly straight rod pushed end-on into a cap makes the solve singular whatever its stiffness; that is a contact
// question, answered by spec 04 §3.2 and golden scene 15, not a stiffness one.

const STIFFEST = 'gw-lunderquist-cook';
const WIRE_W_MODULUS = valueToSI(9.5, 'GPa');
const SCENE1_FORCE = 0.01;
const SCENE1_FREE = 50 * MM;
const CANTILEVER_TOLERANCE = 0.05;
const STRETCH_LIMIT = 0.005;
const PUSH_PERIOD = 0.25;
const ROTATE_PERIOD = 0.5;
const SCENE3_DURATION = 2;
const BEND_START = 100 * MM;
const MAX_SETTLE_STEPS = 20_000;
const TIERS = ['high', 'standard'] as const;

function stiffestModulus(): {
  readonly fact: { readonly confidence: string; readonly [key: string]: unknown };
  readonly si: number;
} {
  const fact = repository().devices.get(STIFFEST)?.mechanics?.bodyFlexuralModulus;
  if (fact === undefined || typeof fact.value !== 'number' || typeof fact.unit !== 'string') {
    throw new Error(`${STIFFEST} has no numeric mechanics.bodyFlexuralModulus in /data.`);
  }
  return { fact, si: valueToSI(fact.value, fact.unit) };
}

describe.each(TIERS)('the stiffest rail wire in /data on the %s tier', (tierId) => {
  const modulus = stiffestModulus();
  const wire = () => wireWithModulus('r', modulus.fact, tierId);

  it('deflects as a cantilever within 5% of F·L³/(3·EI)', () => {
    // The stiffest sourced wire is the one this question is about.
    expect(modulus.si).toBeGreaterThan(valueToSI(150, 'GPa'));
    const force = SCENE1_FORCE * (modulus.si / WIRE_W_MODULUS);
    const engine = sceneEngine(
      freeSpace(),
      [{ spec: wire(), pastSheathTip: SCENE1_FREE }],
      undefined,
      tierId,
    );
    const tipNode = engine.device(0).rod.segmentCount;
    engine.applyExternalForce(0, tipNode, [force, 0, 0]);
    settle(engine, MAX_SETTLE_STEPS);
    const expected = (force * SCENE1_FREE ** 3) / (3 * bendingStiffness(modulus.si, valueToSI(0.035, 'in')));
    const deflection = tipPosition(engine, 0)[0];
    console.info(
      `${tierId}: tip deflection ${(deflection / MM).toFixed(4)} mm (expected ${(expected / MM).toFixed(4)} mm)`,
    );
    expect(Math.abs(deflection - expected) / expected).toBeLessThan(CANTILEVER_TOLERANCE);
    expect(engine.solveFailures).toBe(0);
  });

  it('stays inextensible through push-pull and full-speed rotation in phantom B', () => {
    const engine = sceneEngine(
      phantom('phantom-b-bend'),
      [{ spec: wire(), pastSheathTip: BEND_START - 20 * MM }],
      undefined,
      tierId,
    );
    const rate = engine.stepRate;
    let worst = 0;
    for (let n = 0; n < SCENE3_DURATION * rate; n += 1) {
      const push = Math.floor(n / (PUSH_PERIOD * rate)) % 2 === 0 ? 1 : -1;
      const rotate = Math.floor(n / (ROTATE_PERIOD * rate)) % 2 === 0 ? 1 : -1;
      engine.step(cathFrame(engine.currentStep, { innerPush: push, innerRotate: rotate }));
      const error = maxStretchError(engine, 0);
      expect(Number.isFinite(error)).toBe(true);
      worst = Math.max(worst, error);
    }
    console.info(`${tierId}: largest segment length error ${(worst * 100).toExponential(3)}%`);
    expect(worst).toBeLessThan(STRETCH_LIMIT);
    expect(engine.solveFailures).toBe(0);
  });
});
