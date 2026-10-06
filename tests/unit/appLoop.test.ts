import { describe, expect, it } from 'vitest';
import { readFlags } from '../../src/app/flags';
import { inputConfig } from '../../src/data/inputConfig';
import { sandboxConfig } from '../../src/data/simConfig';
import { PAD } from '../../src/input/mapping/frame';
import { neutralPad } from '../../src/input/mapping/mapPad';
import { createInputLoop, type InputClient } from '../../src/input/sources/inputLoop';
import type { KeyboardSource } from '../../src/input/sources/keyboard';
import type { PointerSource } from '../../src/input/sources/pointer';
import { NO_POINTER } from '../../src/input/mapping/mapPointer';
import { NEUTRAL_AXES, neutralFrame, type InputFrame } from '../../src/sim/core/records';
import { SimEngine } from '../../src/sim/engine';
import { mergeFrames } from '../../src/worker/client';
import { nextTarget, slipClock, startClock, targetStep } from '../../src/worker/timing';
import { repository } from '../helpers/repository';

// The main-thread loop added in Phase D: URL flags, one message in flight with slow motion, the input loop's frame,
// the setup's wire choice and the snapshot's input state.

describe('URL flags', () => {
  it('reads ?fast=1 and ?webgl=1 and defaults both off', () => {
    expect(readFlags('')).toEqual({ fast: false, forceWebGL: false });
    expect(readFlags('?fast=1')).toEqual({ fast: true, forceWebGL: false });
    expect(readFlags('?fast=1&webgl=1')).toEqual({ fast: true, forceWebGL: true });
    expect(readFlags('?fast=0&webgl=no')).toEqual({ fast: false, forceWebGL: false });
  });
});

describe('slow motion', () => {
  it('never targets more than the per-message limit ahead of what was requested', () => {
    expect(nextTarget(100, 120, 64)).toBe(120);
    expect(nextTarget(100, 500, 64)).toBe(164);
    // Wall time never moves the target backward.
    expect(nextTarget(100, 90, 64)).toBe(100);
  });

  it('slips the clock so wall time maps to the capped target, and keeps pausing working', () => {
    const clock = startClock(0);
    // At 1 kHz, 2 s of wall time is step 2000; the worker only got to 164.
    const slipped = slipClock(clock, 2000, 164, 1000);
    expect(targetStep(slipped, 2000, 1000)).toBe(164);
    // From there it runs at real time again: 16 ms later is 16 steps later.
    expect(targetStep(slipped, 2016, 1000)).toBe(180);
  });

  it('merges held frames into the newest one and keeps every button press', () => {
    const { step: _a, ...first } = { ...neutralFrame(0, 'keyboard'), buttons: ['lock-pair' as const] };
    const { step: _b, ...second } = {
      ...neutralFrame(0, 'keyboard'),
      axes: { ...NEUTRAL_AXES, innerPush: 1 },
      buttons: ['picker' as const],
    };
    const merged = mergeFrames(mergeFrames(null, first), second);
    expect(merged.axes.innerPush).toBe(1);
    expect([...merged.buttons].sort()).toEqual(['lock-pair', 'picker']);
    expect(mergeFrames(null, second)).toBe(second);
  });
});

describe('input loop', () => {
  const config = inputConfig(repository());
  const keys = (down: string[]): KeyboardSource => ({
    state: () => ({ down: new Set(down) }),
    peek: () => ({ down: new Set(down) }),
    dispose: () => {},
  });
  const pointer: PointerSource = { take: () => NO_POINTER, dispose: () => {} };

  it('returns the frame it sends, with the mapper state, and takes over from a demo', () => {
    const sent: Omit<InputFrame, 'step'>[] = [];
    const commands: string[] = [];
    const client: InputClient = {
      tick: (_now, frame) => sent.push(frame),
      command: (command) => commands.push(command.cmd),
    };
    const base = neutralPad();
    const axes = [...base.axes];
    axes[PAD.axisRightY] = -1;
    const buttons = [...base.buttons];
    buttons[PAD.y] = 1;
    const gamepad = {
      id: 'Xbox Wireless Controller',
      mapping: 'standard',
      connected: true,
      axes,
      buttons: buttons.map((value) => ({ value, pressed: value > 0.5, touched: false })),
    } as unknown as Gamepad;
    const loop = createInputLoop({
      client,
      keyboard: keys([]),
      pointer,
      gamepads: { getGamepads: () => [gamepad] },
      settings: () => config.defaults,
      config,
    });
    const result = loop.frame(0, true);
    // Y toggled to Control mode on its press edge; the right stick now pans the table.
    expect(result.mapper.mode).toBe('control');
    expect(result.frame.buttons).toContain('toggle-mode');
    expect(result.reading.glyphs).toBe('xbox');
    expect(result.takeover).toBe(true);
    expect(commands).toEqual(['stop-autopilot']);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.mode).toBe('control');
  });

  it('keeps the D-pad, A and B out of the simulation while a panel is open', () => {
    const sent: Omit<InputFrame, 'step'>[] = [];
    const client: InputClient = { tick: (_now, frame) => sent.push(frame), command: () => {} };
    const base = neutralPad();
    const pressed = (indices: number[]): Gamepad => {
      const buttons = [...base.buttons];
      for (const index of indices) {
        buttons[index] = 1;
      }
      return {
        id: 'Xbox Wireless Controller',
        mapping: 'standard',
        connected: true,
        axes: [...base.axes],
        buttons: buttons.map((value) => ({ value, pressed: value > 0.5, touched: false })),
      } as unknown as Gamepad;
    };
    let pad = pressed([]);
    const loop = createInputLoop({
      client,
      keyboard: keys([]),
      pointer,
      gamepads: { getGamepads: () => [pad] },
      settings: () => config.defaults,
      config,
    });
    loop.frame(0, false, true);
    // Cath mode: D-pad right (field of view) and A, pressed with a panel open, reach the UI but not the engine; the
    // view button still does.
    pad = pressed([PAD.right, PAD.a, PAD.view]);
    const cath = loop.frame(16, false, true);
    expect(cath.frame.buttons).toEqual(['view-3d', 'fov-narrower', 'act']);
    expect(sent.at(-1)?.buttons).toEqual(['view-3d']);
    // Control mode: the held D-pad moves the table and collimation only when no panel is open.
    pad = pressed([PAD.y]);
    loop.frame(32, false, false);
    pad = pressed([PAD.up, PAD.right]);
    const open = loop.frame(48, false, true);
    expect(open.frame.axes.tableHeight).toBe(1);
    expect(sent.at(-1)?.axes.tableHeight).toBe(0);
    expect(sent.at(-1)?.axes.collimation).toBe(0);
    loop.frame(64, false, false);
    expect(sent.at(-1)?.axes.tableHeight).toBe(1);
    expect(sent.at(-1)?.axes.collimation).toBe(1);
  });
});

describe('sandbox setup choices', () => {
  it('puts the chosen wire in the inner slot, where the case starts that slot', () => {
    const base = sandboxConfig(repository());
    const bentson = sandboxConfig(repository(), { innerDevice: 'rm-bentson-035-145' });
    expect(bentson.stack.map((entry) => entry.rodModelId)).toEqual([
      'rm-berenstein-5f-65',
      'rm-bentson-035-145',
    ]);
    expect(bentson.stack[1]?.inserted).toBe(base.stack[1]?.inserted);
    expect(bentson.stack[1]?.rotation).toBe(base.stack[1]?.rotation);
    expect(() => sandboxConfig(repository(), { innerDevice: 'rm-not-there' })).toThrow(/inventory/);
  });

  it('reports in the snapshot the input the last step ran with and the anatomy in use', () => {
    const engine = new SimEngine();
    engine.load(sandboxConfig(repository(), { tierId: 'standard' }));
    expect(engine.snapshot().input).toEqual({ mode: 'cath', fluoro: 0, inject: 0 });
    engine.step({ ...neutralFrame(0, 'gamepad', 'control'), triggers: { fluoro: 1, inject: 0.4 } });
    expect(engine.snapshot().input).toEqual({ mode: 'control', fluoro: 1, inject: 0.4 });
    expect(engine.snapshot().fluoroLastStep).toBe(0);
    engine.step(neutralFrame(engine.currentStep));
    // Fluoro is off now, but the snapshot still tells that step 0 ran with it.
    expect(engine.snapshot().input.fluoro).toBe(0);
    expect(engine.snapshot().fluoroLastStep).toBe(0);
    expect(engine.snapshot().anatomyId).toBe('phantom-c-bifurcation');
    engine.command({ step: engine.currentStep, cmd: 'set-anatomy', args: { anatomy: 'phantom-b-bend' } });
    engine.step(neutralFrame(engine.currentStep));
    expect(engine.snapshot().anatomyId).toBe('phantom-b-bend');
  });
});

describe('keyboard source', () => {
  it('keeps a tap that starts and ends between two polls for one poll', async () => {
    const { createKeyboardSource } = await import('../../src/input/sources/keyboard');
    const listeners = new Map<string, (event: { code: string; preventDefault: () => void }) => void>();
    const target = {
      addEventListener: (
        type: string,
        listener: (event: { code: string; preventDefault: () => void }) => void,
      ) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as Window;
    const source = createKeyboardSource(target);
    const key = (type: string, code: string) => listeners.get(type)?.({ code, preventDefault: () => {} });
    key('keydown', 'KeyG');
    key('keyup', 'KeyG');
    expect(source.state().down.has('KeyG')).toBe(true);
    expect(source.state().down.has('KeyG')).toBe(false);
    key('keydown', 'KeyW');
    expect(source.state().down.has('KeyW')).toBe(true);
    expect(source.state().down.has('KeyW')).toBe(true);
    key('keyup', 'KeyW');
    expect(source.state().down.has('KeyW')).toBe(false);
    source.dispose();
    expect(listeners.size).toBe(0);
  });
});
