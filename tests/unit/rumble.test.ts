import { describe, expect, it } from 'vitest';
import { rumbleConfig } from '../../src/data/inputConfig';
import {
  INITIAL_RUMBLE,
  playRumble,
  rumbleStep,
  rumbleSupported,
  type RumbleCommand,
  type RumbleInput,
  type RumbleState,
} from '../../src/input/rumble';
import { repository } from '../helpers/repository';

// Unit test 12 (prompts/M1-foundations.md §8): the rumble scheduler.

const config = rumbleConfig(repository());
const TICK = 0.001;

/** Runs the scheduler every millisecond for `seconds`, with events at the start; returns each call and its time. */
function run(seconds: number, input: Partial<RumbleInput>, events: readonly string[] = []) {
  let state: RumbleState = INITIAL_RUMBLE;
  const calls: { time: number; command: RumbleCommand }[] = [];
  for (let k = 0; k * TICK < seconds; k += 1) {
    const time = k * TICK;
    const step = rumbleStep(state, config, {
      time,
      tipForce: 0,
      events: k === 0 ? events : [],
      strength: 1,
      enabled: true,
      supported: true,
      ...input,
    });
    state = step.state;
    if (step.command !== null) {
      calls.push({ time, command: step.command });
    }
  }
  return calls;
}

describe('rumble scheduler', () => {
  it('clamps magnitudes to 0..1', () => {
    const calls = run(0.5, { tipForce: 50 * config.contactFullScaleForce, strength: 3 }, [
      'hub-force-danger',
    ]);
    expect(calls.length).toBeGreaterThan(0);
    for (const { command } of calls) {
      for (const magnitude of [command.strong, command.weak]) {
        expect(magnitude).toBeGreaterThanOrEqual(0);
        expect(magnitude).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never calls the actuator more than updateRate times per second', () => {
    const calls = run(2, { tipForce: config.contactFullScaleForce }, ['vital-alarm', 'coil-release']);
    for (let i = 1; i < calls.length; i += 1) {
      expect(calls[i]!.time - calls[i - 1]!.time).toBeGreaterThanOrEqual(1 / config.updateRate - 1e-9);
    }
    expect(calls.length).toBeLessThanOrEqual(2 * config.updateRate + 1);
  });

  it('makes no calls when rumble is off or unsupported', () => {
    expect(run(1, { enabled: false, tipForce: 1 }, ['hub-force-danger'])).toEqual([]);
    expect(run(1, { supported: false, tipForce: 1 }, ['hub-force-danger'])).toEqual([]);
  });

  it('plays each event as its pattern', () => {
    for (const [id, pattern] of Object.entries(config.events)) {
      const calls = run(3, {}, [id]);
      const pulses = pattern.pattern === 'double' ? 2 : pattern.pattern === 'pulsed' ? pattern.repeats : 1;
      expect(calls.length, id).toBe(pulses);
      for (const [k, { time, command }] of calls.entries()) {
        expect(command.strong, id).toBeCloseTo(pattern.strong, 12);
        expect(command.weak, id).toBeCloseTo(pattern.weak, 12);
        expect(command.duration, id).toBeCloseTo(pattern.duration, 12);
        // Pulses keep their spacing (rounded up to the next tick).
        expect(time, id).toBeCloseTo(k * (pattern.duration + pattern.gap), 2);
      }
    }
  });

  it('drives the weak motor with the tip force, scaled by strength', () => {
    const half = run(0.05, { tipForce: 0.5 * config.contactFullScaleForce, strength: 0.5 });
    expect(half[0]?.command.weak).toBeCloseTo(0.25 * config.contactWeakMax, 12);
    expect(half[0]?.command.strong).toBe(0);
    expect(half[0]?.command.duration).toBeCloseTo(config.contactDuration, 12);
  });
});

describe('rumble adapter', () => {
  it('plays on a pad with an actuator and does nothing without one', () => {
    const played: Record<string, number>[] = [];
    const pad = {
      vibrationActuator: {
        playEffect: (type: 'dual-rumble', params: Record<string, number>) => {
          expect(type).toBe('dual-rumble');
          played.push(params);
          return Promise.resolve('complete');
        },
      },
    };
    expect(rumbleSupported(pad)).toBe(true);
    playRumble(pad, { strong: 0.7, weak: 0.2, duration: 0.08 });
    expect(played).toEqual([{ startDelay: 0, duration: 80, strongMagnitude: 0.7, weakMagnitude: 0.2 }]);
    expect(rumbleSupported({})).toBe(false);
    expect(() => playRumble({}, { strong: 1, weak: 1, duration: 1 })).not.toThrow();
    expect(() => playRumble(null, { strong: 1, weak: 1, duration: 1 })).not.toThrow();
  });
});
