import type { AnatomyGraphSI } from '../data/loaders';
import { projectOntoCenterline } from '../sim/anatomy/graph';
import type { DeviceSnapshot } from '../sim/snapshot';

/**
 * Pure helpers that turn a snapshot into what the HUD shows (prompts/M1-foundations.md §7; docs/M1-plan.md D25).
 */

const MM_PER_M = 1000;

/** "Tip in: …": the anatomy segment's name, the sheath while the tip is inside it, or null in free space. */
export function tipLocation(device: DeviceSnapshot): string | null {
  if (device.tipSegmentName !== null) {
    return device.tipSegmentName;
  }
  return device.pastSheathTipMm <= 0 ? 'sheath' : null;
}

/**
 * Past the carina (§8): the tip's arc distance along its segment's centerline beyond the junction node the segment
 * starts at, mm; null when the tip is not in a segment that starts at a junction.
 */
export function pastJunctionMm(graph: AnatomyGraphSI, device: DeviceSnapshot): number | null {
  const segment = graph.segments.find((entry) => entry.id === device.tipSegment);
  if (segment === undefined) {
    return null;
  }
  const from = graph.nodes.find((node) => node.id === segment.from);
  if (from?.kind !== 'junction') {
    return null;
  }
  const n = device.positionsMm.length;
  const x = (device.positionsMm[n - 3] ?? 0) / MM_PER_M;
  const y = (device.positionsMm[n - 2] ?? 0) / MM_PER_M;
  const z = (device.positionsMm[n - 1] ?? 0) / MM_PER_M;
  return projectOntoCenterline(segment, x, y, z).arc * MM_PER_M;
}

/** The contrast puff stand-in: follows RT while held, then fades out over `fade` seconds from where it was. */
export interface PuffState {
  readonly level: number;
  /** The level when RT was released. */
  readonly released: number;
  readonly releasedAt: number | null;
}

export const NO_PUFF: PuffState = { level: 0, released: 0, releasedAt: null };

export function stepPuff(state: PuffState, inject: number, now: number, fade: number): PuffState {
  if (inject > 0) {
    return { level: inject, released: inject, releasedAt: null };
  }
  if (state.level <= 0) {
    return NO_PUFF;
  }
  const releasedAt = state.releasedAt ?? now;
  const left = fade > 0 ? Math.max(0, 1 - (now - releasedAt) / fade) : 0;
  const level = state.released * left;
  return level > 0 ? { level, released: state.released, releasedAt } : NO_PUFF;
}

/** Frames per second and mean frame time over the last `window` frames. */
export class FrameStats {
  private readonly times: number[] = [];

  constructor(private readonly window: number) {}

  add(now: number): void {
    this.times.push(now);
    if (this.times.length > this.window + 1) {
      this.times.shift();
    }
  }

  /** Mean frame time, ms. */
  get frameMs(): number {
    const first = this.times[0];
    const last = this.times.at(-1);
    if (first === undefined || last === undefined || this.times.length < 2) {
      return 0;
    }
    return (last - first) / (this.times.length - 1);
  }

  get fps(): number {
    const ms = this.frameMs;
    return ms > 0 ? 1000 / ms : 0;
  }
}

/** A running mean over the last `window` samples, for the perf overlay's physics time. */
export class RunningMean {
  private readonly values: number[] = [];

  constructor(private readonly window: number) {}

  add(value: number): void {
    this.values.push(value);
    if (this.values.length > this.window) {
      this.values.shift();
    }
  }

  get mean(): number {
    return this.values.length === 0
      ? 0
      : this.values.reduce((sum, value) => sum + value, 0) / this.values.length;
  }
}
