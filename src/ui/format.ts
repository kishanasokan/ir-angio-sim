/**
 * Display formatting (spec 01 §5: SI inside, clinical units at display). Angles read LAO/RAO and cranial/caudal, as on
 * the monitor (spec 01 §7).
 */

const DEG_PER_RAD = 180 / Math.PI;

export function degrees(radians: number): number {
  return radians * DEG_PER_RAD;
}

/** "LAO 25 CRA 10" from degrees, positive LAO and cranial. */
export function formatAngles(rotationDeg: number, angulationDeg: number): string {
  const rotation = Math.round(rotationDeg);
  const angulation = Math.round(angulationDeg);
  const side = rotation < 0 ? 'RAO' : 'LAO';
  const tilt = angulation < 0 ? 'CAU' : 'CRA';
  return `${side} ${Math.abs(rotation)} ${tilt} ${Math.abs(angulation)}`;
}

/** Minutes and seconds with tenths: 0:07.4, 2:13.0. */
export function formatDuration(seconds: number): string {
  const tenths = Math.max(0, Math.round(seconds * 10));
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths - minutes * 600) / 10;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

/** A number with up to `digits` significant digits, in exponent form when very large or small. */
export function formatNumber(value: number, digits = 4): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (value === 0) {
    return '0';
  }
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-3) {
    const [mantissa, exponent] = value.toExponential(digits - 1).split('e');
    return `${String(Number(mantissa))}e${String(Number(exponent))}`;
  }
  return String(Number(value.toPrecision(digits)));
}

const UNIT_NAMES: Readonly<Record<string, string>> = {
  'N*m2': 'N·m²',
  m2: 'm²',
  m3: 'm³',
  'kg/m3': 'kg/m³',
  'm/s2': 'm/s²',
  'Gy*m2': 'Gy·m²',
  'Gy*cm2': 'Gy·cm²',
  '1': '',
  um: 'µm',
  uL: 'µL',
  ug: 'µg',
  deg: '°',
  'deg/s': '°/s',
};

export function formatUnit(unit: string): string {
  return UNIT_NAMES[unit] ?? unit;
}

export function formatQuantity(value: number, unit: string, digits = 4): string {
  const name = formatUnit(unit);
  if (name === '') {
    return formatNumber(value, digits);
  }
  return name.startsWith('°')
    ? `${formatNumber(value, digits)}${name}`
    : `${formatNumber(value, digits)} ${name}`;
}

/** Signed millimetres with one decimal, for depths. */
export function formatMm(value: number): string {
  return `${value.toFixed(1)} mm`;
}
