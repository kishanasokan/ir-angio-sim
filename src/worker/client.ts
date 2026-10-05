import type { InputSettings } from '../input/mapping/settings';
import type { SimEvent } from '../sim/core/events';
import type { Command, InputFrame, InputLog } from '../sim/core/records';
import type { Snapshot } from '../sim/snapshot';
import type { MainToWorker, PerfMessage, ReadyMessage, WorkerToMain } from './protocol';
import { pauseClock, resumeClock, startClock, targetStep, type LoopClock } from './timing';

/**
 * The main thread's side of the loop (spec 01 §3; docs/M1-plan.md D19). Each animation frame it converts wall time
 * into a target step and sends the frame stamped with its first step: the first step not yet requested. Pausing stops
 * the target. With ?fast=1 the target runs ahead of wall time by the worker's per-message limit.
 */

export interface PhysicsClientOptions {
  readonly caseId: string;
  readonly anatomyId?: string;
  readonly tierId?: string;
  readonly seed: number;
  readonly settings: InputSettings;
  readonly appVersion: string;
  readonly fast: boolean;
  readonly replay?: InputLog;
  readonly onReady?: (ready: ReadyMessage) => void;
  readonly onSnapshot?: (snapshot: Snapshot) => void;
  readonly onEvents?: (events: readonly SimEvent[]) => void;
  readonly onPerf?: (perf: PerfMessage) => void;
  readonly onLog?: (log: InputLog) => void;
  readonly onError?: (message: string) => void;
}

export class PhysicsClient {
  private readonly worker: Worker;
  private clock: LoopClock | null = null;
  private stepRate = 0;
  private maxSteps = 0;
  private requested = 0;

  constructor(private readonly options: PhysicsClientOptions) {
    this.worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerToMain>) => this.receive(event.data);
    this.send({
      type: 'init',
      caseId: options.caseId,
      ...(options.anatomyId === undefined ? {} : { anatomyId: options.anatomyId }),
      ...(options.tierId === undefined ? {} : { tierId: options.tierId }),
      seed: options.seed,
      settings: options.settings,
      appVersion: options.appVersion,
      fast: options.fast,
      ...(options.replay === undefined ? {} : { replay: options.replay }),
    });
  }

  get ready(): boolean {
    return this.clock !== null;
  }

  /** Sends this animation frame's input; it applies from the first step not yet requested. */
  tick(now: number, frame: Omit<InputFrame, 'step'>): void {
    if (this.clock === null) {
      return;
    }
    const target = this.options.fast
      ? this.requested + this.maxSteps
      : Math.max(this.requested, targetStep(this.clock, now, this.stepRate));
    this.send({ type: 'input', frames: [{ ...frame, step: this.requested }], targetStep: target });
    this.requested = target;
  }

  /** A command, stamped with the first step not yet requested. */
  command(command: Omit<Command, 'step'>): void {
    this.send({ type: 'command', command: { ...command, step: this.requested } });
  }

  pause(now: number): void {
    if (this.clock !== null) {
      this.clock = pauseClock(this.clock, now);
    }
    this.send({ type: 'pause' });
  }

  resume(now: number): void {
    if (this.clock !== null) {
      this.clock = resumeClock(this.clock, now);
    }
    this.send({ type: 'resume' });
  }

  requestLog(): void {
    this.send({ type: 'request-log' });
  }

  dispose(): void {
    this.worker.terminate();
  }

  private send(message: MainToWorker): void {
    this.worker.postMessage(message);
  }

  private receive(message: WorkerToMain): void {
    switch (message.type) {
      case 'ready':
        this.stepRate = message.stepRate;
        this.maxSteps = message.maxStepsPerMessage;
        this.clock = startClock(performance.now());
        this.requested = 0;
        this.options.onReady?.(message);
        break;
      case 'snapshot':
        this.options.onSnapshot?.(message.snapshot);
        break;
      case 'events':
        this.options.onEvents?.(message.events);
        break;
      case 'perf':
        this.options.onPerf?.(message);
        break;
      case 'log':
        this.options.onLog?.(message.log);
        break;
      case 'error':
        this.options.onError?.(message.message);
        break;
    }
  }
}
