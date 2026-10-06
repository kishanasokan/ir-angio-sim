import { fieldSide, focalSpot, viewBasis, type CarmParams, type CarmState } from '../../sim/imaging/carm';

/**
 * The fluoro camera (prompts/M1-foundations.md §6, spec 01 §7): a perspective projection from the focal spot toward the
 * detector, whose field of view is the selected zoom field at the source-to-image distance, so objects nearer the
 * source magnify. The image is mirrored horizontally afterwards (in the post pass), so in AP patient left is on screen
 * right. The patient rides on the table: panning and raising the table move the patient relative to the isocenter.
 * Everything here is in render units (1 unit = 1 mm) and matches src/sim/imaging/carm.ts → projectToImage exactly.
 */

export type Vec3 = readonly [number, number, number];

export interface FluoroCameraPose {
  /** The focal spot, mm. */
  readonly position: Vec3;
  /** A point one millimetre along the beam, for lookAt. */
  readonly target: Vec3;
  /** Patient superior, made perpendicular to the beam: image up. */
  readonly up: Vec3;
  /** Vertical (and horizontal: the image is square) field of view, degrees. */
  readonly fovDeg: number;
  /** Where the patient frame sits in the scene, mm: the table pan and lift. */
  readonly patientOffset: Vec3;
  /** Distance from the focal spot to the isocenter, mm, to place the near and far planes around the patient. */
  readonly focalToIsocenter: number;
}

const MM_PER_M = 1000;
const DEG_PER_RAD = 180 / Math.PI;

/** The camera pose for a C-arm state; `isocenterMm` is the isocenter in the patient frame, mm. */
export function fluoroCameraPose(state: CarmState, params: CarmParams, isocenterMm: Vec3): FluoroCameraPose {
  const isocenter: Vec3 = [isocenterMm[0] / MM_PER_M, isocenterMm[1] / MM_PER_M, isocenterMm[2] / MM_PER_M];
  const focal = focalSpot(isocenter, state.rotation, state.angulation, params.focalSpotToIsocenter);
  const { forward, up } = viewBasis(state.rotation, state.angulation);
  const position: Vec3 = [focal[0] * MM_PER_M, focal[1] * MM_PER_M, focal[2] * MM_PER_M];
  const halfSide = 0.5 * fieldSide(state, params);
  const lift = state.tableHeight - params.defaultTableHeight;
  return {
    position,
    target: [position[0] + forward[0], position[1] + forward[1], position[2] + forward[2]],
    up,
    fovDeg: 2 * Math.atan(halfSide / state.sourceToImageDistance) * DEG_PER_RAD,
    patientOffset: [state.tableLateral * MM_PER_M, -lift * MM_PER_M, state.tableLongitudinal * MM_PER_M],
    focalToIsocenter: params.focalSpotToIsocenter * MM_PER_M,
  };
}

/** The isocenter for an anatomy: the center of its lumen's bounding box, mm (docs/M1-plan.md D18). */
export function boundingBoxCenter(points: readonly Vec3[], radii: readonly number[]): Vec3 {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  points.forEach((point, i) => {
    const r = radii[i] ?? 0;
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis] ?? 0, (point[axis] ?? 0) - r);
      max[axis] = Math.max(max[axis] ?? 0, (point[axis] ?? 0) + r);
    }
  });
  if (points.length === 0) {
    return [0, 0, 0];
  }
  return [
    0.5 * ((min[0] ?? 0) + (max[0] ?? 0)),
    0.5 * ((min[1] ?? 0) + (max[1] ?? 0)),
    0.5 * ((min[2] ?? 0) + (max[2] ?? 0)),
  ];
}
