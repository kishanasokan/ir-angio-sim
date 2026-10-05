import { describe, expect, it } from 'vitest';
import {
  UNIT_TABLE,
  UnitError,
  fromSI,
  isConvertibleUnit,
  isKnownUnit,
  siUnitOf,
  toSI,
  valueToSI,
} from '../../src/data/units';

// Unit test 1 (prompts/M1-foundations.md §8): every factor in spec 02 §5; round trips within 1e-12 relative;
// clinical-only units throw.

// The factors as spec 02 §5 prints them; Fr, mL/min and L/min appear there rounded to five significant figures.
const SPEC_FACTORS: readonly (readonly [string, number])[] = [
  ['m', 1],
  ['cm', 1e-2],
  ['mm', 1e-3],
  ['um', 1e-6],
  ['in', 0.0254],
  ['Fr', 3.3333e-4],
  ['deg', Math.PI / 180],
  ['rad', 1],
  ['s', 1],
  ['ms', 1e-3],
  ['min', 60],
  ['h', 3600],
  ['day', 86400],
  ['week', 604800],
  ['Hz', 1],
  ['1/s', 1],
  ['mm/s', 1e-3],
  ['deg/s', Math.PI / 180],
  ['m/s2', 1],
  ['mL', 1e-6],
  ['L', 1e-3],
  ['uL', 1e-9],
  ['mL/s', 1e-6],
  ['mL/min', 1.6667e-8],
  ['L/min', 1.6667e-5],
  ['psi', 6894.757293168],
  ['atm', 101325],
  ['mmHg', 133.322387415],
  ['Pa', 1],
  ['kPa', 1e3],
  ['MPa', 1e6],
  ['GPa', 1e9],
  ['N', 1],
  ['gf', 9.80665e-3],
  ['g', 1e-3],
  ['mg', 1e-6],
  ['ug', 1e-9],
  ['kg', 1],
  ['kg/m3', 1],
  ['cSt', 1e-6],
  ['J', 1],
  ['mGy', 1e-3],
  ['Gy', 1],
  ['Gy*cm2', 1e-4],
  ['Bq', 1],
  ['GBq', 1e9],
  ['%', 1e-2],
  ['1', 1],
  ['count', 1],
  ['px', 1],
];

// Needle gauge is ordinal, and clinical concentrations, doses and indices stay in their own units (spec 02 §5).
const CLINICAL_ONLY = [
  'G',
  'mg/mL',
  'mgI/mL',
  'mg/vial',
  'mOsm/kg',
  'mg/dL',
  'IU',
  'IU/kg',
  'IU/h',
  'mg/kg',
  'mL/kg/h',
  'mL/min/1.73m2',
  'g/(mL/min)',
];

describe('unit test 1 · units', () => {
  it('converts every unit in spec 02 §5 by its printed factor', () => {
    for (const [unit, factor] of SPEC_FACTORS) {
      expect(Math.abs(valueToSI(1, unit) / factor - 1), unit).toBeLessThan(5e-5);
    }
  });

  it('uses the exact factors the M1 prompt names', () => {
    expect(valueToSI(1, 'Fr')).toBe(1e-3 / 3);
    expect(valueToSI(1, 'in')).toBe(0.0254);
    expect(valueToSI(1, 'psi')).toBe(6894.757293168);
    expect(valueToSI(1, 'atm')).toBe(101325);
    expect(valueToSI(1, 'mmHg')).toBe(133.322387415);
    expect(valueToSI(1, 'gf')).toBe(9.80665e-3);
    expect(valueToSI(1, 'GPa')).toBe(1e9);
  });

  it('knows exactly the units spec 02 §5 lists', () => {
    const listed = new Set([...SPEC_FACTORS.map(([unit]) => unit), ...CLINICAL_ONLY]);
    expect(new Set(UNIT_TABLE.map((entry) => entry.unit))).toEqual(listed);
  });

  it('round-trips every convertible unit within 1e-12 relative', () => {
    const values = [1e-9, 0.035, 1, 123.456, 6.02e23, -45];
    for (const { unit } of UNIT_TABLE) {
      if (!isConvertibleUnit(unit)) {
        continue;
      }
      for (const value of values) {
        const back = fromSI(toSI({ value, unit }), unit);
        expect(Math.abs(back - value) / Math.abs(value), `${value} ${unit}`).toBeLessThanOrEqual(1e-12);
      }
    }
  });

  it('throws when a clinical-only unit is converted in either direction', () => {
    for (const unit of CLINICAL_ONLY) {
      expect(isKnownUnit(unit), unit).toBe(true);
      expect(isConvertibleUnit(unit), unit).toBe(false);
      expect(() => valueToSI(1, unit), unit).toThrow(UnitError);
      expect(() => fromSI(1, unit), unit).toThrow(UnitError);
    }
  });

  it('rejects units spec 02 does not list', () => {
    expect(isKnownUnit('furlong')).toBe(false);
    expect(() => valueToSI(1, 'furlong')).toThrow(UnitError);
    expect(() => siUnitOf('furlong')).toThrow(UnitError);
  });

  it('names the SI unit each value converts to', () => {
    expect(siUnitOf('GPa')).toBe('Pa');
    expect(siUnitOf('Fr')).toBe('m');
    expect(siUnitOf('deg/s')).toBe('rad/s');
    expect(siUnitOf('mL/min')).toBe('m3/s');
  });
});
