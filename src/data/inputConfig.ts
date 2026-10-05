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
