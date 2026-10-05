import { describe, expect, it } from 'vitest';
import { buildRodInstance } from '../../src/data/catalog';
import { distributeRestShape, jointDistanceFromTip } from '../../src/data/restShape';
import { valueToSI } from '../../src/data/units';
import { repository, tierSegmentLength } from '../helpers/repository';

// Unit test 9 (prompts/M1-foundations.md §8): per-joint angles of a region sum exactly to bendAngle for 2 mm and
// 4 mm segments, including the Glidewire's 3 mm region, which is shorter than one standard segment.

const SUM_TOLERANCE = 1e-12;
const degrees = (value: number): number => valueToSI(value, 'deg');
const millimetres = (value: number): number => valueToSI(value, 'mm');

describe('unit test 9 · rest shapes', () => {
  const segmentLengths = [tierSegmentLength('high'), tierSegmentLength('standard')];

  it.each(segmentLengths)(
    'sums every rest-shape region in the data to its bend angle at %f m',
    (segmentLength) => {
      for (const rodModelId of repository().rodModels.keys()) {
        const instance = buildRodInstance(repository(), rodModelId, segmentLength);
        instance.restShape.regions.forEach((region, i) => {
          const shares = instance.restShape.distribution.shares.filter((share) => share.region === i);
          expect(shares.length, rodModelId).toBeGreaterThan(0);
          const sum = shares.reduce((total, share) => total + share.angle, 0);
          expect(Math.abs(sum - region.bendAngle.value) / region.bendAngle.value, rodModelId).toBeLessThan(
            SUM_TOLERANCE,
          );
        });
      }
    },
  );

  it("gives the Glidewire's 3 mm, 45° region to one joint at 2 mm, and to the nearest joint at 4 mm", () => {
    const [high, standard] = segmentLengths as [number, number];
    for (const [segmentLength, jointAt] of [
      [high, 2],
      [standard, 4],
    ] as const) {
      const instance = buildRodInstance(repository(), 'rm-glidewire-035-angled-150', segmentLength);
      const { shares, towardD1 } = instance.restShape.distribution;
      expect(shares).toHaveLength(1);
      expect(shares[0]?.distanceFromTip).toBeCloseTo(millimetres(jointAt), 15);
      expect(shares[0]?.angle).toBeCloseTo(degrees(45), 15);
      // In both tiers that joint is the tip-most one, one segment from the tip: the last array entry.
      expect(towardD1[towardD1.length - 1]).toBeCloseTo(degrees(45), 15);
    }
  });

  it("shares the Berenstein's 45° over the distal 12 mm: 6 joints at 2 mm, 3 at 4 mm", () => {
    const [high, standard] = segmentLengths as [number, number];
    for (const [segmentLength, joints] of [
      [high, 6],
      [standard, 3],
    ] as const) {
      const { shares } = buildRodInstance(repository(), 'rm-berenstein-5f-65', segmentLength).restShape
        .distribution;
      expect(shares).toHaveLength(joints);
      for (const share of shares) {
        expect(share.angle).toBeCloseTo(degrees(45) / joints, 15);
        expect(share.toward).toBe('d1');
      }
    }
  });

  it("spreads catheter K's 60° over its distal 15 mm (golden scene fixture)", () => {
    const region = { fromTip: 0, toTip: millimetres(15), bendAngle: degrees(60), toward: 'd1' as const };
    const atHigh = distributeRestShape([region], 200, millimetres(2));
    expect(atHigh.shares.map((share) => Math.round(share.distanceFromTip * 1e3))).toEqual([
      14, 12, 10, 8, 6, 4, 2,
    ]);
    const atStandard = distributeRestShape([region], 100, millimetres(4));
    expect(atStandard.shares.map((share) => Math.round(share.distanceFromTip * 1e3))).toEqual([12, 8, 4]);
    const sum = atStandard.towardD1.reduce((total, angle) => total + angle, 0);
    expect(Math.abs(sum - degrees(60)) / degrees(60)).toBeLessThan(SUM_TOLERANCE);
  });

  it('bends toward d2 when a region says so, and adds overlapping regions', () => {
    const l = millimetres(2);
    const distribution = distributeRestShape(
      [
        { fromTip: 0, toTip: millimetres(4), bendAngle: degrees(20), toward: 'd2' },
        { fromTip: 0, toTip: millimetres(2), bendAngle: degrees(10), toward: 'd2' },
      ],
      10,
      l,
    );
    expect([...distribution.towardD1].every((angle) => angle === 0)).toBe(true);
    // Joint 8 is 2 mm from the tip and carries 10° from each region; joint 7 is 4 mm from the tip.
    expect(distribution.towardD2[8]).toBeCloseTo(degrees(20), 15);
    expect(distribution.towardD2[7]).toBeCloseTo(degrees(10), 15);
  });

  it('measures joints from the tip: joint j sits at node j + 1', () => {
    expect(jointDistanceFromTip(8, 10, 2)).toBe(2);
    expect(jointDistanceFromTip(0, 10, 2)).toBe(18);
  });
});
