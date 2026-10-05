import { describe, expect, it } from 'vitest';
import { inputConfig } from '../../src/data/inputConfig';
import { INITIAL_MAPPER_STATE, PAD } from '../../src/input/mapping/frame';
import { NO_KEYS } from '../../src/input/mapping/mapKeyboard';
import { neutralPad } from '../../src/input/mapping/mapPad';
import { NO_POINTER } from '../../src/input/mapping/mapPointer';
import { arbitrate, initialArbiter } from '../../src/input/sources/arbiter';
import { glyphSetFor, readGamepad } from '../../src/input/sources/gamepad';
import { createReplaySource } from '../../src/input/sources/replay';
import { NEUTRAL_AXES, neutralFrame, type InputLog, type RawPad } from '../../src/sim/core/records';
import { repository } from '../helpers/repository';

const config = inputConfig(repository());
const settings = config.defaults;

function pad(axes: Record<number, number> = {}, buttons: Record<number, number> = {}): RawPad {
  const base = neutralPad();
  return {
    axes: base.axes.map((value, i) => axes[i] ?? value),
    buttons: base.buttons.map((value, i) => buttons[i] ?? value),
  };
}

const input = (changes: Partial<Parameters<typeof arbitrate>[1]> = {}) => ({
  pad: null,
  keys: NO_KEYS,
  pointer: NO_POINTER,
  interval: 1 / 60,
  step: 0,
  demoRunning: false,
  ...changes,
});

describe('gamepad source', () => {
  it('tells glyph sets from pad ids', () => {
    expect(glyphSetFor('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)')).toBe('xbox');
    expect(glyphSetFor('8BitDo Ultimate 2C (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(glyphSetFor('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c)')).toBe('playstation');
    expect(glyphSetFor('Logitech Dual Action')).toBe('generic');
  });

  it('reads the first connected pad and reports a non-standard mapping', () => {
    const fake = {
      id: 'Logitech Dual Action',
      connected: true,
      mapping: '',
      axes: [0.5, 0, 0, -1],
      buttons: [{ value: 1 }, { value: 0 }],
    } as unknown as Gamepad;
    const reading = readGamepad({ getGamepads: () => [null, fake] });
    expect(reading.pad?.axes).toEqual([0.5, 0, 0, -1]);
    expect(reading.pad?.buttons).toEqual([1, 0]);
    expect(reading.standard).toBe(false);
    expect(readGamepad({ getGamepads: () => [] }).pad).toBeNull();
    expect(readGamepad(undefined).pad).toBeNull();
  });
});

describe('arbiter', () => {
  it('merges the sources: the largest request per axis, and every button', () => {
    const result = arbitrate(
      initialArbiter(INITIAL_MAPPER_STATE),
      input({ pad: pad({ [PAD.axisLeftY]: -1 }), keys: { down: new Set(['KeyW', 'KeyR']) } }),
      settings,
      config,
    );
    expect(result.frame.axes.outerPush).toBe(1);
    expect(result.frame.axes.innerPush).toBe(1);
    expect(result.frame.buttons).toContain('roadmap');
    expect(result.takeover).toBe(false);
  });

  it('shares the mode between sources', () => {
    const first = arbitrate(
      initialArbiter(INITIAL_MAPPER_STATE),
      input({ keys: { down: new Set(['KeyC']) } }),
      settings,
      config,
    );
    expect(first.frame.mode).toBe('control');
    const second = arbitrate(
      first.state,
      input({ pad: pad({}, { [PAD.y]: 1 }), keys: NO_KEYS }),
      settings,
      config,
    );
    expect(second.frame.mode).toBe('cath');
  });

  it('takes over from a demo on a deflected stick or any button, not on a resting pad', () => {
    const state = initialArbiter(INITIAL_MAPPER_STATE);
    const resting = arbitrate(
      state,
      input({ demoRunning: true, pad: pad({ [PAD.axisRightY]: 0.1 }) }),
      settings,
      config,
    );
    expect(resting.takeover).toBe(false);
    expect(
      arbitrate(state, input({ demoRunning: true, pad: pad({ [PAD.axisRightX]: 0.5 }) }), settings, config)
        .takeover,
    ).toBe(true);
    expect(
      arbitrate(state, input({ demoRunning: true, pad: pad({}, { [PAD.a]: 1 }) }), settings, config).takeover,
    ).toBe(true);
    expect(
      arbitrate(state, input({ demoRunning: true, keys: { down: new Set(['KeyW']) } }), settings, config)
        .takeover,
    ).toBe(true);
    expect(
      arbitrate(state, input({ demoRunning: true, pointer: { ...NO_POINTER, wheel: 1 } }), settings, config)
        .takeover,
    ).toBe(true);
    expect(arbitrate(state, input({ pad: pad({ [PAD.axisRightX]: 0.5 }) }), settings, config).takeover).toBe(
      false,
    );
  });
});

describe('replay source', () => {
  it('holds each logged frame from its step until the next', () => {
    const push = { ...neutralFrame(10, 'gamepad'), axes: { ...NEUTRAL_AXES, innerPush: 0.5 } };
    const log: InputLog = {
      schema: 'ir-sim/input-log@1',
      appVersion: 't',
      dataHash: 'x',
      seed: 1,
      caseId: 'c',
      anatomyId: 'a',
      settings: {},
      frames: [neutralFrame(0, 'gamepad'), push, { ...push, step: 20, axes: NEUTRAL_AXES }],
      commands: [],
    };
    const replay = createReplaySource(log);
    expect(replay.frameAt(5).axes.innerPush).toBe(0);
    expect(replay.frameAt(10).axes.innerPush).toBe(0.5);
    expect(replay.frameAt(19).axes.innerPush).toBe(0.5);
    expect(replay.frameAt(25).axes.innerPush).toBe(0);
  });
});
