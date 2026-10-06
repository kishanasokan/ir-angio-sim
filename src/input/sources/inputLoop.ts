import type { ButtonAction, InputFrame } from '../../sim/core/records';
import type { InputConfig, InputSettings } from '../mapping/settings';
import { INITIAL_MAPPER_STATE, type MapperState } from '../mapping/frame';
import { arbitrate, initialArbiter, type ArbiterState } from './arbiter';
import { readGamepad, type PadReading } from './gamepad';
import type { KeyboardSource } from './keyboard';
import type { PointerSource } from './pointer';

/**
 * One animation frame of live input (spec 01 §3): poll the pad, read the keys and the mouse, let the arbiter merge
 * them into one frame, hand control back from a demo when the learner takes over (stop-autopilot), and send the frame
 * to the worker stamped with the steps it covers. The UI reads the same frame for its own actions (picker, inspector,
 * pause and the rest), so every source reaches it through one path (CLAUDE.md rule 6).
 */

/** The part of the physics client the loop drives. */
export interface InputClient {
  tick(now: number, frame: Omit<InputFrame, 'step'>): void;
  command(command: { readonly cmd: 'stop-autopilot'; readonly args: Record<string, never> }): void;
}

export interface InputLoopResult {
  /** The pad reading, for glyphs and the non-standard-mapping notice. */
  readonly reading: PadReading;
  /** The merged frame this animation frame produced (its step is stamped by the client). */
  readonly frame: InputFrame;
  /** Mode and fine mode after this frame. */
  readonly mapper: MapperState;
  /** True when this frame took over from a demo. */
  readonly takeover: boolean;
}

export interface InputLoop {
  /** Runs once per animation frame. With `panelOpen`, the controls that move through the panel stay out of the sim. */
  frame(now: number, demoRunning: boolean, panelOpen?: boolean): InputLoopResult;
}

/**
 * While a panel (picker, inspector, pause menu) is open, the D-pad, A and B move through it, as do Tab, Enter and
 * Backspace on the keyboard. Those presses belong to the panel, so the frame the simulation gets drops their actions
 * (pair moves, field of view, act, saved angle, back) and, in Control mode, the table height and collimation the
 * D-pad holds. Sticks, triggers and every other button still reach it, and the UI still reads the whole frame.
 */
const PANEL_NAVIGATION: readonly ButtonAction[] = [
  'pair-up',
  'pair-down',
  'fov-wider',
  'fov-narrower',
  'act',
  'save-angle',
  'back',
];

export function withoutPanelNavigation(frame: InputFrame): InputFrame {
  return {
    ...frame,
    axes: frame.mode === 'control' ? { ...frame.axes, tableHeight: 0, collimation: 0 } : frame.axes,
    buttons: frame.buttons.filter((action) => !PANEL_NAVIGATION.includes(action)),
  };
}

export function createInputLoop(options: {
  readonly client: InputClient;
  readonly keyboard: KeyboardSource;
  readonly pointer: PointerSource;
  readonly gamepads: Pick<Navigator, 'getGamepads'> | undefined;
  readonly settings: () => InputSettings;
  readonly config: InputConfig;
}): InputLoop {
  let state: ArbiterState = initialArbiter(INITIAL_MAPPER_STATE);
  let last: number | null = null;
  const MS_PER_S = 1000;
  return {
    frame(now: number, demoRunning: boolean, panelOpen = false): InputLoopResult {
      const reading = readGamepad(options.gamepads);
      const interval = last === null ? 0 : (now - last) / MS_PER_S;
      last = now;
      const result = arbitrate(
        state,
        {
          pad: reading.standard ? reading.pad : null,
          keys: options.keyboard.state(),
          pointer: options.pointer.take(),
          interval,
          step: 0,
          demoRunning,
        },
        options.settings(),
        options.config,
      );
      state = result.state;
      if (result.takeover) {
        options.client.command({ cmd: 'stop-autopilot', args: {} });
      }
      const { step: _step, ...frame } = panelOpen ? withoutPanelNavigation(result.frame) : result.frame;
      options.client.tick(now, frame);
      return { reading, frame: result.frame, mapper: result.state.mapper, takeover: result.takeover };
    },
  };
}
