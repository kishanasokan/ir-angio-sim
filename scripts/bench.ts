/**
 * npm run bench
 *
 * Physics cost, headless (spec 01 §10, prompts/M1-foundations.md §8): golden scene 8 (phantom C, the Glidewire alone
 * with its tip 60 mm below the carina, advancing 80 mm at 10 mm/s, at hub rotation 0 and 180°) on each rod tier,
 * and the sandbox-c-left demo with the wire and the 5F catheter. Prints physics milliseconds per simulated second
 * and per frame at the target frame rate, against the per-frame budget.
 */
import { performance } from 'node:perf_hooks';
import { loadRepository } from '../src/data/loaders';
import { demoCommands, sandboxSession } from '../src/data/sessionSetup';
import { sandboxConfig, tierParams } from '../src/data/simConfig';
import { valueToSI } from '../src/data/units';
import { NEUTRAL_AXES, neutralFrame } from '../src/sim/core/records';
import { SimEngine } from '../src/sim/engine';
import { Session } from '../src/worker/session';
import { readDataFiles } from './lib/dataFiles';

const MS_PER_S = 1000;
const MM = 1e-3;
const DEG = Math.PI / 180;
const CASE_ID = 'sandbox-phantoms';
const ANATOMY = 'phantom-c-bifurcation';
const WIRE = 'rm-glidewire-035-angled-150';
// Golden scene 8's numbers (prompts/M1-foundations.md §8).
const CARINA = 150 * MM;
const BELOW_CARINA = 60 * MM;
const ADVANCE = 80 * MM;
const SPEED = 10 * MM;
/** A safety limit, simulated seconds; the demo finishes in about 37 s (docs/M1-plan.md, phase C). */
const DEMO_LIMIT_S = 120;

const files = readDataFiles('data');
const repository = loadRepository(files);
const frameRate = valueToSI(repository.render.targetFrameRate.value, repository.render.targetFrameRate.unit);
const budgetQuantity = repository.physics.tiers.find((tier) => tier.autoSelect !== undefined)?.autoSelect
  ?.maxPhysicsPerFrame;
const budgetMs =
  budgetQuantity === undefined ? null : valueToSI(budgetQuantity.value, budgetQuantity.unit) * MS_PER_S;
const rodTiers = repository.physics.tiers.filter((tier) => tier.model === 'rod').map((tier) => tier.id);

interface Row {
  readonly name: string;
  readonly tier: string;
  readonly simulatedS: number;
  readonly wallMs: number;
  readonly result: string;
}

function scene8(tierId: string, rotationDeg: number): Row {
  const base = sandboxConfig(repository, { caseId: CASE_ID, tierId, anatomyId: ANATOMY });
  const engine = new SimEngine();
  engine.load({
    ...base,
    stack: [
      { rodModelId: WIRE, inserted: base.sheathLength + CARINA - BELOW_CARINA, rotation: rotationDeg * DEG },
    ],
  });
  const steps = Math.round((ADVANCE / SPEED) * engine.stepRate);
  const push = SPEED / base.speeds.advanceSpeedMax;
  const started = performance.now();
  for (let n = 0; n < steps; n += 1) {
    engine.step({ ...neutralFrame(engine.currentStep), axes: { ...NEUTRAL_AXES, innerPush: push } });
  }
  const wallMs = performance.now() - started;
  return {
    name: `Scene 8, hub ${rotationDeg}°`,
    tier: tierId,
    simulatedS: steps / engine.stepRate,
    wallMs,
    result: `tip in ${engine.device(0).tipSegmentId ?? 'none'}`,
  };
}

function demo(tierId: string): Row {
  const setup = sandboxSession(repository, { appVersion: 'bench', files, caseId: CASE_ID, tierId });
  const session = new Session(setup);
  for (const command of demoCommands(repository, CASE_ID, 'sandbox-c-left', 0)) {
    session.command(command);
  }
  const stepRate = tierParams(repository, tierId).stepRate;
  const limit = Math.round(DEMO_LIMIT_S * stepRate);
  let done = false;
  const started = performance.now();
  while (!done && session.engine.currentStep < limit) {
    session.advance(session.engine.currentStep + 1, 1);
    done = session.engine.drainEvents().some((event) => event.type === 'autopilot-done');
  }
  const wallMs = performance.now() - started;
  return {
    name: 'sandbox-c-left demo, wire + 5F catheter',
    tier: tierId,
    simulatedS: session.engine.currentStep / stepRate,
    wallMs,
    result: done ? 'finished' : 'did not finish',
  };
}

const rows: Row[] = [];
for (const tier of rodTiers) {
  rows.push(scene8(tier, 0), scene8(tier, 180), demo(tier));
}

const pad = (text: string, width: number) => text.padEnd(width);
console.log(`npm run bench · Node ${process.version} · ${process.platform} ${process.arch}`);
console.log(`Frame budget: ${budgetMs ?? '—'} ms of physics per frame at ${frameRate} Hz\n`);
console.log(
  `${pad('Run', 42)}${pad('Tier', 10)}${pad('Simulated', 11)}${pad('ms per sim s', 14)}${pad('ms per frame', 26)}Result`,
);
for (const row of rows) {
  const perSecond = row.wallMs / row.simulatedS;
  const perFrame = perSecond / frameRate;
  const over = budgetMs !== null && perFrame > budgetMs ? ' (over budget)' : '';
  console.log(
    `${pad(row.name, 42)}${pad(row.tier, 10)}${pad(`${row.simulatedS.toFixed(1)} s`, 11)}${pad(perSecond.toFixed(1), 14)}${pad(`${perFrame.toFixed(2)}${over}`, 26)}${row.result}`,
  );
}
