import { describe, expect, it } from 'vitest';
import { sandboxConfig } from '../../src/data/simConfig';
import { NEUTRAL_AXES, type InputAxes } from '../../src/sim/core/records';
import {
  activePair,
  createStack,
  deviceInputs,
  moveActivePair,
  toggleLock,
} from '../../src/sim/devices/stack';
import { SimEngine } from '../../src/sim/engine';
import { repository } from '../helpers/repository';

// Unit test 11 (prompts/M1-foundations.md §8): the device stack.

const axes = (overrides: Partial<InputAxes>): InputAxes => ({ ...NEUTRAL_AXES, ...overrides });

describe('device stack', () => {
  it('cannot move the active pair with two movable devices, and can with three (synthetic stack)', () => {
    const two = createStack(2);
    expect(activePair(two)).toEqual({ outer: 0, inner: 1 });
    expect(moveActivePair(two, -1)).toBe(two);
    expect(moveActivePair(two, 1)).toBe(two);

    const three = createStack(3);
    expect(activePair(three)).toEqual({ outer: 1, inner: 2 });
    const moved = moveActivePair(three, -1);
    expect(activePair(moved)).toEqual({ outer: 0, inner: 1 });
    expect(activePair(moveActivePair(moved, -1))).toEqual({ outer: 0, inner: 1 });
  });

  it('drives a lone device as the inner device (D11)', () => {
    const inputs = deviceInputs(createStack(1), axes({ innerPush: 0.5, outerPush: 0.9 }));
    expect(inputs.push).toEqual([0.5]);
  });

  it('moves both devices of a locked pair with the summed, clamped sticks (D20)', () => {
    const locked = toggleLock(createStack(2));
    const inputs = deviceInputs(
      locked,
      axes({ innerPush: 0.5, outerPush: 0.25, innerRotate: 0.8, outerRotate: 0.6 }),
    );
    expect(inputs.push).toEqual([0.75, 0.75]);
    expect(inputs.rotate).toEqual([1, 1]);
  });

  it('leaves devices outside the active pair undriven', () => {
    const inputs = deviceInputs(
      createStack(3),
      axes({ innerPush: 1, outerPush: 1, innerRotate: 1, outerRotate: 1 }),
    );
    expect(inputs.push[0]).toBe(0);
    expect(inputs.rotate[0]).toBe(0);
  });

  it('keeps an undriven device at its L and φ while the other moves', () => {
    const engine = new SimEngine();
    engine.load(sandboxConfig(repository()));
    const catheter = { inserted: engine.device(0).inserted, rotation: engine.device(0).rotation };
    const wire = engine.device(1).inserted;
    for (let n = 0; n < 200; n += 1) {
      engine.step({
        step: engine.currentStep,
        mode: 'cath',
        axes: axes({ innerPush: 0.5, innerRotate: 0.5 }),
        triggers: { fluoro: 0, inject: 0 },
        buttons: [],
        source: 'replay',
      });
    }
    expect(engine.device(0).inserted).toBe(catheter.inserted);
    expect(engine.device(0).rotation).toBe(catheter.rotation);
    expect(engine.device(1).inserted).toBeGreaterThan(wire);
  });
});
