import { describe, expect, it } from 'vitest';
import { inputConfig } from '../../src/data/inputConfig';
import { deflectionFor, radialDeadZone, responseCurve } from '../../src/input/mapping/curves';
import { INITIAL_MAPPER_STATE, PAD } from '../../src/input/mapping/frame';
import { mapKeyboard, NO_KEYS } from '../../src/input/mapping/mapKeyboard';
import { mapPad, neutralPad } from '../../src/input/mapping/mapPad';
import { mapPointer, NO_POINTER } from '../../src/input/mapping/mapPointer';
import { virtualPadToRaw } from '../../src/input/mapping/virtualPad';
import type { RawPad } from '../../src/sim/core/records';
import { repository } from '../helpers/repository';

// Unit test 10 (prompts/M1-foundations.md §8): input mapping.

const config = inputConfig(repository());
const settings = config.defaults;

function pad(changes: { axes?: Record<number, number>; buttons?: Record<number, number> } = {}): RawPad {
  const base = neutralPad();
  const axes = [...base.axes];
  const buttons = [...base.buttons];
  for (const [index, value] of Object.entries(changes.axes ?? {})) {
    axes[Number(index)] = value;
  }
  for (const [index, value] of Object.entries(changes.buttons ?? {})) {
    buttons[Number(index)] = value;
  }
  return { axes, buttons };
}

describe('input mapping', () => {
  it('has a dead zone and curve that are monotonic and keep the sign', () => {
    let previous = -Infinity;
    for (let i = -1000; i <= 1000; i += 1) {
      const x = i / 1000;
      const out = responseCurve(
        radialDeadZone(x, 0, settings.deadZone, [0, 0])[0],
        settings.responseExponent,
      );
      expect(out).toBeGreaterThanOrEqual(previous);
      expect(Math.sign(out) === Math.sign(x) || out === 0).toBe(true);
      expect(Math.abs(x) <= settings.deadZone ? out : 1).not.toBe(Math.abs(x) <= settings.deadZone ? 1 : 0);
      previous = out;
    }
    expect(responseCurve(radialDeadZone(1, 0, settings.deadZone, [0, 0])[0], settings.responseExponent)).toBe(
      1,
    );
    // The inverse the autopilot uses lands exactly back on the requested rate.
    const deflection = deflectionFor(0.25, settings.deadZone, settings.responseExponent);
    expect(
      responseCurve(radialDeadZone(deflection, 0, settings.deadZone, [0, 0])[0], settings.responseExponent),
    ).toBeCloseTo(0.25, 12);
  });

  it('pushes forward when a stick is held up (the Gamepad API reports up as negative)', () => {
    const { frame } = mapPad(
      pad({ axes: { [PAD.axisRightY]: -1, [PAD.axisLeftY]: 1 } }),
      null,
      INITIAL_MAPPER_STATE,
      settings,
      config,
      0,
    );
    expect(frame.axes.innerPush).toBe(1);
    expect(frame.axes.outerPush).toBe(-1);
  });

  it('toggles the mode with Y on the press edge only', () => {
    const held = pad({ buttons: { [PAD.y]: 1 } });
    const first = mapPad(held, neutralPad(), INITIAL_MAPPER_STATE, settings, config, 0);
    expect(first.state.mode).toBe('control');
    expect(first.frame.buttons).toContain('toggle-mode');
    const second = mapPad(held, held, first.state, settings, config, 1);
    expect(second.state.mode).toBe('control');
    expect(second.frame.buttons).toEqual([]);
    const again = mapPad(held, neutralPad(), second.state, settings, config, 2);
    expect(again.state.mode).toBe('cath');
  });

  it('toggles fine mode with L3 and the pair lock with R3', () => {
    const l3 = mapPad(pad({ buttons: { [PAD.l3]: 1 } }), null, INITIAL_MAPPER_STATE, settings, config, 0);
    expect(l3.state.fine).toBe(true);
    const slow = mapPad(pad({ axes: { [PAD.axisRightY]: -1 } }), null, l3.state, settings, config, 1);
    expect(slow.frame.axes.innerPush).toBeCloseTo(config.devices.fineScale, 12);
    const r3 = mapPad(pad({ buttons: { [PAD.r3]: 1 } }), null, INITIAL_MAPPER_STATE, settings, config, 0);
    expect(r3.frame.buttons).toContain('lock-pair');
  });

  it('gives the same intents from the keyboard and the mouse as from the sticks', () => {
    // One axis at a time: a diagonal stick shares its radial deflection between the axes.
    const up = mapPad(
      pad({ axes: { [PAD.axisRightY]: -1 } }),
      null,
      INITIAL_MAPPER_STATE,
      settings,
      config,
      0,
    ).frame;
    const right = mapPad(
      pad({ axes: { [PAD.axisRightX]: 1 } }),
      null,
      INITIAL_MAPPER_STATE,
      settings,
      config,
      0,
    ).frame;
    const stick = { axes: { innerPush: up.axes.innerPush, innerRotate: right.axes.innerRotate } };
    const keys = mapKeyboard(
      { down: new Set(['KeyW', 'KeyD']) },
      NO_KEYS,
      INITIAL_MAPPER_STATE,
      config,
      0,
    ).frame;
    expect(keys.axes.innerPush).toBe(stick.axes.innerPush);
    expect(keys.axes.innerRotate).toBe(stick.axes.innerRotate);
    // A full-speed upward and rightward drag over one interval.
    const interval = 0.02;
    const dy = (config.devices.advanceSpeedMax * interval) / config.mouse.dragAdvancePerPixel;
    const dx = (config.devices.rotationSpeedMax * interval) / config.mouse.dragRotatePerPixel;
    const mouse = mapPointer(
      { ...NO_POINTER, leftDx: dx, leftDy: -dy },
      interval,
      INITIAL_MAPPER_STATE,
      config,
      0,
    ).frame;
    expect(mouse.axes.innerPush).toBeCloseTo(stick.axes.innerPush, 12);
    expect(mouse.axes.innerRotate).toBeCloseTo(stick.axes.innerRotate, 12);
    // Faster drags are capped at full speed.
    expect(
      mapPointer({ ...NO_POINTER, leftDy: -10 * dy }, interval, INITIAL_MAPPER_STATE, config, 0).frame.axes
        .innerPush,
    ).toBe(1);
    // Shift is fine mode on the keyboard while held.
    const fine = mapKeyboard(
      { down: new Set(['KeyW', 'ShiftLeft']) },
      NO_KEYS,
      INITIAL_MAPPER_STATE,
      config,
      0,
    ).frame;
    expect(fine.axes.innerPush).toBeCloseTo(config.devices.fineScale, 12);
    // Mode toggles: C on the keyboard, like Y.
    expect(
      mapKeyboard({ down: new Set(['KeyC']) }, NO_KEYS, INITIAL_MAPPER_STATE, config, 0).state.mode,
    ).toBe('control');
  });

  it('routes LT and RT to C-arm rotation in Control mode', () => {
    const control = { ...INITIAL_MAPPER_STATE, mode: 'control' as const };
    const lao = mapPad(pad({ buttons: { [PAD.rt]: 0.8 } }), null, control, settings, config, 0).frame;
    expect(lao.axes.carmRotate).toBeCloseTo(0.8, 12);
    expect(lao.triggers.inject).toBe(0);
    const rao = mapPad(pad({ buttons: { [PAD.lt]: 0.5 } }), null, control, settings, config, 0).frame;
    expect(rao.axes.carmRotate).toBeCloseTo(-0.5, 12);
    expect(rao.triggers.fluoro).toBe(0);
    // In Cath mode the same triggers are fluoro and the contrast puff.
    const cath = mapPad(
      pad({ buttons: { [PAD.lt]: 0.5, [PAD.rt]: 0.8 } }),
      null,
      INITIAL_MAPPER_STATE,
      settings,
      config,
      0,
    ).frame;
    expect(cath.triggers.fluoro).toBe(1);
    expect(cath.triggers.inject).toBeCloseTo(0.8, 12);
    expect(cath.axes.carmRotate).toBe(0);
  });

  it('swaps the sticks when mirrored', () => {
    const raw = pad({ axes: { [PAD.axisLeftY]: -1 } });
    const normal = mapPad(raw, null, INITIAL_MAPPER_STATE, settings, config, 0).frame;
    const mirrored = mapPad(
      raw,
      null,
      INITIAL_MAPPER_STATE,
      { ...settings, mirrorSticks: true },
      config,
      0,
    ).frame;
    expect(normal.axes.outerPush).toBe(1);
    expect(normal.axes.innerPush).toBeCloseTo(0, 12);
    expect(mirrored.axes.innerPush).toBe(1);
    expect(mirrored.axes.outerPush).toBeCloseTo(0, 12);
  });

  it('maps autopilot pads with the default settings, whatever the learner chose', () => {
    const wanted = { outerPush: 0, outerRotate: 0, innerPush: 1 / 3, innerRotate: -0.25, buttons: [PAD.lt] };
    const raw = virtualPadToRaw(wanted, settings);
    const frame = mapPad(raw, null, INITIAL_MAPPER_STATE, settings, config, 0, 'autopilot').frame;
    expect(frame.axes.innerPush).toBeCloseTo(1 / 3, 12);
    expect(frame.axes.innerRotate).toBeCloseTo(-0.25, 12);
    expect(frame.triggers.fluoro).toBe(1);
    expect(frame.source).toBe('autopilot');
    // The same pad through a learner's settings would not give the requested rates; the session never does that.
    const learner = { ...settings, invertRightY: true, mirrorSticks: true, responseExponent: 3 };
    const skewed = mapPad(raw, null, INITIAL_MAPPER_STATE, learner, config, 0).frame;
    expect(skewed.axes.innerPush).not.toBeCloseTo(1 / 3, 3);
  });
});
