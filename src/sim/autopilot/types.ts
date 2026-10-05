import type { SimAnatomy } from '../anatomy/graph';

/**
 * Autopilot scripts (prompts/M1-foundations.md §5; docs/M1-plan.md D6, D7). A script is a pure function of the step,
 * a read-only view of the simulation and its parameters, plus a small memo of plain numbers that it updates. It
 * returns a virtual pad, which the session runner maps through mapPad with the default settings, so a demo uses
 * exactly the learner's input path. Scripts react to the state (closed loop), never to wall time.
 */

export type Vec3 = readonly [number, number, number];

export interface AutopilotDeviceView {
  readonly rodModelId: string;
  /** Insertion depth L (m) and hub rotation φ (rad). */
  readonly inserted: number;
  readonly rotation: number;
  readonly tip: Vec3;
  readonly tipVelocity: Vec3;
  /** d3 of the tip segment. */
  readonly tipTangent: Vec3;
  /** The direction a pre-shaped tip bends toward, in the frame of the segment just proximal to the curve; null when
   * the device is straight. */
  readonly bendDirection: Vec3 | null;
  /** Tangent of the segment just proximal to the curve (the tip segment for a straight device). */
  readonly bodyTangent: Vec3;
  /** The anatomy segment holding the tip, or null inside the sheath. */
  readonly tipSegmentId: string | null;
  readonly hubForce: number;
}

export interface AutopilotView {
  readonly step: number;
  readonly stepRate: number;
  readonly sheathLength: number;
  readonly anatomy: SimAnatomy;
  /** Outermost first, as in the stack. */
  readonly devices: readonly AutopilotDeviceView[];
}

/**
 * A virtual pad in output units: the device rates a script wants after the response curve (−1..1, as in Cath mode),
 * and the standard-mapping buttons it holds this step. The session runner turns it into raw stick deflections.
 */
export interface VirtualPad {
  readonly outerPush: number;
  readonly outerRotate: number;
  readonly innerPush: number;
  readonly innerRotate: number;
  readonly buttons: readonly number[];
}

/**
 * Script parameters, SI: the case's `autopilot[].params`, plus the demo and full speeds from tuning/input
 * (advanceSpeed, rotateSpeed, fullAdvanceSpeed, fullRotateSpeed), so scripts can ask for a speed as a fraction.
 */
export type AutopilotParams = Readonly<Record<string, number>>;

export interface AutopilotOutput {
  readonly pad: VirtualPad;
  /** True when the script has finished; the session emits autopilot-done and stops it. */
  readonly done: boolean;
}

export type AutopilotScript = (
  step: number,
  view: AutopilotView,
  params: AutopilotParams,
  memo: Float64Array,
) => AutopilotOutput;

export const IDLE_PAD: VirtualPad = {
  outerPush: 0,
  outerRotate: 0,
  innerPush: 0,
  innerRotate: 0,
  buttons: [],
};

/** Reads a parameter, failing loudly when the case lacks it. */
export function param(params: AutopilotParams, name: string): number {
  const value = params[name];
  if (value === undefined) {
    throw new Error(`Autopilot parameter "${name}" is missing.`);
  }
  return value;
}

/** Phase ids for a script's memo: each name maps to its index. */
export function phaseIds<T extends string>(names: readonly T[]): Readonly<Record<T, number>> {
  return Object.fromEntries(names.map((name, index) => [name, index])) as Record<T, number>;
}
