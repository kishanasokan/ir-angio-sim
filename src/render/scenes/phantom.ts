import type { AnatomyGraphSI } from '../../data/loaders';
import { boundingBoxCenter, type Vec3 } from './carmCamera';

/**
 * A phantom as both views draw it, in render units (mm): one tube per anatomy segment, closed with a dome where the
 * segment ends at a cap or a junction (the lumen is a union of capsules, so its ends are round), the isocenter at the
 * center of the lumen's bounding box (docs/M1-plan.md D18), and the soft-tissue band around it: a cylinder along the
 * patient axis that reaches `bandMarginMm` beyond the lumen.
 */

export interface PhantomTube {
  readonly id: string;
  /** Centerline points, packed x, y, z, mm. */
  readonly points: Float32Array;
  readonly radii: Float32Array;
  readonly domeStart: boolean;
  readonly domeEnd: boolean;
}

export interface PhantomShape {
  readonly id: string;
  readonly tubes: readonly PhantomTube[];
  readonly isocenter: Vec3;
  /** Half the bounding box's diagonal, mm. */
  readonly halfDiagonal: number;
  readonly band: {
    readonly center: Vec3;
    readonly radius: number;
    readonly zMin: number;
    readonly zMax: number;
  };
  /** The sheath, from the valve to the sheath tip (the access node), mm. */
  readonly sheath: { readonly valve: Vec3; readonly tip: Vec3 };
}

const MM_PER_M = 1000;
const CLOSED_KINDS = new Set(['cap', 'junction']);

export function phantomShape(
  graph: AnatomyGraphSI,
  accessId: string,
  sheathLengthM: number,
  bandMarginMm: number,
): PhantomShape {
  const kinds = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const all: Vec3[] = [];
  const allRadii: number[] = [];
  const tubes = graph.segments.map((segment): PhantomTube => {
    const points = new Float32Array(3 * segment.centerline.length);
    const radii = new Float32Array(segment.centerline.length);
    segment.centerline.forEach((point, i) => {
      const mm: Vec3 = [point[0] * MM_PER_M, point[1] * MM_PER_M, point[2] * MM_PER_M];
      points.set(mm, 3 * i);
      radii[i] = (segment.radii[i] ?? 0) * MM_PER_M;
      all.push(mm);
      allRadii.push(radii[i] ?? 0);
    });
    return {
      id: segment.id,
      points,
      radii,
      domeStart: kinds.get(segment.from) === 'cap',
      domeEnd: CLOSED_KINDS.has(kinds.get(segment.to) ?? ''),
    };
  });

  const isocenter = boundingBoxCenter(all, allRadii);
  let halfDiagonal = 0;
  let lateral = 0;
  let zMin = Number.POSITIVE_INFINITY;
  let zMax = Number.NEGATIVE_INFINITY;
  all.forEach((point, i) => {
    const r = allRadii[i] ?? 0;
    const dx = point[0] - isocenter[0];
    const dy = point[1] - isocenter[1];
    const dz = point[2] - isocenter[2];
    halfDiagonal = Math.max(halfDiagonal, Math.sqrt(dx * dx + dy * dy + dz * dz) + r);
    lateral = Math.max(lateral, Math.sqrt(dx * dx + dy * dy) + r);
    zMin = Math.min(zMin, point[2] - r);
    zMax = Math.max(zMax, point[2] + r);
  });

  const access = graph.access.find((entry) => entry.id === accessId) ?? graph.access[0];
  const tip: Vec3 = access === undefined ? [0, 0, 0] : scale(access.position, MM_PER_M);
  const direction: Vec3 = access?.direction ?? [0, 0, 1];
  const sheathMm = sheathLengthM * MM_PER_M;
  const valve: Vec3 = [
    tip[0] - direction[0] * sheathMm,
    tip[1] - direction[1] * sheathMm,
    tip[2] - direction[2] * sheathMm,
  ];

  return {
    id: graph.id,
    tubes,
    isocenter,
    halfDiagonal,
    band: {
      center: isocenter,
      radius: lateral + bandMarginMm,
      zMin: zMin - bandMarginMm,
      zMax: zMax + bandMarginMm,
    },
    sheath: { valve, tip },
  };
}

function scale(v: Vec3, factor: number): Vec3 {
  return [v[0] * factor, v[1] * factor, v[2] * factor];
}
