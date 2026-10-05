import { readDataFiles } from '../../scripts/lib/dataFiles';
import { demoCommands, sandboxSession } from '../../src/data/sessionSetup';
import { loadCase } from '../../src/data/loaders';
import { Session, type SessionSetup } from '../../src/worker/session';
import { DATA_ROOT, repository } from '../helpers/repository';

/** Running the sandbox demos headless through the session runner the worker uses (docs/M1-plan.md D6). */

export const CASE_ID = 'sandbox-phantoms';
export const APP_VERSION = 'golden';

const files = readDataFiles(DATA_ROOT);

export function demoSetup(): SessionSetup {
  return sandboxSession(repository(), { appVersion: APP_VERSION, files });
}

/** A session with the demo started at step 0. */
export function demoSession(script: string, setup: SessionSetup = demoSetup()): Session {
  const session = new Session(setup);
  for (const command of demoCommands(repository(), CASE_ID, script, 0)) {
    session.command(command);
  }
  return session;
}

/** Steps until the demo reports done (or `maxSteps`), calling `each` after every step; returns the done step. */
export function runDemo(session: Session, maxSteps: number, each?: () => void): number {
  for (let n = 0; n < maxSteps; n += 1) {
    session.advance(session.engine.currentStep + 1, 1);
    each?.();
    if (session.engine.drainEvents().some((event) => event.type === 'autopilot-done')) {
      return session.engine.currentStep;
    }
  }
  throw new Error(`The demo did not finish within ${maxSteps} steps.`);
}

/** An autopilot parameter of the case, SI. */
export function demoParam(script: string, name: string): number {
  const entry = loadCase(repository(), CASE_ID).autopilot.find((item) => item.id === script);
  const value = entry?.params[name]?.value;
  if (value === undefined) {
    throw new Error(`No parameter ${name} for ${script}.`);
  }
  return value;
}
