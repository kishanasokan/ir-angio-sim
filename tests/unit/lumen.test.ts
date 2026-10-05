import { describe, expect, it } from 'vitest';
import { loadAnatomyGraph } from '../../src/data/loaders';
import { buildLumen, createLumenHit, insideSegment, queryLumen } from '../../src/sim/anatomy/lumen';
import { repository } from '../helpers/repository';

// Unit test 14 (prompts/M1-foundations.md §8): lumen queries on phantom C for a 0.035 in device with the 0.02 mm
// margin, so the allowed distance is 3.5355 mm in the parent and 2.0355 mm in the daughters.

const MM = 1e-3;
const RADIUS = (0.035 * 25.4 * MM) / 2;
const MARGIN = 0.02 * MM;

describe('lumen queries', () => {
  const anatomy = loadAnatomyGraph(repository(), 'phantom-c-bifurcation');
  const lumen = buildLumen(anatomy, 10 * MM);
  const index = (id: string) => anatomy.segments.findIndex((segment) => segment.id === id);
  const inside = (point: readonly number[]) =>
    ['c-parent', 'c-left', 'c-right'].filter((id) =>
      insideSegment(
        lumen,
        index(id),
        (point[0] ?? 0) * MM,
        (point[1] ?? 0) * MM,
        (point[2] ?? 0) * MM,
        RADIUS,
        MARGIN,
      ),
    );

  it('has the allowed distances of the prompt', () => {
    const hit = createLumenHit();
    queryLumen(lumen, 0, 0, 100 * MM, RADIUS, MARGIN, hit);
    expect(hit.allowed / MM).toBeCloseTo(3.5355, 4);
    queryLumen(lumen, 20 * MM, 0, 184.641 * MM, RADIUS, MARGIN, hit);
    expect(hit.allowed / MM).toBeCloseTo(2.0355, 4);
  });

  it('finds (3, 0, 150) inside the parent only', () => {
    expect(inside([3, 0, 150])).toEqual(['c-parent']);
  });

  it('finds (3, 0, 152) inside the left daughter only', () => {
    expect(inside([3, 0, 152])).toEqual(['c-left']);
  });

  it('finds (0, 0, 154) inside both daughters', () => {
    expect(inside([0, 0, 154])).toEqual(['c-left', 'c-right']);
  });

  it('finds (5, 0, 150) and (0, 0, 160) outside every capsule', () => {
    const hit = createLumenHit();
    for (const point of [
      [5, 0, 150],
      [0, 0, 160],
    ]) {
      expect(inside(point)).toEqual([]);
      queryLumen(
        lumen,
        (point[0] ?? 0) * MM,
        (point[1] ?? 0) * MM,
        (point[2] ?? 0) * MM,
        RADIUS,
        MARGIN,
        hit,
      );
      expect(hit.depth).toBeLessThan(0);
    }
  });
});
