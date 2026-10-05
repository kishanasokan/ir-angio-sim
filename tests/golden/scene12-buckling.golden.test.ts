import { describe, expect, it } from 'vitest';
import { engineSettings } from '../../src/data/simConfig';
import { repository } from '../helpers/repository';
import { demoParam, demoSession } from './demo';
import { maxStretchError, MM, tipArc } from './helpers';
import { findSegment } from '../../src/sim/anatomy/graph';

// Golden scene 12 (prompts/M1-foundations.md §8; docs/M1-plan.md D2): sandbox-a-buckle. From the stall, the hub
// advances the demo's extra push while the tip advances less than 2 mm along the centerline, so the push is stored as
// buckling; the hub force exceeds feedback.hubForceDanger; a hub-force-danger event is emitted; inextensibility still
// holds. The prompt's push was 20 mm; the owner raised the case's extraPush to 50 mm in phase C, because the
// Glidewire's 30 mm floppy tip first folds back at about 0.4 N and the body reaches the danger force only after about
// 33 mm (docs/M1-plan.md Progress log).

const SCRIPT = 'sandbox-a-buckle';
const MAX_STEPS = 60_000;

describe('golden scene 12 · buckling', () => {
  it('stores the push as buckling, with a danger-level hub force and intact segments', () => {
    const session = demoSession(SCRIPT);
    const wire = () => session.engine.device(session.engine.deviceCount - 1);
    const vessel = () => findSegment(session.engine.currentAnatomy, 'a-main');
    const history: { inserted: number; tip: number; hub: number; stretch: number }[] = [];
    const dangers: number[] = [];
    let n = 0;
    for (; n < MAX_STEPS; n += 1) {
      session.advance(session.engine.currentStep + 1, 1);
      history.push({
        inserted: wire().inserted,
        tip: tipArc(session.engine, session.engine.deviceCount - 1, vessel()),
        hub: wire().hubForce,
        stretch: maxStretchError(session.engine, session.engine.deviceCount - 1),
      });
      const events = session.engine.drainEvents();
      for (const event of events) {
        if (event.type === 'hub-force-danger' && event.device === wire().rodModelId) {
          dangers.push(event.step);
        }
      }
      if (events.some((event) => event.type === 'autopilot-done')) {
        break;
      }
    }
    expect(n).toBeLessThan(MAX_STEPS);
    const extra = demoParam(SCRIPT, 'extraPush');
    const end = history.at(-1)!;
    // The stall: the step where the demo's extra push began.
    const stall = history.findIndex((entry) => entry.inserted >= end.inserted - extra);
    const fromStall = history.slice(stall);
    const hubAdvance = end.inserted - history[stall]!.inserted;
    const tipAdvance = end.tip - history[stall]!.tip;
    const maxHub = Math.max(...fromStall.map((entry) => entry.hub));
    const maxStretch = Math.max(...history.map((entry) => entry.stretch));
    const danger = engineSettings(repository()).feedback.hubForceDanger;
    console.info(
      `from the stall: hub ${(hubAdvance / MM).toFixed(2)} mm, tip ${(tipAdvance / MM).toFixed(2)} mm, ` +
        `largest hub force ${maxHub.toFixed(3)} N (danger ${danger} N), danger events ${dangers.length}, ` +
        `largest stretch ${(maxStretch * 100).toFixed(3)}%`,
    );
    expect(hubAdvance).toBeGreaterThanOrEqual(extra - 0.1 * MM);
    expect(tipAdvance).toBeLessThan(2 * MM);
    expect(maxStretch).toBeLessThan(0.005);
    expect(maxHub).toBeGreaterThan(danger);
    expect(dangers.length).toBeGreaterThan(0);
  });
});
