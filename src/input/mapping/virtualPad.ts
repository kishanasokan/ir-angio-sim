import type { VirtualPad } from '../../sim/autopilot/types';
import { PAD_AXES, PAD_BUTTONS, type RawPad } from '../../sim/core/records';
import type { InputSettings } from './settings';

/**
 * Turns an autopilot's virtual pad (the rates it wants after the response curve) into raw stick deflections that
 * mapPad, with the given settings, maps back to those rates: the exact inverse of the radial dead zone and the curve.
 * Stick up is negative in the Gamepad API, so a push becomes −y.
 */
export function virtualPadToRaw(pad: VirtualPad, settings: InputSettings): RawPad {
  const inverse = (output: number): number =>
    Math.sign(output) * Math.pow(Math.min(1, Math.abs(output)), 1 / settings.responseExponent);
  const stick = (push: number, rotate: number): [number, number] => {
    const x = inverse(rotate);
    const up = inverse(push);
    const magnitude = Math.sqrt(x * x + up * up);
    if (magnitude === 0) {
      return [0, 0];
    }
    const raw = settings.deadZone + (1 - settings.deadZone) * Math.min(1, magnitude);
    return [(x / magnitude) * raw, (-up / magnitude) * raw];
  };
  const axes = new Array<number>(PAD_AXES.rightY + 1).fill(0);
  [axes[PAD_AXES.leftX], axes[PAD_AXES.leftY]] = stick(pad.outerPush, pad.outerRotate);
  [axes[PAD_AXES.rightX], axes[PAD_AXES.rightY]] = stick(pad.innerPush, pad.innerRotate);
  const buttons = new Array<number>(PAD_BUTTONS.home + 1).fill(0);
  for (const index of pad.buttons) {
    buttons[index] = 1;
  }
  return { axes, buttons };
}
