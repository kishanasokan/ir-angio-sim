/**
 * The units /data may use (spec 02 §5) and their conversion to SI. Conversion happens once at load and once at
 * display (CLAUDE.md rule 5); these factors are the only numbers code holds besides mathematical constants.
 */

const DEGREE = Math.PI / 180;

interface UnitInfo {
  /** Multiply a value in this unit by `toSI` to get SI; null marks a clinical-only unit that is never converted. */
  readonly toSI: number | null;
  /** The SI unit shown next to the converted value. */
  readonly si: string;
}

const UNITS = {
  // length
  m: { toSI: 1, si: 'm' },
  cm: { toSI: 1e-2, si: 'm' },
  mm: { toSI: 1e-3, si: 'm' },
  um: { toSI: 1e-6, si: 'm' },
  in: { toSI: 0.0254, si: 'm' },
  // French size is circumference-based: 1 Fr = 1/3 mm of diameter.
  Fr: { toSI: 1e-3 / 3, si: 'm' },
  // Needle gauge is ordinal; geometry uses the needle's outerDiameter.
  G: { toSI: null, si: 'G' },
  // angle
  deg: { toSI: DEGREE, si: 'rad' },
  rad: { toSI: 1, si: 'rad' },
  // time
  s: { toSI: 1, si: 's' },
  ms: { toSI: 1e-3, si: 's' },
  min: { toSI: 60, si: 's' },
  h: { toSI: 3600, si: 's' },
  day: { toSI: 86400, si: 's' },
  week: { toSI: 604800, si: 's' },
  // rate
  Hz: { toSI: 1, si: '1/s' },
  '1/s': { toSI: 1, si: '1/s' },
  // speed and acceleration
  'mm/s': { toSI: 1e-3, si: 'm/s' },
  'deg/s': { toSI: DEGREE, si: 'rad/s' },
  'm/s2': { toSI: 1, si: 'm/s2' },
  // volume
  mL: { toSI: 1e-6, si: 'm3' },
  L: { toSI: 1e-3, si: 'm3' },
  uL: { toSI: 1e-9, si: 'm3' },
  // flow
  'mL/s': { toSI: 1e-6, si: 'm3/s' },
  'mL/min': { toSI: 1e-6 / 60, si: 'm3/s' },
  'L/min': { toSI: 1e-3 / 60, si: 'm3/s' },
  // pressure and modulus
  psi: { toSI: 6894.757293168, si: 'Pa' },
  atm: { toSI: 101325, si: 'Pa' },
  mmHg: { toSI: 133.322387415, si: 'Pa' },
  Pa: { toSI: 1, si: 'Pa' },
  kPa: { toSI: 1e3, si: 'Pa' },
  MPa: { toSI: 1e6, si: 'Pa' },
  GPa: { toSI: 1e9, si: 'Pa' },
  // force; tip load is in gram-force, not grams
  N: { toSI: 1, si: 'N' },
  gf: { toSI: 9.80665e-3, si: 'N' },
  // mass
  g: { toSI: 1e-3, si: 'kg' },
  mg: { toSI: 1e-6, si: 'kg' },
  ug: { toSI: 1e-9, si: 'kg' },
  kg: { toSI: 1, si: 'kg' },
  // density, kinematic viscosity, energy
  'kg/m3': { toSI: 1, si: 'kg/m3' },
  cSt: { toSI: 1e-6, si: 'm2/s' },
  J: { toSI: 1, si: 'J' },
  // dose, kerma-area product, activity
  mGy: { toSI: 1e-3, si: 'Gy' },
  Gy: { toSI: 1, si: 'Gy' },
  'Gy*cm2': { toSI: 1e-4, si: 'Gy*m2' },
  Bq: { toSI: 1, si: 'Bq' },
  GBq: { toSI: 1e9, si: 'Bq' },
  // ratios, counts and screen pixels
  '%': { toSI: 1e-2, si: '1' },
  '1': { toSI: 1, si: '1' },
  count: { toSI: 1, si: '1' },
  px: { toSI: 1, si: '1' },
  // clinical concentrations, doses and indices: kept in clinical units, compared only in their own unit
  'mg/mL': { toSI: null, si: 'mg/mL' },
  'mgI/mL': { toSI: null, si: 'mgI/mL' },
  'mg/vial': { toSI: null, si: 'mg/vial' },
  'mOsm/kg': { toSI: null, si: 'mOsm/kg' },
  'mg/dL': { toSI: null, si: 'mg/dL' },
  IU: { toSI: null, si: 'IU' },
  'IU/kg': { toSI: null, si: 'IU/kg' },
  'IU/h': { toSI: null, si: 'IU/h' },
  'mg/kg': { toSI: null, si: 'mg/kg' },
  'mL/kg/h': { toSI: null, si: 'mL/kg/h' },
  'mL/min/1.73m2': { toSI: null, si: 'mL/min/1.73m2' },
  'g/(mL/min)': { toSI: null, si: 'g/(mL/min)' },
} as const satisfies Record<string, UnitInfo>;

export type Unit = keyof typeof UNITS;

export class UnitError extends Error {
  override name = 'UnitError';
}

/** Every unit /data may use, in the order of spec 02 §5. */
export const UNIT_TABLE: readonly ({ readonly unit: Unit } & UnitInfo)[] = (
  Object.keys(UNITS) as Unit[]
).map((unit) => ({ unit, ...UNITS[unit] }));

export function isKnownUnit(unit: unknown): unit is Unit {
  return typeof unit === 'string' && Object.hasOwn(UNITS, unit);
}

/** True when values in this unit convert to SI (false for clinical-only and unknown units). */
export function isConvertibleUnit(unit: unknown): unit is Unit {
  return isKnownUnit(unit) && UNITS[unit].toSI !== null;
}

function factorFor(unit: string): number {
  if (!isKnownUnit(unit)) {
    throw new UnitError(`Unknown unit "${unit}"; spec 02 §5 lists the units /data may use.`);
  }
  const factor = UNITS[unit].toSI;
  if (factor === null) {
    throw new UnitError(`"${unit}" is a clinical-only unit and is never converted to SI (spec 02 §5).`);
  }
  return factor;
}

/** The SI unit a value in `unit` converts to, for display next to the SI value. */
export function siUnitOf(unit: string): string {
  if (!isKnownUnit(unit)) {
    throw new UnitError(`Unknown unit "${unit}"; spec 02 §5 lists the units /data may use.`);
  }
  return UNITS[unit].si;
}

export function valueToSI(value: number, unit: string): number {
  return value * factorFor(unit);
}

export function toSI(quantity: { readonly value: number; readonly unit: string }): number {
  return valueToSI(quantity.value, quantity.unit);
}

export function fromSI(value: number, unit: string): number {
  return value / factorFor(unit);
}
