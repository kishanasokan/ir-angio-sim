import { describe, expect, it } from 'vitest';
import { sandboxConfig } from '../../src/data/simConfig';
import { NEUTRAL_AXES, type InputAxes, type InputFrame } from '../../src/sim/core/records';
import { SimEngine } from '../../src/sim/engine';
import { repository } from '../helpers/repository';

// The engine API (prompts/M1-foundations.md §2) in the sandbox: catheter and wire in phantom C.

const frameAt = (engine: SimEngine, axes: Partial<InputAxes> = {}): InputFrame => ({
  step: engine.currentStep,
  mode: 'cath',
  axes: { ...NEUTRAL_AXES, ...axes },
  triggers: { fluoro: 0, inject: 0 },
  buttons: [],
  source: 'replay',
});

function sandbox(): SimEngine {
  const engine = new SimEngine();
  engine.load(sandboxConfig(repository()));
  return engine;
}

function run(engine: SimEngine, steps: number, axes: (n: number) => Partial<InputAxes>): void {
  for (let n = 0; n < steps; n += 1) {
    engine.step(frameAt(engine, axes(n)));
  }
}

describe('SimEngine', () => {
  it('is deterministic: the same frames give the same hash, and one changed frame a different one', () => {
    const script = (n: number) => ({ innerPush: 0.5, innerRotate: n % 200 < 100 ? 0.4 : -0.4 });
    const a = sandbox();
    const b = sandbox();
    const c = sandbox();
    run(a, 300, script);
    run(b, 300, script);
    run(c, 300, (n) => (n === 150 ? { ...script(n), innerPush: 0.6 } : script(n)));
    expect(a.hash()).toBe(b.hash());
    expect(c.hash()).not.toBe(a.hash());
    expect(a.hash()).toMatch(/^[0-9a-f]{8}$/);
  });

  it('applies a step-stamped command at its step: reset puts the devices back', () => {
    const engine = sandbox();
    const start = { inserted: engine.device(1).inserted, rotation: engine.device(1).rotation };
    engine.command({ step: 120, cmd: 'reset', args: {} });
    run(engine, 120, () => ({ innerPush: 1, innerRotate: 1 }));
    expect(engine.device(1).inserted).toBeGreaterThan(start.inserted);
    engine.step(frameAt(engine));
    expect(engine.device(1).inserted).toBe(start.inserted);
    expect(engine.device(1).rotation).toBe(start.rotation);
  });

  it('switches tier and anatomy by command', () => {
    const engine = sandbox();
    engine.command({ step: 0, cmd: 'set-tier', args: { tier: 'standard' } });
    engine.step(frameAt(engine));
    expect(engine.stepRate).toBe(500);
    expect(engine.device(0).rod.segmentLength).toBeCloseTo(0.004, 12);
    engine.command({ step: engine.currentStep, cmd: 'set-anatomy', args: { anatomy: 'phantom-a-straight' } });
    engine.step(frameAt(engine));
    expect(engine.currentAnatomy.id).toBe('phantom-a-straight');
    expect(engine.solveFailures).toBe(0);
  });

  it('swaps the inner device: withdraws it, then feeds the new one to the catheter tip', () => {
    const engine = sandbox();
    const catheterDepth = engine.device(0).inserted;
    engine.command({ step: 0, cmd: 'swap-device', args: { device: 'rm-bentson-035-145' } });
    let swapped = false;
    for (let n = 0; n < 20_000 && !(swapped && engine.device(1).inserted >= catheterDepth); n += 1) {
      engine.step(frameAt(engine));
      swapped ||= engine.device(1).rodModelId === 'rm-bentson-035-145';
    }
    expect(engine.device(1).rodModelId).toBe('rm-bentson-035-145');
    expect(engine.device(1).inserted).toBeCloseTo(catheterDepth, 9);
    expect(engine.device(0).inserted).toBe(catheterDepth);
  });

  it('stops the catheter at the wire tip and explains why once (order-catheter-over-wire)', () => {
    const engine = sandbox();
    engine.drainEvents();
    const wire = engine.device(1).inserted;
    run(engine, 1000, () => ({ outerPush: 1 }));
    expect(engine.device(0).inserted).toBeCloseTo(wire, 12);
    const blocked = engine.drainEvents().filter((event) => event.type === 'blocked-action');
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({
      ruleId: 'order-catheter-over-wire',
      message: 'Lead with the wire before advancing the catheter.',
    });
    expect(engine.drainEvents()).toEqual([]);
  });

  it('snapshots positions in millimetres with the device and C-arm scalars', () => {
    const engine = sandbox();
    run(engine, 10, () => ({ innerPush: 0.5 }));
    const snapshot = engine.snapshot();
    const wire = engine.device(1);
    const tip = 3 * wire.rod.segmentCount;
    expect(snapshot.step).toBe(10);
    expect(snapshot.devices).toHaveLength(2);
    const device = snapshot.devices[1]!;
    expect(device.rodModel).toBe('rm-glidewire-035-angled-150');
    expect(device.positionsMm[tip + 2]).toBeCloseTo((wire.rod.x[tip + 2] ?? 0) * 1000, 3);
    expect(device.insertedMm).toBeCloseTo(wire.inserted * 1000, 9);
    expect(device.pastSheathTipMm).toBeCloseTo(wire.inserted * 1000 - 110, 9);
    expect(device.tipSegment).toBe('c-parent');
    expect(snapshot.carm?.rotation).toBe(0);
  });
});
