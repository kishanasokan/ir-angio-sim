import { mapPad } from '../input/mapping/mapPad';
import { INITIAL_MAPPER_STATE, type MapperState } from '../input/mapping/frame';
import type { InputConfig } from '../input/mapping/settings';
import { virtualPadToRaw } from '../input/mapping/virtualPad';
import {
  createLogRecorder,
  recordCommand,
  recordFrame,
  toLog,
  type LogHeader,
  type LogRecorder,
} from '../input/log';
import { AUTOPILOT_SCRIPTS } from '../sim/autopilot';
import type { AutopilotParams } from '../sim/autopilot/types';
import { neutralFrame, type Command, type InputFrame, type InputLog, type RawPad } from '../sim/core/records';
import { AUTOPILOT_MEMO_SLOTS } from '../sim/core/types';
import { SimEngine, type SimConfig } from '../sim/engine';

/**
 * The session runner (docs/M1-plan.md D6, D8): the pure loop the physics worker and the golden tests share. It holds
 * the step-stamped frames from the main thread, applies each from its step until the next (zero-order hold; buttons
 * act on a frame's first step only), runs the autopilot through mapPad with the default settings, passes commands
 * to the engine at their step, and records the input log. A replay feeds a log's frames and commands instead, with
 * the autopilot off, and reproduces the session exactly.
 */

export interface SessionSetup {
  readonly config: SimConfig;
  readonly input: InputConfig;
  /** The case's autopilot parameters in SI, by script id. */
  readonly autopilots: Readonly<Record<string, AutopilotParams>>;
  /** The log header besides the seed and anatomy, which come from the config. */
  readonly header: Omit<LogHeader, 'seed' | 'anatomyId'>;
  /** Replay mode: frames and commands come from this log and the autopilot never runs. */
  readonly replay?: InputLog;
}

export class Session {
  readonly engine = new SimEngine();
  private readonly recorder: LogRecorder;
  private readonly pending: InputFrame[] = [];
  private current: InputFrame = neutralFrame(0);
  private fresh = false;
  private replayNext = 0;
  private readonly memo = new Float64Array(AUTOPILOT_MEMO_SLOTS);
  /** A script that reported done; it does not run again while its stop command is pending. */
  private finished: string | null = null;
  private autopilotPad: RawPad | null = null;
  private autopilotState: MapperState = INITIAL_MAPPER_STATE;
  /** A reset or demo start at or before this step clears the autopilot's memory. */
  private clearAt = -1;

  constructor(private readonly setup: SessionSetup) {
    this.engine.load(setup.config);
    this.recorder = createLogRecorder({
      ...setup.header,
      seed: setup.config.seed,
      anatomyId: setup.config.anatomy.id,
    });
    if (setup.replay !== undefined) {
      for (const command of setup.replay.commands) {
        this.applyCommand(command);
      }
    } else {
      // The tier is part of the session: logging it lets a replay run on the same tier on any machine.
      this.command({ step: 0, cmd: 'set-tier', args: { tier: setup.config.tier.id } });
    }
  }

  /** Queues live frames from the main thread; each applies from its step until the next. */
  input(frames: readonly InputFrame[]): void {
    for (const frame of frames) {
      this.pending.push(frame);
    }
    this.pending.sort((a, b) => a.step - b.step);
  }

  /** Queues a command, applied by the engine at its step (or the next step, if that has passed), and logs it. */
  command(command: Command): void {
    this.applyCommand({ ...command, step: Math.max(command.step, this.engine.currentStep) });
  }

  /** Runs steps toward `targetStep`, at most `maxSteps` of them; returns how many ran. */
  advance(targetStep: number, maxSteps: number): number {
    let steps = 0;
    while (steps < maxSteps && this.engine.currentStep < targetStep) {
      this.stepOnce();
      steps += 1;
    }
    return steps;
  }

  get log(): InputLog {
    return toLog(this.recorder);
  }

  get demo(): string | null {
    return this.engine.autopilotScript;
  }

  private applyCommand(command: Command): void {
    recordCommand(this.recorder, command);
    this.engine.command(command);
    if (command.cmd === 'reset' || command.cmd === 'start-autopilot') {
      this.clearAt = Math.max(this.clearAt, command.step);
    }
  }

  private stepOnce(): void {
    const step = this.engine.currentStep;
    if (step >= this.clearAt && this.clearAt >= 0) {
      this.memo.fill(0);
      this.autopilotPad = null;
      this.autopilotState = INITIAL_MAPPER_STATE;
      this.clearAt = -1;
    }
    let frame: InputFrame;
    let finished: string | null = null;
    const demo = this.setup.replay === undefined ? this.engine.autopilotScript : null;
    if (demo !== this.finished) {
      this.finished = null;
    }
    const script = demo === this.finished ? null : demo;
    const run = script === null ? undefined : AUTOPILOT_SCRIPTS[script];
    if (this.setup.replay !== undefined) {
      frame = this.replayFrame(step, this.setup.replay);
    } else if (script !== null && run !== undefined) {
      const params = {
        ...this.setup.autopilots[script],
        advanceSpeed: this.setup.input.autopilot.advanceSpeed,
        rotateSpeed: this.setup.input.autopilot.rotateSpeed,
        fullAdvanceSpeed: this.setup.input.devices.advanceSpeedMax,
        fullRotateSpeed: this.setup.input.devices.rotationSpeedMax,
      };
      const output = run(step, this.engine.autopilotView(), params, this.memo);
      const raw = virtualPadToRaw(output.pad, this.setup.input.defaults);
      const mapped = mapPad(
        raw,
        this.autopilotPad,
        this.autopilotState,
        this.setup.input.defaults,
        this.setup.input,
        step,
        'autopilot',
      );
      this.autopilotPad = raw;
      this.autopilotState = mapped.state;
      frame = mapped.frame;
      finished = output.done ? script : null;
    } else {
      frame = this.liveFrame(step);
    }
    recordFrame(this.recorder, frame);
    this.engine.step(frame);
    if (finished !== null) {
      this.finished = finished;
      this.engine.notifyAutopilotDone(finished);
      this.command({ step: step + 1, cmd: 'stop-autopilot', args: { script: finished } });
    }
  }

  /** The live frame in force at a step: the latest due frame, with its buttons only on the step it arrives. */
  private liveFrame(step: number): InputFrame {
    const arrived: InputFrame[] = [];
    while (this.pending.length > 0 && (this.pending[0]?.step ?? Number.POSITIVE_INFINITY) <= step) {
      arrived.push(this.pending.shift() as InputFrame);
    }
    const latest = arrived.at(-1);
    if (latest !== undefined) {
      // Frames that arrive together keep every button press.
      const buttons = arrived.flatMap((frame) => frame.buttons);
      this.current = { ...latest, buttons: [...new Set(buttons)] };
      this.fresh = true;
    }
    const frame = { ...this.current, step, buttons: this.fresh ? this.current.buttons : [] };
    this.fresh = false;
    return frame;
  }

  /** The logged frame in force at a step, with its buttons only on its own step. */
  private replayFrame(step: number, log: InputLog): InputFrame {
    while (
      this.replayNext < log.frames.length &&
      (log.frames[this.replayNext]?.step ?? Number.POSITIVE_INFINITY) <= step
    ) {
      this.current = log.frames[this.replayNext] as InputFrame;
      this.replayNext += 1;
    }
    return { ...this.current, step, buttons: this.current.step === step ? this.current.buttons : [] };
  }
}
