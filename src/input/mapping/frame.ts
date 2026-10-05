import {
  PAD_AXES,
  PAD_BUTTONS,
  type ButtonAction,
  type InputAxes,
  type InputFrame,
  type InputMode,
  type InputSource,
} from '../../sim/core/records';

/**
 * Shared pieces of the mappers: the mapper state that every source toggles together (mode and fine), and a builder
 * for frames. Mappers are pure: the previous raw state comes in, so press edges are found without hidden state.
 */

export interface MapperState {
  readonly mode: InputMode;
  /** Fine mode toggled by L3 (keyboard Shift applies it only while held, docs/M1-plan.md D20). */
  readonly fine: boolean;
}

export const INITIAL_MAPPER_STATE: MapperState = { mode: 'cath', fine: false };

/** Standard-mapping indices (W3C Gamepad API), named for the mappers. */
export const PAD = {
  axisLeftX: PAD_AXES.leftX,
  axisLeftY: PAD_AXES.leftY,
  axisRightX: PAD_AXES.rightX,
  axisRightY: PAD_AXES.rightY,
  ...PAD_BUTTONS,
} as const;

/** A digital button counts as down from half travel. */
export const BUTTON_DOWN = 0.5;

export function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

export type MutableAxes = { -readonly [K in keyof InputAxes]: number };

export function zeroAxes(): MutableAxes {
  return {
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
}

export function makeFrame(
  step: number,
  mode: InputMode,
  axes: InputAxes,
  fluoro: number,
  inject: number,
  buttons: readonly ButtonAction[],
  source: InputSource,
): InputFrame {
  return { step, mode, axes, triggers: { fluoro, inject }, buttons, source };
}

/** Flips the mode, for the toggle-mode action. */
export function otherMode(mode: InputMode): InputMode {
  return mode === 'cath' ? 'control' : 'cath';
}
