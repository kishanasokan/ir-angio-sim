import { describe, expect, it } from 'vitest';
import { secondsAt, stepsIn } from '../../src/sim/core/clock';
import {
  createHasher,
  fnv1aString,
  hashBytes,
  hashHex,
  hashNumber,
  hashString,
  hashTypedArray,
} from '../../src/sim/core/hash';
import { NEUTRAL_AXES, neutralFrame } from '../../src/sim/core/records';

const bytesHash = (bytes: number[]): string => {
  const hasher = createHasher();
  hashBytes(hasher, new Uint8Array(bytes));
  return hashHex(hasher);
};
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

describe('FNV-1a hash', () => {
  it('matches the published 32-bit FNV-1a vectors', () => {
    expect(bytesHash([])).toBe('811c9dc5');
    expect(bytesHash(ascii('a'))).toBe('e40c292c');
    expect(bytesHash(ascii('foobar'))).toBe('bf9cf968');
  });

  it('hashes typed arrays by their bytes, numbers as float64 and strings as UTF-16 code units', () => {
    const values = new Float64Array([1.5, -2, Math.PI]);
    const a = createHasher();
    hashTypedArray(a, values);
    const b = createHasher();
    for (const value of values) {
      hashNumber(b, value);
    }
    expect(hashHex(a)).toBe(hashHex(b));
    expect(fnv1aString('ab')).toBe(bytesHash([0x61, 0, 0x62, 0]));
    const c = createHasher();
    hashString(c, 'é');
    expect(hashHex(c)).toBe(bytesHash([0xe9, 0]));
  });

  it('changes with any bit and pads to eight hex digits', () => {
    expect(bytesHash([0])).not.toBe(bytesHash([1]));
    for (let i = 0; i < 300; i += 1) {
      expect(bytesHash([i & 0xff, i >> 8])).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});

describe('fixed-step clock', () => {
  it('converts steps to seconds and back', () => {
    expect(secondsAt(1500, 1000)).toBe(1.5);
    expect(stepsIn(1.5, 1000)).toBe(1500);
    expect(stepsIn(0.0004, 1000)).toBe(0);
    expect(stepsIn(0.0005, 1000)).toBe(1);
    expect(stepsIn(1 / 3, 500)).toBe(167);
  });
});

describe('records', () => {
  it('builds a neutral frame at a step', () => {
    const frame = neutralFrame(42);
    expect(frame.step).toBe(42);
    expect(frame.axes).toEqual(NEUTRAL_AXES);
    expect(frame.buttons).toEqual([]);
    expect(Object.values(NEUTRAL_AXES).every((value) => value === 0)).toBe(true);
  });
});
