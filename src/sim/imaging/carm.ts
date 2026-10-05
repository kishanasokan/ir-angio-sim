import { cos, sin } from '../math/detTrig';

/**
 * C-arm and table kinematics (prompts/M1-foundations.md §6; docs/M1-plan.md D18), pure and in SI. In the patient frame
 * (LPS: x left, y posterior, z superior), rotation θ (positive = LAO) and angulation ψ (positive = cranial) give the
 * detector direction from the isocenter (sin θ·cos ψ, −cos θ·cos ψ, sin ψ); the focal spot sits opposite it at the
 * focal-spot-to-isocenter distance. The image is a perspective projection from the focal spot toward the detector,
 * mirrored horizontally so it reads as if viewed from the detector side: in AP, patient left is on screen right.
 */

export interface Range {
  readonly min: number;
  readonly max: number;
}

export interface CarmParams {
  /** Radians; positive rotation is LAO, positive angulation cranial. */
  readonly rotation: Range;
  readonly angulation: Range;
  /** rad/s. */
  readonly rotationSpeedMax: number;
  readonly angulationSpeedMax: number;
  /** Source-to-image distance, m. */
  readonly sourceToImageDistance: Range;
  readonly focalSpotToIsocenter: number;
  /** Zoom fields as image diagonals at the detector, m, in the order data lists them. */
  readonly zoomFields: readonly number[];
  readonly tableHeight: Range;
  /** Total table travel, m; the table moves ± half of it around its starting position. */
  readonly tableTravelLateral: number;
  readonly tableTravelLongitudinal: number;
  /** m/s. */
  readonly detectorSpeed: number;
  readonly tablePanSpeed: number;
  readonly tableHeightSpeed: number;
  readonly collimationSpeed: number;
  /** Collimation as a fraction of the field. */
  readonly collimation: Range;
  readonly savedViews: number;
  /** Starting pose (design values). */
  readonly defaultSourceToImageDistance: number;
  readonly defaultZoomIndex: number;
  readonly defaultTableHeight: number;
}

export interface SavedView {
  readonly rotation: number;
  readonly angulation: number;
}

export interface CarmState {
  readonly rotation: number;
  readonly angulation: number;
  readonly sourceToImageDistance: number;
  readonly zoomIndex: number;
  /** Table pan from its starting position, m: lateral (x) and longitudinal (z). */
  readonly tableLateral: number;
  readonly tableLongitudinal: number;
  readonly tableHeight: number;
  readonly collimation: number;
  readonly savedViews: readonly SavedView[];
}

/** Rates in −1..1 from the Control-mode axes. */
export interface CarmInput {
  readonly rotate: number;
  readonly angulate: number;
  readonly detector: number;
  readonly panLateral: number;
  readonly panLongitudinal: number;
  readonly height: number;
  readonly collimation: number;
}

function clamp(value: number, range: Range): number {
  return Math.min(range.max, Math.max(range.min, value));
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

export function initialCarm(params: CarmParams): CarmState {
  return {
    rotation: clamp(0, params.rotation),
    angulation: clamp(0, params.angulation),
    sourceToImageDistance: clamp(params.defaultSourceToImageDistance, params.sourceToImageDistance),
    zoomIndex: Math.min(params.zoomFields.length - 1, Math.max(0, params.defaultZoomIndex)),
    tableLateral: 0,
    tableLongitudinal: 0,
    tableHeight: clamp(params.defaultTableHeight, params.tableHeight),
    collimation: params.collimation.max,
    savedViews: [],
  };
}

/** The image side length at the detector for the current zoom field (a square image of that diagonal), m. */
export function fieldSide(state: CarmState, params: CarmParams): number {
  return (params.zoomFields[state.zoomIndex] ?? params.zoomFields[0] ?? 0) / Math.SQRT2;
}

/** Advances the C-arm and table by one time step; inputs are clamped to −1..1 so speeds never exceed their limits. */
export function stepCarm(state: CarmState, params: CarmParams, input: CarmInput, dt: number): CarmState {
  const halfLateral = 0.5 * params.tableTravelLateral;
  const halfLongitudinal = 0.5 * params.tableTravelLongitudinal;
  const side = fieldSide(state, params);
  return {
    ...state,
    rotation: clamp(state.rotation + clampUnit(input.rotate) * params.rotationSpeedMax * dt, params.rotation),
    angulation: clamp(
      state.angulation + clampUnit(input.angulate) * params.angulationSpeedMax * dt,
      params.angulation,
    ),
    sourceToImageDistance: clamp(
      state.sourceToImageDistance + clampUnit(input.detector) * params.detectorSpeed * dt,
      params.sourceToImageDistance,
    ),
    tableLateral: clamp(state.tableLateral + clampUnit(input.panLateral) * params.tablePanSpeed * dt, {
      min: -halfLateral,
      max: halfLateral,
    }),
    tableLongitudinal: clamp(
      state.tableLongitudinal + clampUnit(input.panLongitudinal) * params.tablePanSpeed * dt,
      {
        min: -halfLongitudinal,
        max: halfLongitudinal,
      },
    ),
    tableHeight: clamp(
      state.tableHeight + clampUnit(input.height) * params.tableHeightSpeed * dt,
      params.tableHeight,
    ),
    // The collimator blades move at collimationSpeed at the detector, so the fraction changes by speed / side.
    collimation: clamp(
      state.collimation +
        (side > 0 ? (clampUnit(input.collimation) * params.collimationSpeed * dt) / side : 0),
      params.collimation,
    ),
  };
}

/** Changes the zoom field by delta steps (positive = narrower), clamped to the list. */
export function changeZoom(state: CarmState, params: CarmParams, delta: number): CarmState {
  const zoomIndex = Math.min(params.zoomFields.length - 1, Math.max(0, state.zoomIndex + delta));
  return zoomIndex === state.zoomIndex ? state : { ...state, zoomIndex };
}

/** Cycles to the next zoom field, wrapping around. */
export function cycleZoom(state: CarmState, params: CarmParams): CarmState {
  const count = params.zoomFields.length;
  return count === 0 ? state : { ...state, zoomIndex: (state.zoomIndex + 1) % count };
}

/** Saves the current angles, keeping at most `savedViews` (oldest dropped first). */
export function saveView(state: CarmState, params: CarmParams): CarmState {
  const views = [...state.savedViews, { rotation: state.rotation, angulation: state.angulation }];
  return { ...state, savedViews: views.slice(Math.max(0, views.length - params.savedViews)) };
}

/** Unit vector from the isocenter toward the detector. */
export function detectorDirection(rotation: number, angulation: number): [number, number, number] {
  const cosAngulation = cos(angulation);
  return [sin(rotation) * cosAngulation, -cos(rotation) * cosAngulation, sin(angulation)];
}

/** The focal spot: isocenter − direction × focal-spot-to-isocenter distance. */
export function focalSpot(
  isocenter: readonly [number, number, number],
  rotation: number,
  angulation: number,
  focalSpotToIsocenter: number,
): [number, number, number] {
  const d = detectorDirection(rotation, angulation);
  return [
    isocenter[0] - d[0] * focalSpotToIsocenter,
    isocenter[1] - d[1] * focalSpotToIsocenter,
    isocenter[2] - d[2] * focalSpotToIsocenter,
  ];
}

export interface ViewBasis {
  /** From the focal spot toward the detector. */
  readonly forward: [number, number, number];
  /** Patient superior projected perpendicular to forward: up in the image. */
  readonly up: [number, number, number];
  /** forward × up: the camera's right before the display mirror. */
  readonly right: [number, number, number];
}

export function viewBasis(rotation: number, angulation: number): ViewBasis {
  const forward = detectorDirection(rotation, angulation);
  // Superior (+z) with its component along forward removed; angulation stays within ±45°, so this never vanishes.
  const along = forward[2];
  const ux = -along * forward[0];
  const uy = -along * forward[1];
  const uz = 1 - along * forward[2];
  const norm = Math.sqrt(ux * ux + uy * uy + uz * uz);
  const up: [number, number, number] = [ux / norm, uy / norm, uz / norm];
  const right: [number, number, number] = [
    forward[1] * up[2] - forward[2] * up[1],
    forward[2] * up[0] - forward[0] * up[2],
    forward[0] * up[1] - forward[1] * up[0],
  ];
  return { forward, up, right };
}

/**
 * Projects a patient-frame point into normalized image coordinates after the display mirror: u = −1 at the left edge
 * of the field and +1 at the right, v = +1 at the top. The table pan shifts the patient relative to the isocenter.
 */
export function projectToImage(
  point: readonly [number, number, number],
  isocenter: readonly [number, number, number],
  state: CarmState,
  params: CarmParams,
): { readonly u: number; readonly v: number } {
  const { forward, up, right } = viewBasis(state.rotation, state.angulation);
  const focal = focalSpot(isocenter, state.rotation, state.angulation, params.focalSpotToIsocenter);
  // The patient rides on the table: panning shifts it laterally and longitudinally, and raising the table lifts a
  // supine patient toward anterior (−y).
  const lift = state.tableHeight - params.defaultTableHeight;
  const px = point[0] + state.tableLateral - focal[0];
  const py = point[1] - lift - focal[1];
  const pz = point[2] + state.tableLongitudinal - focal[2];
  const depth = px * forward[0] + py * forward[1] + pz * forward[2];
  const scale = state.sourceToImageDistance / depth;
  const halfSide = 0.5 * fieldSide(state, params);
  const cameraRight = (px * right[0] + py * right[1] + pz * right[2]) * scale;
  const cameraUp = (px * up[0] + py * up[1] + pz * up[2]) * scale;
  // Mirror horizontally: the image reads as if viewed from the detector side.
  return { u: -cameraRight / halfSide, v: cameraUp / halfSide };
}
