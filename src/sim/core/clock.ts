/**
 * The fixed step counter is the simulation's only clock (CLAUDE.md rule 4): time is step / stepRate, and wall time
 * never enters the simulation.
 */

export function secondsAt(step: number, stepRate: number): number {
  return step / stepRate;
}

/** The whole number of steps that covers `seconds`, rounded to the nearest step. */
export function stepsIn(seconds: number, stepRate: number): number {
  return Math.floor(seconds * stepRate + 0.5);
}
