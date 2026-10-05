import type { ButtonAction, InputAxes, InputFrame, InputSource, RawPad } from '../../sim/core/records';
import { PAD_AXES } from '../../sim/core/records';
import { BUTTON_DOWN, makeFrame, type MapperState } from '../mapping/frame';
import { mapKeyboard, NO_KEYS, type KeyState } from '../mapping/mapKeyboard';
import { mapPad } from '../mapping/mapPad';
import { mapPointer, type PointerState } from '../mapping/mapPointer';
import type { InputConfig, InputSettings } from '../mapping/settings';

/**
 * The arbiter (prompts/M1-foundations.md §5) merges the live sources into one frame per animation frame. The sources
 * share one mapper state, so Y on the pad and C on the keyboard toggle the same mode. Each axis takes the largest
 * request from any source, triggers the largest value, and every source's button actions are kept. During a demo,
 * any stick deflection above the takeover threshold or any button hands control back to the learner.
 */

export interface ArbiterState {
  readonly mapper: MapperState;
  readonly pad: RawPad | null;
  readonly keys: KeyState;
}

export interface ArbiterInput {
  readonly pad: RawPad | null;
  readonly keys: KeyState;
  readonly pointer: PointerState;
  /** Seconds since the last frame, for turning drags into rates (docs/M1-plan.md D19). */
  readonly interval: number;
  readonly step: number;
  readonly demoRunning: boolean;
}

export function initialArbiter(mapper: MapperState): ArbiterState {
  return { mapper, pad: null, keys: NO_KEYS };
}

const AXES: readonly (keyof InputAxes)[] = [
  'outerPush',
  'outerRotate',
  'innerPush',
  'innerRotate',
  'carmRotate',
  'carmAngulate',
  'detector',
  'tablePanX',
  'tablePanY',
  'tableHeight',
  'collimation',
];

const magnitude = (frame: InputFrame): number =>
  AXES.reduce((sum, key) => sum + Math.abs(frame.axes[key]), 0) +
  frame.triggers.fluoro +
  frame.triggers.inject;

export function arbitrate(
  state: ArbiterState,
  input: ArbiterInput,
  settings: InputSettings,
  config: InputConfig,
): { readonly state: ArbiterState; readonly frame: InputFrame; readonly takeover: boolean } {
  const frames: InputFrame[] = [];
  let mapper = state.mapper;
  if (input.pad !== null) {
    const result = mapPad(input.pad, state.pad, mapper, settings, config, input.step);
    frames.push(result.frame);
    mapper = result.state;
  }
  const keyboard = mapKeyboard(input.keys, state.keys, mapper, config, input.step);
  frames.push(keyboard.frame);
  mapper = keyboard.state;
  const pointer = mapPointer(input.pointer, input.interval, mapper, config, input.step);
  frames.push(pointer.frame);
  mapper = pointer.state;

  const axes = Object.fromEntries(
    AXES.map((key) => [
      key,
      frames.reduce(
        (best, frame) => (Math.abs(frame.axes[key]) > Math.abs(best) ? frame.axes[key] : best),
        0,
      ),
    ]),
  ) as unknown as InputAxes;
  const buttons = [...new Set(frames.flatMap((frame) => frame.buttons))] as ButtonAction[];
  const fluoro = Math.max(...frames.map((frame) => frame.triggers.fluoro));
  const inject = Math.max(...frames.map((frame) => frame.triggers.inject));
  const loudest = frames.reduce((best, frame) => (magnitude(frame) > magnitude(best) ? frame : best));
  const source: InputSource =
    magnitude(loudest) > 0 || buttons.length > 0 ? loudest.source : (frames[0]?.source ?? 'keyboard');

  // Takeover: a deflected stick, a held button on the pad, any key or a mouse action.
  let takeover = false;
  if (input.demoRunning) {
    // The four stick axes come first in the standard mapping.
    const sticks = (input.pad?.axes ?? []).slice(0, PAD_AXES.rightY + 1);
    const deflected = sticks.some((value) => Math.abs(value) > config.autopilot.takeoverThreshold);
    const padButton = input.pad?.buttons.some((value) => value >= BUTTON_DOWN) ?? false;
    const key = input.keys.down.size > 0;
    const mouse =
      input.pointer.leftDx !== 0 ||
      input.pointer.leftDy !== 0 ||
      input.pointer.rightDx !== 0 ||
      input.pointer.rightDy !== 0 ||
      input.pointer.wheel !== 0 ||
      input.pointer.middleClicks > 0;
    takeover = deflected || padButton || key || mouse;
  }

  return {
    state: { mapper, pad: input.pad, keys: input.keys },
    frame: makeFrame(input.step, mapper.mode, axes, fluoro, inject, buttons, source),
    takeover,
  };
}
