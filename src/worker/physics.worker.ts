/// <reference lib="webworker" />
import { BUNDLED_DATA_FILES } from '../data/bundledFiles';
import { loadRepository } from '../data/loaders';
import { sandboxSession } from '../data/sessionSetup';
import { benchmarkTier } from './benchmark';
import type { MainToWorker, WorkerToMain } from './protocol';
import { snapshotTransfer } from './protocol';
import { Session } from './session';

/**
 * The physics worker (spec 01 §3): a thin shell around the session runner the golden tests also drive (D6). It runs
 * steps toward each message's target, at most maxStepsPerMessage per message (beyond that the simulation runs in
 * slow motion, never skipping), and posts a snapshot with transferred buffers, the events and the physics cost.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope;
let session: Session | null = null;
let paused = false;
let maxSteps = 0;

function post(message: WorkerToMain, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

scope.onmessage = (event: MessageEvent<MainToWorker>) => {
  const message = event.data;
  try {
    switch (message.type) {
      case 'init': {
        const repository = loadRepository(BUNDLED_DATA_FILES);
        const choice =
          message.tierId === undefined ? benchmarkTier(repository, () => performance.now()) : null;
        const setup = sandboxSession(repository, {
          appVersion: message.appVersion,
          files: BUNDLED_DATA_FILES,
          caseId: message.caseId,
          ...(message.anatomyId === undefined ? {} : { anatomyId: message.anatomyId }),
          ...(message.innerDevice === undefined ? {} : { innerDevice: message.innerDevice }),
          tierId: message.tierId ?? choice?.tierId ?? 'high',
          seed: message.seed,
          settings: message.settings,
        });
        session = new Session(message.replay === undefined ? setup : { ...setup, replay: message.replay });
        const solver = repository.physics.solver;
        maxSteps = message.fast ? solver.maxStepsPerMessageFast.value : solver.maxStepsPerMessage.value;
        paused = false;
        post({
          type: 'ready',
          tierId: setup.config.tier.id,
          stepRate: session.engine.stepRate,
          benchmarkMsPerFrame: choice?.highMsPerFrame ?? null,
          maxStepsPerMessage: maxSteps,
        });
        break;
      }
      case 'input': {
        if (session === null) {
          return;
        }
        session.input(message.frames);
        const started = performance.now();
        const steps = paused ? 0 : session.advance(message.targetStep, maxSteps);
        const physicsMs = performance.now() - started;
        const snapshot = session.engine.snapshot();
        post({ type: 'snapshot', snapshot }, snapshotTransfer(snapshot));
        const events = session.engine.drainEvents();
        if (events.length > 0) {
          post({ type: 'events', events });
        }
        post({
          type: 'perf',
          physicsMsPerFrame: physicsMs,
          stepsPerFrame: steps,
          step: session.engine.currentStep,
        });
        break;
      }
      case 'command':
        session?.command(message.command);
        break;
      case 'pause':
        paused = true;
        break;
      case 'resume':
        paused = false;
        break;
      case 'request-log':
        if (session !== null) {
          post({ type: 'log', log: session.log });
        }
        break;
    }
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
