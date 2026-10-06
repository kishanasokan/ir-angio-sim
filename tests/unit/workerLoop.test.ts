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
import { readDataFiles } from '../../scripts/lib/dataFiles';
import { defaultInputSettings } from '../../src/data/inputConfig';
import { sandboxSession } from '../../src/data/sessionSetup';
import { sandboxConfig } from '../../src/data/simConfig';
import type { InputSettings } from '../../src/input/mapping/settings';
import { NEUTRAL_AXES, neutralFrame } from '../../src/sim/core/records';
import { APP_VERSION, demoSession, demoSetup } from '../golden/demo';
import { DATA_ROOT, repository } from '../helpers/repository';

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

  it('chooses the first tier within the budget, else the fallback', () => {
    expect(physicsPerFrame(0.25, 1000, 60)).toBeCloseTo(4.1667, 4);
    expect(chooseTier([{ id: 'high', msPerFrame: 3.9 }], 4, 'fallback')).toBe('high');
    const costs = [
      { id: 'high', msPerFrame: 4.2 },
      { id: 'standard', msPerFrame: 1.5 },
    ];
    expect(chooseTier(costs, 4, 'fallback')).toBe('standard');
    expect(chooseTier(costs, 1, 'fallback')).toBe('fallback');
  });

  it('benchmarks the high tier at depth with the clock it is given', () => {
    // A fake clock that advances 1 ms per reading: the 300 steps take 1 ms, so 1/300 ms per step at 1 kHz.
    let fake = 0;
    const cheap = benchmarkTier(repository(), () => (fake += 1));
    expect(cheap.tierId).toBe('high');
    expect(cheap.highMsPerFrame).toBeCloseTo(physicsPerFrame(1 / 300, 1000, 60), 9);
    // A clock that advances 2 s per reading: far over the 4 ms budget on both rod tiers, so the rail fallback.
    let slow = 0;
    const choice = benchmarkTier(repository(), () => (slow += 2000));
    expect(choice.costs.map((cost) => cost.id)).toEqual(['high', 'standard']);
    expect(choice.tierId).toBe('fallback');
    // A clock that is slow only for the high tier's run: the standard tier.
    let reading = 0;
    let calls = 0;
    const mixed = benchmarkTier(repository(), () => {
      calls += 1;
      reading += calls <= 2 ? 2000 : 1;
      return reading;
    });
    expect(mixed.tierId).toBe('standard');
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

  it("drives a demo the same way whatever input settings the learner chose (unit test 10's last case)", () => {
    // Long enough for the wire to advance, turn and fluoro to tap: every kind of autopilot input.
    const steps = 3000;
    const run = (settings?: InputSettings) => {
      const setup = sandboxSession(repository(), {
        appVersion: APP_VERSION,
        files: readDataFiles(DATA_ROOT),
        ...(settings === undefined ? {} : { settings }),
      });
      const session = demoSession('sandbox-c-left', setup);
      session.advance(steps, steps);
      return session;
    };
    const defaults = run();
    const learner = run({
      ...defaultInputSettings(repository()),
      deadZone: 0.3,
      responseExponent: 3,
      invertLeftY: true,
      invertRightY: true,
      mirrorSticks: true,
    });
    expect(defaults.engine.currentStep).toBe(steps);
    expect(learner.log.settings).not.toEqual(defaults.log.settings);
    expect(learner.log.frames).toEqual(defaults.log.frames);
    expect(learner.engine.hash()).toBe(defaults.engine.hash());
    expect(defaults.engine.device(1).inserted).toBeGreaterThan(
      sandboxConfig(repository()).stack[1]!.inserted,
    );
  });
});
