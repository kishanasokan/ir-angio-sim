import { describe, expect, it } from 'vitest';
import { Session } from '../../src/worker/session';
import type { InputLog } from '../../src/sim/core/records';
import { demoSession, demoSetup } from './demo';
import { highTier } from './helpers';

// Golden scene 11 (prompts/M1-foundations.md §8): run sandbox-c-left for 10 simulated seconds twice: identical
// hash(). Change one input frame: a different hash. Record the input log (frames and commands) and replay it through
// a fresh engine: identical hash. A replay runs with the autopilot off and feeds the logged frames (D8).

const SECONDS = 10;

function replay(log: InputLog, steps: number): string {
  const session = new Session({ ...demoSetup(), replay: log });
  session.advance(steps, steps);
  return session.engine.hash();
}

describe('golden scene 11 · determinism and replay', () => {
  it('reproduces sandbox-c-left exactly, and a changed frame changes it', () => {
    const steps = SECONDS * highTier().stepRate;
    const first = demoSession('sandbox-c-left');
    first.advance(steps, steps);
    const second = demoSession('sandbox-c-left');
    second.advance(steps, steps);
    expect(second.engine.hash()).toBe(first.engine.hash());

    const log = first.log;
    expect(log.frames.every((frame) => frame.source === 'autopilot' || frame.source === 'replay')).toBe(true);
    expect(replay(log, steps)).toBe(first.engine.hash());

    // Change one frame: the wire pushes a little faster from that step until the next logged frame.
    const index = log.frames.findIndex((frame) => frame.axes.innerPush > 0);
    expect(index).toBeGreaterThanOrEqual(0);
    const frames = log.frames.map((frame, i) =>
      i === index ? { ...frame, axes: { ...frame.axes, innerPush: frame.axes.innerPush * 1.01 } } : frame,
    );
    expect(replay({ ...log, frames }, steps)).not.toBe(first.engine.hash());
    console.info(
      `hash after ${SECONDS} s: ${first.engine.hash()}; log of ${log.frames.length} frames and ${log.commands.length} commands`,
    );
  });
});
