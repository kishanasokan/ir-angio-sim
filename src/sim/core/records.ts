/**
 * Runtime records shared by the engine, the input mappers, the worker and replays (spec 02 §13). Every input source,
 * the autopilot and replays produce the same InputFrame (CLAUDE.md rule 6).
 */

export type InputMode = 'cath' | 'control';
export type InputSource = 'gamepad' | 'keyboard' | 'pointer' | 'autopilot' | 'replay';

/** Stick and control axes after dead zone and response curve, each in −1..1. */
export interface InputAxes {
  readonly outerPush: number;
  readonly outerRotate: number;
  readonly innerPush: number;
  readonly innerRotate: number;
  readonly carmRotate: number;
  readonly carmAngulate: number;
  readonly detector: number;
  readonly tablePanX: number;
  readonly tablePanY: number;
  readonly tableHeight: number;
  readonly collimation: number;
}

/**
 * Edge-triggered actions an InputFrame can carry. The engine acts on pair, lock and C-arm actions; the rest are for
 * the UI.
 */
export const BUTTON_ACTIONS = [
  'toggle-mode',
  'lock-pair',
  'fine',
  'pair-up',
  'pair-down',
  'picker',
  'act',
  'back',
  'roadmap',
  'dsa',
  'view-3d',
  'pause',
  'fov-wider',
  'fov-narrower',
  'fov-cycle',
  'save-angle',
  'drugs',
  'inspector',
  'perf',
] as const;
export type ButtonAction = (typeof BUTTON_ACTIONS)[number];

export interface InputFrame {
  /** The first step at which this frame applies; it holds until the next frame (spec 01 §3). */
  readonly step: number;
  readonly mode: InputMode;
  readonly axes: InputAxes;
  /** 0..1: fluoro pedal and the contrast plunger stand-in. */
  readonly triggers: { readonly fluoro: number; readonly inject: number };
  readonly buttons: readonly ButtonAction[];
  readonly source: InputSource;
}

export const COMMAND_NAMES = [
  'swap-device',
  'set-anatomy',
  'reset',
  'set-tier',
  'start-autopilot',
  'stop-autopilot',
] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];

/** A step-stamped command, applied by the engine at that step and logged for replays. */
export interface Command {
  readonly step: number;
  readonly cmd: CommandName;
  readonly args: Readonly<Record<string, string | number>>;
}

export interface InputLog {
  readonly schema: 'ir-sim/input-log@1';
  readonly appVersion: string;
  /** Hash of /data; a replay refuses to run against different data. */
  readonly dataHash: string;
  readonly seed: number;
  readonly caseId: string;
  readonly anatomyId: string;
  readonly settings: Readonly<Record<string, number | boolean>>;
  readonly frames: readonly InputFrame[];
  readonly commands: readonly Command[];
}

/** Standard-mapping indices (W3C Gamepad API): stick axes, and buttons with their analog values in 0..1. */
export const PAD_AXES = { leftX: 0, leftY: 1, rightX: 2, rightY: 3 } as const;
export const PAD_BUTTONS = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  view: 8,
  menu: 9,
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  home: 16,
} as const;

/** Gamepad state in the standard mapping: four stick axes and seventeen button values in 0..1. */
export interface RawPad {
  readonly axes: readonly number[];
  readonly buttons: readonly number[];
}

export const NEUTRAL_AXES: InputAxes = {
  outerPush: 0,
  outerRotate: 0,
  innerPush: 0,
  innerRotate: 0,
  carmRotate: 0,
  carmAngulate: 0,
  detector: 0,
  tablePanX: 0,
  tablePanY: 0,
  tableHeight: 0,
  collimation: 0,
};

export function neutralFrame(
  step: number,
  source: InputSource = 'replay',
  mode: InputMode = 'cath',
): InputFrame {
  return { step, mode, axes: NEUTRAL_AXES, triggers: { fluoro: 0, inject: 0 }, buttons: [], source };
}
