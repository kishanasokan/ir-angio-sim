/**
 * Input settings and the mapping configuration (prompts/M1-foundations.md §5). The configuration is plain numbers in
 * SI, built from tuning/input and imaging by src/data/inputConfig.ts; the settings are the learner's choices, saved
 * under irsim:settings and recorded in input logs.
 */

export interface InputConfig {
  readonly sticks: {
    /** Radial dead zone, as a fraction of full deflection. */
    readonly deadZone: number;
    /** Response curve sign(x)·|x|^n. */
    readonly responseExponent: number;
    /** Triggers count as pressed from this deflection. */
    readonly triggerThreshold: number;
  };
  readonly devices: {
    /** m/s and rad/s at full stick. */
    readonly advanceSpeedMax: number;
    readonly rotationSpeedMax: number;
    /** Device speeds are multiplied by this in fine mode. */
    readonly fineScale: number;
  };
  /** C-arm speed limits (imaging → gantry), rad/s. */
  readonly carm: { readonly rotationSpeedMax: number; readonly angulationSpeedMax: number };
  /** Table, detector and collimation speeds (tuning/input → control), m/s. */
  readonly control: {
    readonly tablePanSpeed: number;
    readonly tableHeightSpeed: number;
    readonly detectorSpeed: number;
    readonly collimationSpeed: number;
  };
  readonly mouse: {
    /** m and rad of device motion per pixel dragged, m per wheel notch. */
    readonly dragAdvancePerPixel: number;
    readonly dragRotatePerPixel: number;
    readonly wheelAdvancePerNotch: number;
    /** rad of C-arm motion and m of table motion per pixel dragged. */
    readonly dragCarmPerPixel: number;
    readonly dragTablePerPixel: number;
  };
  readonly autopilot: {
    /** A live stick deflection above this, or any button, takes over from a demo. */
    readonly takeoverThreshold: number;
    /** Demo speeds: m/s and rad/s. */
    readonly advanceSpeed: number;
    readonly rotateSpeed: number;
  };
  /** The default response, which the autopilot always uses (spec 01 §4.7). */
  readonly defaults: InputSettings;
}

export interface InputSettings {
  readonly deadZone: number;
  readonly responseExponent: number;
  /** Invert the vertical axis of the left or right stick. */
  readonly invertLeftY: boolean;
  readonly invertRightY: boolean;
  /** Swap the sticks, so the right stick drives the outer device. */
  readonly mirrorSticks: boolean;
  /** Rumble strength 0..1. */
  readonly rumbleStrength: number;
}

/** Settings as an input log stores them: numbers and flags only (spec 02 §13). */
export function settingsRecord(settings: InputSettings): Record<string, number | boolean> {
  return {
    deadZone: settings.deadZone,
    responseExponent: settings.responseExponent,
    invertLeftY: settings.invertLeftY,
    invertRightY: settings.invertRightY,
    mirrorSticks: settings.mirrorSticks,
    rumbleStrength: settings.rumbleStrength,
  };
}
