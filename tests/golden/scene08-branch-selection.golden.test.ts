import { describe, expect, it } from 'vitest';
import { DEG, drive, fullSpeed, highTier, MM, phantom, rodModel, sceneEngine } from './helpers';

// Golden scene 8 (prompts/M1-foundations.md §8): phantom C with rm-glidewire-035-angled-150 alone, tip 60 mm below
// the carina. At hub rotation 0, advancing 80 mm at 10 mm/s puts the tip in c-left; at hub rotation 180°, in c-right.

const CARINA = 150 * MM;
const ADVANCE = 80 * MM;
const SPEED = 10 * MM;

describe('golden scene 8 · branch selection', () => {
  it.each([
    [0, 'c-left'],
    [180, 'c-right'],
  ])('at hub rotation %i° the tip enters %s', (rotation, branch) => {
    const engine = sceneEngine(phantom('phantom-c-bifurcation'), [
      {
        spec: rodModel('rm-glidewire-035-angled-150'),
        pastSheathTip: CARINA - 60 * MM,
        rotation: rotation * DEG,
      },
    ]);
    drive(engine, Math.round((ADVANCE / SPEED) * highTier().stepRate), {
      innerPush: SPEED / fullSpeed().advance,
    });
    expect(engine.device(0).tipSegmentId).toBe(branch);
    const entered = engine.drainEvents().filter((event) => event.type === 'tip-entered-segment');
    expect(entered.at(-1)).toMatchObject({ segment: branch });
    expect(engine.solveFailures).toBe(0);
  });
});
