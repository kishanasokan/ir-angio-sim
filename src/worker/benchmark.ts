import type { Repository } from '../data/loaders';
import { sandboxConfig } from '../data/simConfig';
import { valueToSI } from '../data/units';
import { neutralFrame } from '../sim/core/records';
import { SimEngine } from '../sim/engine';
import { chooseTier, physicsPerFrame } from './timing';

/**
 * The startup tier benchmark (prompts/M1-foundations.md §2; docs/M1-plan.md D17; spec 04 §6): `benchmarkSteps` steps
 * of phantom C with the devices at `benchmarkDepth`, timed with the given clock, on each rod tier in turn (high, then
 * standard). The first whose physics costs no more than `maxPhysicsPerFrame` per frame at the target frame rate is
 * used; when none does, the rail fallback.
 */

export interface TierChoice {
  readonly tierId: string;
  /** Physics ms per frame the high tier measured. */
  readonly highMsPerFrame: number;
  /** Physics ms per frame of every tier measured, in order. */
  readonly costs: readonly { readonly id: string; readonly msPerFrame: number }[];
}

const HIGH = 'high';

const MS_PER_S = 1000;

function measure(
  repository: Repository,
  tierId: string,
  depth: number,
  steps: number,
  now: () => number,
): number {
  const engine = new SimEngine();
  engine.load(sandboxConfig(repository, { tierId, anatomyId: 'phantom-c-bifurcation', startDepth: depth }));
  const started = now();
  for (let n = 0; n < steps; n += 1) {
    engine.step(neutralFrame(engine.currentStep));
  }
  const msPerStep = (now() - started) / steps;
  const frameRate = valueToSI(
    repository.render.targetFrameRate.value,
    repository.render.targetFrameRate.unit,
  );
  return physicsPerFrame(msPerStep, engine.stepRate, frameRate);
}

export function benchmarkTier(repository: Repository, now: () => number): TierChoice {
  const { tiers } = repository.physics;
  const auto = tiers.find((tier) => tier.id === HIGH)?.autoSelect;
  if (auto === undefined) {
    return { tierId: HIGH, highMsPerFrame: 0, costs: [] };
  }
  const limit = valueToSI(auto.maxPhysicsPerFrame.value, auto.maxPhysicsPerFrame.unit) * MS_PER_S;
  const depth = valueToSI(auto.benchmarkDepth.value, auto.benchmarkDepth.unit);
  const rail = tiers.find((tier) => tier.model === 'rail')?.id;
  const costs: { id: string; msPerFrame: number }[] = [];
  // Rod tiers in data order, measured until one fits.
  for (const tier of tiers.filter((entry) => entry.model === 'rod')) {
    const msPerFrame = measure(repository, tier.id, depth, auto.benchmarkSteps.value, now);
    costs.push({ id: tier.id, msPerFrame });
    if (msPerFrame <= limit) {
      break;
    }
  }
  const last = costs.at(-1)?.id ?? HIGH;
  return {
    tierId: chooseTier(costs, limit, rail ?? last),
    highMsPerFrame: costs[0]?.msPerFrame ?? 0,
    costs,
  };
}
