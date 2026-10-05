import type { ButtonAction, InputFrame, InputSource, RawPad } from '../../sim/core/records';
import { radialDeadZone, responseCurve } from './curves';
import { BUTTON_DOWN, clampUnit, makeFrame, otherMode, PAD, zeroAxes, type MapperState } from './frame';
import type { InputConfig, InputSettings } from './settings';

/**
 * Gamepad mapping (prompts/M1-foundations.md §5, standard mapping). Sticks pass a radial dead zone and the response
 * curve; stick up means advance (the Gamepad API reports up as negative). Buttons act on press edges only. In Cath
 * mode the left stick drives the outer device and the right stick the inner one; in Control mode they drive the
 * C-arm and the table.
 */

const value = (pad: RawPad | null, index: number): number => pad?.buttons[index] ?? 0;
const down = (pad: RawPad | null, index: number): boolean => value(pad, index) >= BUTTON_DOWN;

export function mapPad(
  raw: RawPad,
  previous: RawPad | null,
  state: MapperState,
  settings: InputSettings,
  config: InputConfig,
  step: number,
  source: InputSource = 'gamepad',
): { readonly frame: InputFrame; readonly state: MapperState } {
  const pressed = (index: number): boolean => down(raw, index) && !down(previous, index);
  const buttons: ButtonAction[] = [];
  let { mode, fine } = state;

  // Y toggles Cath and Control in both modes; View and Menu work in both.
  if (pressed(PAD.y)) {
    mode = otherMode(mode);
    buttons.push('toggle-mode');
  }
  if (pressed(PAD.view)) {
    buttons.push('view-3d');
  }
  if (pressed(PAD.menu)) {
    buttons.push('pause');
  }

  // Sticks: mirror swaps them; invert-Y flips one; up is negative in the Gamepad API, so push = −y.
  const leftRaw: [number, number] = [raw.axes[PAD.axisLeftX] ?? 0, raw.axes[PAD.axisLeftY] ?? 0];
  const rightRaw: [number, number] = [raw.axes[PAD.axisRightX] ?? 0, raw.axes[PAD.axisRightY] ?? 0];
  const [first, second] = settings.mirrorSticks ? [rightRaw, leftRaw] : [leftRaw, rightRaw];
  const left = radialDeadZone(first[0], first[1], settings.deadZone, [0, 0]);
  const right = radialDeadZone(second[0], second[1], settings.deadZone, [0, 0]);
  const curve = (v: number) => responseCurve(v, settings.responseExponent);
  const leftX = curve(left[0]);
  const leftUp = curve(settings.invertLeftY ? left[1] : -left[1]);
  const rightX = curve(right[0]);
  const rightUp = curve(settings.invertRightY ? right[1] : -right[1]);

  const axes = zeroAxes();
  let fluoro: number;
  let inject = 0;
  const threshold = config.sticks.triggerThreshold;
  const lt = value(raw, PAD.lt);
  const rt = value(raw, PAD.rt);

  if (mode === 'cath') {
    if (pressed(PAD.l3)) {
      fine = !fine;
      buttons.push('fine');
    }
    if (pressed(PAD.r3)) {
      buttons.push('lock-pair');
    }
    const scale = fine ? config.devices.fineScale : 1;
    axes.outerPush = leftUp * scale;
    axes.outerRotate = leftX * scale;
    axes.innerPush = rightUp * scale;
    axes.innerRotate = rightX * scale;
    // Fluoro is a pedal: on from the threshold. The contrast puff follows the trigger.
    fluoro = lt >= threshold ? 1 : 0;
    inject = rt >= threshold ? rt : 0;
    const actions: [number, ButtonAction][] = [
      [PAD.lb, 'dsa'],
      [PAD.rb, 'picker'],
      [PAD.up, 'pair-up'],
      [PAD.down, 'pair-down'],
      [PAD.left, 'fov-wider'],
      [PAD.right, 'fov-narrower'],
      [PAD.a, 'act'],
      [PAD.b, 'back'],
      [PAD.x, 'roadmap'],
    ];
    for (const [index, action] of actions) {
      if (pressed(index)) {
        buttons.push(action);
      }
    }
  } else {
    // Left stick: up/down angulates (cranial up), left/right moves the detector. Right stick pans the table.
    axes.carmAngulate = leftUp;
    axes.detector = leftX;
    axes.tablePanX = rightX;
    axes.tablePanY = rightUp;
    // RT turns toward LAO (positive rotation), LT toward RAO, each at a rate proportional to the trigger.
    axes.carmRotate = clampUnit((rt >= threshold ? rt : 0) - (lt >= threshold ? lt : 0));
    // The D-pad is held: up/down table height, right widens and left narrows the collimation.
    axes.tableHeight = (down(raw, PAD.up) ? 1 : 0) - (down(raw, PAD.down) ? 1 : 0);
    axes.collimation = (down(raw, PAD.right) ? 1 : 0) - (down(raw, PAD.left) ? 1 : 0);
    // LB: fluoro while moving.
    fluoro = down(raw, PAD.lb) ? 1 : 0;
    const actions: [number, ButtonAction][] = [
      [PAD.rb, 'fov-cycle'],
      [PAD.a, 'save-angle'],
      [PAD.b, 'back'],
      [PAD.x, 'drugs'],
    ];
    for (const [index, action] of actions) {
      if (pressed(index)) {
        buttons.push(action);
      }
    }
  }
  return { frame: makeFrame(step, mode, axes, fluoro, inject, buttons, source), state: { mode, fine } };
}

/** A pad at rest: all axes and buttons zero, in the standard mapping's shape. */
export function neutralPad(): RawPad {
  return { axes: [0, 0, 0, 0], buttons: new Array<number>(PAD.home + 1).fill(0) };
}
