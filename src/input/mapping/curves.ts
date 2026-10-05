/**
 * Stick response (prompts/M1-foundations.md §5): a radial dead zone, then sign(x)·|x|^n on each axis. Both are
 * monotonic and keep the sign, so a small stick motion gives a small, same-direction rate.
 */

/**
 * Radial dead zone on a stick: inside it the stick reads zero; outside it the magnitude is rescaled to run from 0 at
 * the dead zone to 1 at full deflection, keeping the direction. Writes (x, y) into out.
 */
export function radialDeadZone(
  x: number,
  y: number,
  deadZone: number,
  out: [number, number],
): [number, number] {
  const magnitude = Math.sqrt(x * x + y * y);
  if (magnitude <= deadZone || magnitude === 0) {
    out[0] = 0;
    out[1] = 0;
    return out;
  }
  const scaled = Math.min(1, (magnitude - deadZone) / (1 - deadZone));
  out[0] = (x / magnitude) * scaled;
  out[1] = (y / magnitude) * scaled;
  return out;
}

/** sign(v)·|v|^n, for v in −1..1. */
export function responseCurve(value: number, exponent: number): number {
  return Math.sign(value) * Math.pow(Math.abs(value), exponent);
}

/**
 * The stick deflection along one axis that maps to `output` (0..1) through the dead zone and curve: the inverse the
 * autopilot needs to ask for a speed.
 */
export function deflectionFor(output: number, deadZone: number, exponent: number): number {
  if (output <= 0) {
    return 0;
  }
  return deadZone + (1 - deadZone) * Math.pow(Math.min(1, output), 1 / exponent);
}
