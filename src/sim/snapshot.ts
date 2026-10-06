import type { SimEvent } from './core/events';
import type { InputMode } from './core/records';
import { DEGREES_PER_RADIAN, MILLIMETRES_PER_METRE } from './core/types';
import type { CarmState } from './imaging/carm';
import type { RodState } from './rod/state';

/**
 * Snapshots for the main thread (spec 01 §3, spec 02 §13): node positions as Float32 millimetres for rendering (the
 * render scene uses 1 unit = 1 mm), segment frames, per-device scalars and global scalars. The buffers are fresh
 * copies, so the worker can transfer them without copying again.
 */

export interface DeviceSnapshot {
  readonly rodModel: string;
  /** Node positions, packed (x, y, z), millimetres. */
  readonly positionsMm: Float32Array;
  /** Segment quaternions (x, y, z, w). */
  readonly frames: Float32Array;
  /** Length distal to the sheath valve, mm. */
  readonly insertedMm: number;
  /** Depth past the sheath tip, mm (negative while the tip is inside the sheath). */
  readonly pastSheathTipMm: number;
  readonly hubRotationDeg: number;
  readonly tipSegment: string | null;
  readonly tipSegmentName: string | null;
  readonly tipNormalForceN: number;
  readonly hubForceN: number;
  /** Time integral of tip normal force above the wall-stress threshold, N·s. */
  readonly wallStress: number;
}

export interface Snapshot {
  readonly step: number;
  readonly timeS: number;
  /** The anatomy in use, which set-anatomy commands change. */
  readonly anatomyId: string;
  readonly devices: readonly DeviceSnapshot[];
  readonly stack: { readonly activeOuter: number; readonly locked: boolean };
  readonly carm: CarmState | null;
  readonly fluoroTimeS: number;
  /** The last step that ran with fluoro on, −1 if none: a message may cover many steps, so the monitor can tell that
   * fluoro pulsed in between even when the last step ran without it. */
  readonly fluoroLastStep: number;
  /** The input the last step ran with: mode, fluoro pedal and contrast plunger (0..1), live or autopilot. */
  readonly input: { readonly mode: InputMode; readonly fluoro: number; readonly inject: number };
  readonly autopilot: string | null;
  readonly events: readonly SimEvent[];
}

export interface DeviceSnapshotInput {
  readonly rod: RodState;
  readonly inserted: number;
  readonly rotation: number;
  readonly sheathLength: number;
  readonly tipSegment: string | null;
  readonly tipSegmentName: string | null;
  readonly tipNormalForce: number;
  readonly hubForce: number;
  readonly wallStress: number;
}

export function packDevice(input: DeviceSnapshotInput): DeviceSnapshot {
  const { rod } = input;
  const positionsMm = new Float32Array(rod.x.length);
  for (let k = 0; k < rod.x.length; k += 1) {
    positionsMm[k] = (rod.x[k] ?? 0) * MILLIMETRES_PER_METRE;
  }
  return {
    rodModel: rod.rodModelId,
    positionsMm,
    frames: new Float32Array(rod.q),
    insertedMm: input.inserted * MILLIMETRES_PER_METRE,
    pastSheathTipMm: (input.inserted - input.sheathLength) * MILLIMETRES_PER_METRE,
    hubRotationDeg: input.rotation * DEGREES_PER_RADIAN,
    tipSegment: input.tipSegment,
    tipSegmentName: input.tipSegmentName,
    tipNormalForceN: input.tipNormalForce,
    hubForceN: input.hubForce,
    wallStress: input.wallStress,
  };
}
