import { neutralFrame, type InputFrame, type InputLog } from '../../sim/core/records';

/**
 * The replay source: a recorded log's frames, held from each frame's step until the next (spec 01 §3). A replay
 * replaces the live sources; its commands go to the worker with it (docs/M1-plan.md D8).
 */
export interface ReplaySource {
  /** The frame in force at a step. */
  frameAt(step: number): InputFrame;
  readonly log: InputLog;
}

export function createReplaySource(log: InputLog): ReplaySource {
  const frames = [...log.frames].sort((a, b) => a.step - b.step);
  return {
    log,
    frameAt(step: number): InputFrame {
      let found: InputFrame | undefined;
      for (const frame of frames) {
        if (frame.step > step) {
          break;
        }
        found = frame;
      }
      return found ?? neutralFrame(step, 'replay');
    },
  };
}
