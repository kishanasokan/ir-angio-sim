import type { ButtonAction, InputFrame } from '../../sim/core/records';
import { makeFrame, otherMode, zeroAxes, type MapperState } from './frame';
import type { InputConfig } from './settings';

/**
 * Keyboard mapping with full parity to the gamepad (prompts/M1-foundations.md §5). Keys are KeyboardEvent.code
 * values. Held keys drive the axes at full speed; Shift applies fine mode while held (docs/M1-plan.md D20); action
 * keys fire on press edges.
 */

export interface KeyState {
  readonly down: ReadonlySet<string>;
}

export const NO_KEYS: KeyState = { down: new Set() };

const axis = (keys: KeyState, positive: string, negative: string): number =>
  (keys.down.has(positive) ? 1 : 0) - (keys.down.has(negative) ? 1 : 0);

export function mapKeyboard(
  keys: KeyState,
  previous: KeyState,
  state: MapperState,
  config: InputConfig,
  step: number,
): { readonly frame: InputFrame; readonly state: MapperState } {
  const pressed = (code: string): boolean => keys.down.has(code) && !previous.down.has(code);
  const shift = keys.down.has('ShiftLeft') || keys.down.has('ShiftRight');
  const buttons: ButtonAction[] = [];
  let { mode } = state;

  if (pressed('KeyC')) {
    mode = otherMode(mode);
    buttons.push('toggle-mode');
  }
  const both: [string, ButtonAction][] = [
    ['KeyG', 'view-3d'],
    ['Escape', 'pause'],
    ['KeyI', 'inspector'],
    ['KeyP', 'perf'],
    ['KeyZ', 'fov-wider'],
    ['KeyX', 'fov-narrower'],
  ];
  for (const [code, action] of both) {
    if (pressed(code)) {
      buttons.push(action);
    }
  }

  const axes = zeroAxes();
  let fluoro = keys.down.has('Space') ? 1 : 0;
  let inject = 0;
  if (mode === 'cath') {
    const scale = shift || state.fine ? config.devices.fineScale : 1;
    axes.innerPush = axis(keys, 'KeyW', 'KeyS') * scale;
    axes.innerRotate = axis(keys, 'KeyD', 'KeyA') * scale;
    axes.outerPush = axis(keys, 'ArrowUp', 'ArrowDown') * scale;
    axes.outerRotate = axis(keys, 'ArrowRight', 'ArrowLeft') * scale;
    inject = keys.down.has('KeyE') ? 1 : 0;
    if (pressed('Tab')) {
      buttons.push(shift ? 'pair-up' : 'pair-down');
    }
    const actions: [string, ButtonAction][] = [
      ['KeyL', 'lock-pair'],
      ['KeyR', 'roadmap'],
      ['KeyF', 'dsa'],
      ['KeyB', 'picker'],
      ['Enter', 'act'],
      ['Backspace', 'back'],
    ];
    for (const [code, action] of actions) {
      if (pressed(code)) {
        buttons.push(action);
      }
    }
  } else {
    axes.carmRotate = axis(keys, 'KeyE', 'KeyQ');
    axes.carmAngulate = axis(keys, 'KeyW', 'KeyS');
    axes.tablePanX = axis(keys, 'ArrowRight', 'ArrowLeft');
    axes.tablePanY = axis(keys, 'ArrowUp', 'ArrowDown');
    axes.tableHeight = axis(keys, 'PageUp', 'PageDown');
    axes.collimation = axis(keys, 'BracketRight', 'BracketLeft');
    axes.detector = axis(keys, 'Equal', 'Minus');
    fluoro = keys.down.has('Space') ? 1 : 0;
    const actions: [string, ButtonAction][] = [
      ['Enter', 'save-angle'],
      ['KeyD', 'drugs'],
      ['Backspace', 'back'],
    ];
    for (const [code, action] of actions) {
      if (pressed(code)) {
        buttons.push(action);
      }
    }
  }
  return {
    frame: makeFrame(step, mode, axes, fluoro, inject, buttons, 'keyboard'),
    state: { ...state, mode },
  };
}
