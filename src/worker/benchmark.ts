import type { Repository } from '../data/loaders';
import { sandboxConfig } from '../data/simConfig';
import { valueToSI } from '../data/units';
import { neutralFrame } from '../sim/core/records';
import { SimEngine } from '../sim/engine';
import { chooseTier, physicsPerFrame } from './timing';

/**
 * The startup tier benchmark (prompts/M1-foundations.md §2; docs/M1-plan.md D17): `benchmarkSteps` steps of phantom C
 * on the high tier with the devices at `benchmarkDepth`, timed with the given clock. If physics costs more than
 * `maxPhysicsPerFrame` per frame at the target frame rate, the standard tier is used.
 */

export interface TierChoice {
  readonly tierId: string;
  /** Physics ms per frame the high tier measured. */
  readonly highMsPerFrame: number;
}

const HIGH = 'high';
const STANDARD = 'standard';

export function benchmarkTier(repository: Repository, now: () => number): TierChoice {
  const high = repository.physics.tiers.find((tier) => tier.id === HIGH);
  const auto = high?.autoSelect;
  if (high === undefined || auto === undefined) {
    return { tierId: HIGH, highMsPerFrame: 0 };
  }
  const engine = new SimEngine();
  engine.load(
    sandboxConfig(repository, {
      tierId: HIGH,
      anatomyId: 'phantom-c-bifurcation',
      startDepth: valueToSI(auto.benchmarkDepth.value, auto.benchmarkDepth.unit),
    }),
  );
  const steps = auto.benchmarkSteps.value;
  const started = now();
  for (let n = 0; n < steps; n += 1) {
    engine.step(neutralFrame(engine.currentStep));
  }
  const msPerStep = (now() - started) / steps;
  const frameRate = valueToSI(
    repository.render.targetFrameRate.value,
    repository.render.targetFrameRate.unit,
  );
  const highMsPerFrame = physicsPerFrame(msPerStep, engine.stepRate, frameRate);
  const limit = valueToSI(auto.maxPhysicsPerFrame.value, auto.maxPhysicsPerFrame.unit) * MS_PER_S;
  return { tierId: chooseTier(highMsPerFrame, limit, HIGH, STANDARD), highMsPerFrame };
}

const MS_PER_S = 1000;
