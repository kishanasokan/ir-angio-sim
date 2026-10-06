import type { InputConfig, InputSettings } from '../input/mapping/settings';
import type { RumbleConfig } from '../input/rumble';
import type { Repository } from './loaders';
import { valueToSI } from './units';

/**
 * The input mapping's configuration in SI, from tuning/input and the imaging gantry limits (prompts/M1-foundations.md
 * §5), and the learner's default settings.
 */

type Quantity = { readonly value: number; readonly unit: string };

const si = (quantity: Quantity): number => valueToSI(quantity.value, quantity.unit);

/** A setting's allowed range and slider step. */
export interface SettingRangeValues {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** The dead zones, response exponents and rumble strengths a learner may choose in Settings (tuning/input → settingsLimits). */
export function settingRanges(repository: Repository): {
  readonly deadZone: SettingRangeValues;
  readonly responseExponent: SettingRangeValues;
  readonly rumbleStrength: SettingRangeValues;
} {
  const limits = repository.input.settingsLimits;
  const range = (bounds: { readonly min: number; readonly max: number; readonly unit: string }, step: Quantity) => ({
    min: valueToSI(bounds.min, bounds.unit),
    max: valueToSI(bounds.max, bounds.unit),
    step: si(step),
  });
  return {
    deadZone: range(limits.deadZone, limits.deadZoneStep),
    responseExponent: range(limits.responseExponent, limits.responseExponentStep),
    // Rumble strength scales the actuator's magnitudes, which run from 0 to 1.
    rumbleStrength: { min: 0, max: 1, step: si(limits.rumbleStrengthStep) },
  };
}

export function defaultInputSettings(repository: Repository): InputSettings {
  const { sticks, rumble } = repository.input;
  return {
    deadZone: sticks.deadZone.value,
    responseExponent: sticks.responseExponent.value,
    invertLeftY: false,
    invertRightY: false,
    mirrorSticks: false,
    rumbleStrength: rumble.strengthDefault.value,
  };
}

export function inputConfig(repository: Repository): InputConfig {
  const { sticks, devices, mouse, control, autopilot } = repository.input;
  const { gantry } = repository.imaging;
  return {
    sticks: {
      deadZone: sticks.deadZone.value,
      responseExponent: sticks.responseExponent.value,
      triggerThreshold: sticks.triggerThreshold.value,
    },
    devices: {
      advanceSpeedMax: si(devices.advanceSpeedMax),
      rotationSpeedMax: si(devices.rotationSpeedMax),
      fineScale: devices.fineScale.value,
    },
    carm: { rotationSpeedMax: si(gantry.rotationSpeedMax), angulationSpeedMax: si(gantry.angulationSpeedMax) },
    control: {
      tablePanSpeed: si(control.tablePanSpeed),
      tableHeightSpeed: si(control.tableHeightSpeed),
      detectorSpeed: si(control.detectorSpeed),
      collimationSpeed: si(control.collimationSpeed),
    },
    mouse: {
      dragAdvancePerPixel: si(mouse.dragAdvancePerPixel),
      dragRotatePerPixel: si(mouse.dragRotatePerPixel),
      wheelAdvancePerNotch: si(mouse.wheelAdvancePerNotch),
      dragCarmPerPixel: si(mouse.dragCarmPerPixel),
      dragTablePerPixel: si(mouse.dragTablePerPixel),
    },
    autopilot: {
      takeoverThreshold: autopilot.takeoverThreshold.value,
      advanceSpeed: si(autopilot.advanceSpeed),
      rotateSpeed: si(autopilot.rotateSpeed),
    },
    defaults: defaultInputSettings(repository),
  };
}

/** The rumble scheduler's configuration in seconds and newtons, from tuning/input → rumble. */
export function rumbleConfig(repository: Repository): RumbleConfig {
  const { rumble } = repository.input;
  return {
    updateRate: si(rumble.updateRate),
    contactDuration: si(rumble.contactDuration),
    contactFullScaleForce: si(rumble.contactFullScaleForce),
    contactWeakMax: rumble.contactWeakMax.value,
    events: Object.fromEntries(
      rumble.events.map((event) => [
        event.id,
        {
          pattern: event.pattern,
          strong: event.strong.value,
          weak: event.weak.value,
          duration: si(event.duration),
          gap: event.gap === undefined ? 0 : si(event.gap),
          repeats: event.repeats?.value ?? 1,
        },
      ]),
    ),
  };
}
