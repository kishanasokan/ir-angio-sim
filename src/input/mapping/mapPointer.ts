import type { ButtonAction, InputFrame } from '../../sim/core/records';
import { clampUnit, makeFrame, zeroAxes, type MapperState } from './frame';
import type { InputConfig } from './settings';

/**
 * Mouse mapping (prompts/M1-foundations.md §5). Drags and wheel notches since the last frame are displacements; over
 * the frame interval they become rates, capped at full speed (docs/M1-plan.md D19). Screen y grows downward, so an
 * upward drag advances.
 */

export interface PointerState {
  /** Pixels dragged since the last frame with the left and the right button. */
  readonly leftDx: number;
  readonly leftDy: number;
  readonly rightDx: number;
  readonly rightDy: number;
  /** Wheel notches since the last frame; positive scrolls up (away from the user). */
  readonly wheel: number;
  /** Middle-button presses since the last frame. */
  readonly middleClicks: number;
}

export const NO_POINTER: PointerState = {
  leftDx: 0,
  leftDy: 0,
  rightDx: 0,
  rightDy: 0,
  wheel: 0,
  middleClicks: 0,
};

export function mapPointer(
  pointer: PointerState,
  interval: number,
  state: MapperState,
  config: InputConfig,
  step: number,
): { readonly frame: InputFrame; readonly state: MapperState } {
  const axes = zeroAxes();
  const buttons: ButtonAction[] = [];
  // A rate for this frame's interval, as a fraction of full speed.
  const rate = (displacement: number, fullSpeed: number): number =>
    interval > 0 && fullSpeed > 0 ? clampUnit(displacement / interval / fullSpeed) : 0;
  const { mouse, devices, carm, control } = config;
  if (state.mode === 'cath') {
    const scale = state.fine ? devices.fineScale : 1;
    axes.innerPush =
      rate(
        -pointer.leftDy * mouse.dragAdvancePerPixel + pointer.wheel * mouse.wheelAdvancePerNotch,
        devices.advanceSpeedMax,
      ) * scale;
    axes.innerRotate = rate(pointer.leftDx * mouse.dragRotatePerPixel, devices.rotationSpeedMax) * scale;
    axes.outerPush = rate(-pointer.rightDy * mouse.dragAdvancePerPixel, devices.advanceSpeedMax) * scale;
    axes.outerRotate = rate(pointer.rightDx * mouse.dragRotatePerPixel, devices.rotationSpeedMax) * scale;
    if (pointer.middleClicks > 0) {
      buttons.push('lock-pair');
    }
  } else {
    axes.carmRotate = rate(pointer.leftDx * mouse.dragCarmPerPixel, carm.rotationSpeedMax);
    axes.carmAngulate = rate(-pointer.leftDy * mouse.dragCarmPerPixel, carm.angulationSpeedMax);
    axes.tablePanX = rate(pointer.rightDx * mouse.dragTablePerPixel, control.tablePanSpeed);
    axes.tablePanY = rate(-pointer.rightDy * mouse.dragTablePerPixel, control.tablePanSpeed);
    // The wheel steps the field of view: up narrows (zooms in), down widens.
    if (pointer.wheel > 0) {
      buttons.push('fov-narrower');
    } else if (pointer.wheel < 0) {
      buttons.push('fov-wider');
    }
  }
  return { frame: makeFrame(step, state.mode, axes, 0, 0, buttons, 'pointer'), state };
}
