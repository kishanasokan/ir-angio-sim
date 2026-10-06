import type { InputSettings } from '../input/mapping/settings';
import type { SimEvent } from '../sim/core/events';
import type { Command, InputFrame, InputLog } from '../sim/core/records';
import type { Snapshot } from '../sim/snapshot';
import type { MainToWorker, PerfMessage, ReadyMessage, WorkerToMain } from './protocol';
import {
  nextTarget,
  pauseClock,
  resumeClock,
  slipClock,
  startClock,
  targetStep,
  type LoopClock,
} from './timing';

/**
 * The main thread's side of the loop (spec 01 §3; docs/M1-plan.md D19). Each animation frame it converts wall time
 * into a target step and sends the frame stamped with its first step: the first step not yet requested. Pausing stops
 * the target. With ?fast=1 the target runs ahead of wall time by the worker's per-message limit.
 *
 * One input message is in flight at a time. Frames from animation frames that pass while the worker is busy merge
 * into one (the latest axes, every button press) and go with the next message, so a slow worker never builds a queue.
 * A target capped at the per-message limit slips the clock: the simulation runs in slow motion, never skipping.
 */

type LiveFrame = Omit<InputFrame, 'step'>;

/** Merges a held frame with a newer one: the newer state, and every button pressed in either. */
export function mergeFrames(held: LiveFrame | null, frame: LiveFrame): LiveFrame {
  if (held === null || held.buttons.length === 0) {
    return frame;
  }
  return { ...frame, buttons: [...new Set([...held.buttons, ...frame.buttons])] };
}

export interface PhysicsClientOptions {
  readonly caseId: string;
  readonly anatomyId?: string;
  readonly stackId?: string;
  readonly innerDevice?: string;
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
  private inFlight = false;
  private held: LiveFrame | null = null;
  private paused = false;

  constructor(private readonly options: PhysicsClientOptions) {
    this.worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerToMain>) => this.receive(event.data);
    this.send({
      type: 'init',
      caseId: options.caseId,
      ...(options.anatomyId === undefined ? {} : { anatomyId: options.anatomyId }),
      ...(options.stackId === undefined ? {} : { stackId: options.stackId }),
      ...(options.innerDevice === undefined ? {} : { innerDevice: options.innerDevice }),
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

  /** The step the next frame will be stamped with: the first step not yet requested. */
  get requestedStep(): number {
    return this.requested;
  }

  /**
   * Sends this animation frame's input; it applies from the first step not yet requested. While the worker is still
   * busy with the last message, the frame is held and merged into the next one. While paused, input is dropped.
   */
  tick(now: number, frame: LiveFrame): void {
    if (this.clock === null || this.paused) {
      return;
    }
    this.held = mergeFrames(this.held, frame);
    if (this.inFlight) {
      return;
    }
    let target: number;
    if (this.options.fast) {
      target = this.requested + this.maxSteps;
    } else {
      const wall = targetStep(this.clock, now, this.stepRate);
      target = nextTarget(this.requested, wall, this.maxSteps);
      if (target < wall) {
        this.clock = slipClock(this.clock, now, target, this.stepRate);
      }
    }
    this.send({ type: 'input', frames: [{ ...this.held, step: this.requested }], targetStep: target });
    this.held = null;
    this.inFlight = true;
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
    this.paused = true;
    this.held = null;
    this.send({ type: 'pause' });
  }

  resume(now: number): void {
    if (this.clock !== null) {
      this.clock = resumeClock(this.clock, now);
    }
    this.paused = false;
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
        this.inFlight = false;
        this.options.onReady?.(message);
        break;
      case 'snapshot':
        this.options.onSnapshot?.(message.snapshot);
        break;
      case 'events':
        this.options.onEvents?.(message.events);
        break;
      case 'perf':
        // The last message of each input round trip: the worker is free for the next one.
        this.inFlight = false;
        this.options.onPerf?.(message);
        break;
      case 'log':
        this.options.onLog?.(message.log);
        break;
      case 'error':
        this.inFlight = false;
        this.options.onError?.(message.message);
        break;
    }
  }
}
