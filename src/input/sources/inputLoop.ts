import type { InputConfig, InputSettings } from '../mapping/settings';
import { INITIAL_MAPPER_STATE } from '../mapping/frame';
import type { PhysicsClient } from '../../worker/client';
import { arbitrate, initialArbiter, type ArbiterState } from './arbiter';
import { readGamepad, type PadReading } from './gamepad';
import type { KeyboardSource } from './keyboard';
import type { PointerSource } from './pointer';

/**
 * One animation frame of live input (spec 01 §3): poll the pad, read the keys and the mouse, let the arbiter merge
 * them into one frame, hand control back from a demo when the learner takes over (stop-autopilot), and send the frame
 * to the worker stamped with the steps it covers.
 */

export interface InputLoop {
  /** Runs once per animation frame; returns the pad reading for glyphs and the non-standard-mapping notice. */
  frame(now: number, demoRunning: boolean): PadReading;
}

export function createInputLoop(options: {
  readonly client: PhysicsClient;
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
    frame(now: number, demoRunning: boolean): PadReading {
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
      const { step: _step, ...frame } = result.frame;
      options.client.tick(now, frame);
      return reading;
    },
  };
}
