import { describe, expect, it } from 'vitest';
import { carmParams } from '../../src/data/simConfig';
import {
  detectorDirection,
  initialCarm,
  projectToImage,
  stepCarm,
  type CarmInput,
} from '../../src/sim/imaging/carm';
import { repository } from '../helpers/repository';

// Unit test 13 (prompts/M1-foundations.md §8): C-arm kinematics.

const DEG = Math.PI / 180;
const STEP = 1e-3;
const still: CarmInput = {
  rotate: 0,
  angulate: 0,
  detector: 0,
  panLateral: 0,
  panLongitudinal: 0,
  height: 0,
  collimation: 0,
};

describe('C-arm', () => {
  const params = carmParams(repository());

  it('clamps rotation and angulation to the sourced limits', () => {
    let state = initialCarm(params);
    for (let n = 0; n < 20_000; n += 1) {
      state = stepCarm(state, params, { ...still, rotate: 1, angulate: -1 }, STEP);
    }
    expect(state.rotation).toBeCloseTo(params.rotation.max, 12);
    expect(state.angulation).toBeCloseTo(params.angulation.min, 12);
    expect(params.rotation.max / DEG).toBeCloseTo(120, 9);
    expect(params.angulation.min / DEG).toBeCloseTo(-45, 9);
  });

  it('never turns faster than 25°/s, even with inputs beyond full scale', () => {
    let state = initialCarm(params);
    for (let n = 0; n < 1000; n += 1) {
      const next = stepCarm(state, params, { ...still, rotate: 3, angulate: 3 }, STEP);
      expect(Math.abs(next.rotation - state.rotation) / STEP).toBeLessThanOrEqual(25 * DEG + 1e-9);
      expect(Math.abs(next.angulation - state.angulation) / STEP).toBeLessThanOrEqual(25 * DEG + 1e-9);
      state = next;
    }
  });

  it('points the detector along +x at LAO 90 and along (0, −cos 30°, sin 30°) at CRA 30', () => {
    const lao = detectorDirection(90 * DEG, 0);
    expect(lao[0]).toBeCloseTo(1, 12);
    expect(lao[1]).toBeCloseTo(0, 12);
    expect(lao[2]).toBeCloseTo(0, 12);
    const cranial = detectorDirection(0, 30 * DEG);
    expect(cranial[0]).toBeCloseTo(0, 12);
    expect(cranial[1]).toBeCloseTo(-Math.cos(30 * DEG), 12);
    expect(cranial[2]).toBeCloseTo(Math.sin(30 * DEG), 12);
  });

  it('shows a point at patient left (+x) on the right half of the AP image', () => {
    const state = initialCarm(params);
    const isocenter: [number, number, number] = [0, 0, 0.1];
    const left = projectToImage([0.02, 0, 0.1], isocenter, state, params);
    const right = projectToImage([-0.02, 0, 0.1], isocenter, state, params);
    expect(left.u).toBeGreaterThan(0);
    expect(right.u).toBeLessThan(0);
    const superior = projectToImage([0, 0, 0.12], isocenter, state, params);
    expect(superior.v).toBeGreaterThan(0);
  });
});
