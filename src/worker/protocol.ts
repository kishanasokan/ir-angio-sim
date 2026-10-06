import type { InputSettings } from '../input/mapping/settings';
import type { SimEvent } from '../sim/core/events';
import type { Command, InputFrame, InputLog } from '../sim/core/records';
import type { Snapshot } from '../sim/snapshot';

/**
 * Messages between the main thread and the physics worker (spec 01 §3). The main thread converts wall time into a
 * target step and sends step-stamped frames; the worker runs at most maxStepsPerMessage steps per message, never
 * skipping, and answers with a snapshot (buffers transferred), the events and its cost.
 */

export interface InitMessage {
  readonly type: 'init';
  readonly caseId: string;
  readonly anatomyId?: string;
  /** Sandbox setup's stack option and wire: a case inventory rod model for the innermost slot of that stack. */
  readonly stackId?: string;
  readonly innerDevice?: string;
  /** A tier chosen in Settings; without one, the worker benchmarks and chooses (docs/M1-plan.md D17). */
  readonly tierId?: string;
  readonly seed: number;
  readonly settings: InputSettings;
  readonly appVersion: string;
  /** ?fast=1: end-to-end tests run up to maxStepsPerMessageFast steps per message. */
  readonly fast: boolean;
  /** Replay a recorded session instead of taking live input. */
  readonly replay?: InputLog;
}

export interface InputMessage {
  readonly type: 'input';
  readonly frames: readonly InputFrame[];
  /** Run until this step (exclusive), within the per-message limit. */
  readonly targetStep: number;
}

export interface CommandMessage {
  readonly type: 'command';
  readonly command: Command;
}

export type MainToWorker =
  | InitMessage
  | InputMessage
  | CommandMessage
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'request-log' };

export interface ReadyMessage {
  readonly type: 'ready';
  readonly tierId: string;
  readonly stepRate: number;
  /** The startup benchmark, when one ran: physics ms per frame at the target frame rate on the high tier. */
  readonly benchmarkMsPerFrame: number | null;
  readonly maxStepsPerMessage: number;
}

export interface SnapshotMessage {
  readonly type: 'snapshot';
  readonly snapshot: Snapshot;
}

export interface EventsMessage {
  readonly type: 'events';
  readonly events: readonly SimEvent[];
}

export interface PerfMessage {
  readonly type: 'perf';
  /** Physics time spent for this message, ms, and the steps it ran. */
  readonly physicsMsPerFrame: number;
  readonly stepsPerFrame: number;
  readonly step: number;
}

export interface LogMessage {
  readonly type: 'log';
  readonly log: InputLog;
}

export interface ErrorMessage {
  readonly type: 'error';
  readonly message: string;
}

export type WorkerToMain =
  ReadyMessage | SnapshotMessage | EventsMessage | PerfMessage | LogMessage | ErrorMessage;

/** The transferable buffers of a snapshot, so the worker hands them over instead of copying. */
export function snapshotTransfer(snapshot: Snapshot): ArrayBuffer[] {
  return snapshot.devices.flatMap((device) => [
    device.positionsMm.buffer,
    device.frames.buffer,
  ]) as ArrayBuffer[];
}
