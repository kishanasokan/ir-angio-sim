import {
  BUTTON_ACTIONS,
  COMMAND_NAMES,
  type Command,
  type InputFrame,
  type InputLog,
} from '../sim/core/records';

/**
 * Input logs (spec 02 §13; docs/M1-plan.md D8): the seed, settings, every frame the engine consumed that differs from
 * the one before (autopilot frames included) and every command, all step-stamped. A replay feeds them to a fresh
 * engine and reproduces the session exactly. A log made with different /data is refused.
 */

export type LogHeader = Omit<InputLog, 'schema' | 'frames' | 'commands'>;

export interface LogRecorder {
  readonly header: LogHeader;
  readonly frames: InputFrame[];
  readonly commands: Command[];
}

export function createLogRecorder(header: LogHeader): LogRecorder {
  return { header, frames: [], commands: [] };
}

/** True when two frames ask for the same thing (their steps aside). */
export function sameInput(a: InputFrame, b: InputFrame): boolean {
  if (a.mode !== b.mode || a.source !== b.source) {
    return false;
  }
  if (a.triggers.fluoro !== b.triggers.fluoro || a.triggers.inject !== b.triggers.inject) {
    return false;
  }
  if (a.buttons.length !== b.buttons.length || a.buttons.some((button, i) => button !== b.buttons[i])) {
    return false;
  }
  const keys = Object.keys(a.axes) as (keyof InputFrame['axes'])[];
  return keys.every((key) => a.axes[key] === b.axes[key]);
}

/** Records a consumed frame, unless it repeats the last one recorded. */
export function recordFrame(recorder: LogRecorder, frame: InputFrame): void {
  const last = recorder.frames.at(-1);
  if (last === undefined || !sameInput(last, frame)) {
    recorder.frames.push(frame);
  }
}

export function recordCommand(recorder: LogRecorder, command: Command): void {
  recorder.commands.push(command);
}

export function toLog(recorder: LogRecorder): InputLog {
  return {
    schema: 'ir-sim/input-log@1',
    ...recorder.header,
    frames: [...recorder.frames],
    commands: [...recorder.commands],
  };
}

export class InputLogError extends Error {
  override name = 'InputLogError';
  constructor(
    message: string,
    readonly code: 'not-a-log' | 'data-mismatch',
  ) {
    super(message);
  }
}

export function serializeLog(log: InputLog): string {
  return JSON.stringify(log);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Parses a log and checks it against the current /data. Throws InputLogError: `not-a-log` for anything that is not
 * an ir-sim/input-log@1 record, `data-mismatch` when it was made with different data.
 */
export function parseLog(text: string, currentDataHash: string): InputLog {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InputLogError('This file is not an input log (it is not JSON).', 'not-a-log');
  }
  if (
    !isRecord(value) ||
    value.schema !== 'ir-sim/input-log@1' ||
    typeof value.dataHash !== 'string' ||
    typeof value.seed !== 'number' ||
    !Array.isArray(value.frames) ||
    !Array.isArray(value.commands)
  ) {
    throw new InputLogError('This file is not an ir-sim/input-log@1 record.', 'not-a-log');
  }
  const frames = value.frames as unknown[];
  const commands = value.commands as unknown[];
  const frameOk = (frame: unknown): boolean =>
    isRecord(frame) &&
    typeof frame.step === 'number' &&
    Array.isArray(frame.buttons) &&
    (frame.buttons as unknown[]).every((button) => (BUTTON_ACTIONS as readonly unknown[]).includes(button));
  const commandOk = (command: unknown): boolean =>
    isRecord(command) &&
    typeof command.step === 'number' &&
    (COMMAND_NAMES as readonly unknown[]).includes(command.cmd);
  if (!frames.every(frameOk) || !commands.every(commandOk)) {
    throw new InputLogError('This input log has a malformed frame or command.', 'not-a-log');
  }
  if (value.dataHash !== currentDataHash) {
    throw new InputLogError(
      `This replay was recorded with different data (${value.dataHash}, now ${currentDataHash}), so it cannot reproduce the session.`,
      'data-mismatch',
    );
  }
  return value as unknown as InputLog;
}
