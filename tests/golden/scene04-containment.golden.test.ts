import { describe, expect, it } from 'vitest';
import { createLumenHit, queryLumen } from '../../src/sim/anatomy/lumen';
import { buildLumen } from '../../src/sim/anatomy/lumen';
import { demoSession, runDemo } from './demo';
import { MM } from './helpers';
import { repository } from '../helpers/repository';
import { engineSettings } from '../../src/data/simConfig';

// Golden scene 4 (prompts/M1-foundations.md §8): in all three autopilot scripts, every dynamic node stays within the
// allowed distance plus 0.05 mm of some capsule axis, checked after each full step.

const MAX_STEPS = 60_000;
const SLACK = 0.05 * MM;

describe('golden scene 4 · lumen containment', () => {
  it.each(['sandbox-c-left', 'sandbox-b-bend', 'sandbox-a-buckle'])(
    'keeps every free node inside the lumen in %s',
    (script) => {
      const session = demoSession(script);
      const { physics } = engineSettings(repository());
      const hit = createLumenHit();
      let lumenFor = '';
      let lumen = buildLumen(session.engine.currentAnatomy, physics.lumenGridCell);
      let worst = Number.POSITIVE_INFINITY;
      runDemo(session, MAX_STEPS, () => {
        const anatomy = session.engine.currentAnatomy;
        if (anatomy.id !== lumenFor) {
          lumen = buildLumen(anatomy, physics.lumenGridCell);
          lumenFor = anatomy.id;
        }
        for (let d = 0; d < session.engine.deviceCount; d += 1) {
          const { rod } = session.engine.device(d);
          for (let i = 1; i <= rod.segmentCount; i += 1) {
            if (rod.kinematic[i] === 1) {
              continue;
            }
            const o = 3 * i;
            queryLumen(
              lumen,
              rod.x[o] ?? 0,
              rod.x[o + 1] ?? 0,
              rod.x[o + 2] ?? 0,
              rod.outerRadius[i - 1] ?? 0,
              physics.lumenMargin,
              hit,
            );
            worst = Math.min(worst, hit.depth);
          }
        }
      });
      console.info(
        `${script}: deepest excursion past the allowed surface ${(-worst / MM).toFixed(4)} mm (limit 0.05 mm)`,
      );
      expect(worst).toBeGreaterThanOrEqual(-SLACK);
      expect(session.engine.solveFailures).toBe(0);
    },
  );
});
