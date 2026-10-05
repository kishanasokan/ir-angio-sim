import { describe, expect, it } from 'vitest';
import { benchmarkTier } from '../../src/worker/benchmark';
import { Session } from '../../src/worker/session';
import {
  chooseTier,
  pauseClock,
  physicsPerFrame,
  resumeClock,
  startClock,
  targetStep,
} from '../../src/worker/timing';
import { NEUTRAL_AXES, neutralFrame } from '../../src/sim/core/records';
import { demoSetup } from '../golden/demo';
import { repository } from '../helpers/repository';

describe('loop timing', () => {
  it('turns wall time into a target step, and pausing stops it', () => {
    let clock = startClock(1000);
    expect(targetStep(clock, 1000, 1000)).toBe(0);
    expect(targetStep(clock, 1500, 1000)).toBe(500);
    clock = pauseClock(clock, 1500);
    expect(targetStep(clock, 4000, 1000)).toBe(500);
    clock = resumeClock(clock, 4000);
    expect(targetStep(clock, 4100, 1000)).toBe(600);
    expect(targetStep(clock, 4100, 500)).toBe(300);
  });

  it('chooses the standard tier when the high tier costs more than the budget', () => {
    expect(physicsPerFrame(0.25, 1000, 60)).toBeCloseTo(4.1667, 4);
    expect(chooseTier(4.2, 4, 'high', 'standard')).toBe('standard');
    expect(chooseTier(3.9, 4, 'high', 'standard')).toBe('high');
  });

  it('benchmarks the high tier at depth with the clock it is given', () => {
    // A fake clock that advances 1 ms per reading: the 300 steps take 1 ms, so 1/300 ms per step at 1 kHz.
    let fake = 0;
    const cheap = benchmarkTier(repository(), () => (fake += 1));
    expect(cheap.tierId).toBe('high');
    expect(cheap.highMsPerFrame).toBeCloseTo(physicsPerFrame(1 / 300, 1000, 60), 9);
    // A clock that advances 2 s per reading: far over the 4 ms budget.
    let slow = 0;
    expect(benchmarkTier(repository(), () => (slow += 2000)).tierId).toBe('standard');
  });
});

describe('session runner', () => {
  it('holds a frame until the next one and applies its buttons on its first step only', () => {
    const session = new Session(demoSetup());
    const lock = { ...neutralFrame(0, 'gamepad'), buttons: ['lock-pair' as const] };
    session.input([lock]);
    session.advance(3, 3);
    expect(session.engine.snapshot().stack.locked).toBe(true);
    const push = { ...neutralFrame(3, 'gamepad'), axes: { ...NEUTRAL_AXES, innerPush: 1 } };
    session.input([push]);
    const before = session.engine.device(1).inserted;
    session.advance(13, 100);
    expect(session.engine.currentStep).toBe(13);
    expect(session.engine.device(1).inserted).toBeGreaterThan(before);
    // The lock toggled once, not on every step the frame was held.
    expect(session.engine.snapshot().stack.locked).toBe(true);
    const log = session.log;
    expect(log.commands[0]).toMatchObject({ step: 0, cmd: 'set-tier' });
    expect(log.frames.map((frame) => frame.step)).toEqual([0, 1, 3]);
  });

  it('runs at most the per-message limit of steps', () => {
    const session = new Session(demoSetup());
    expect(session.advance(1000, 64)).toBe(64);
    expect(session.engine.currentStep).toBe(64);
  });
});
