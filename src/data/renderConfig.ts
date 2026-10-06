import { buildRodInstance, type RodDeviceInstance } from './catalog';
import { tierParams } from './simConfig';
import type { Repository } from './loaders';
import { fromSI, valueToSI } from './units';

/**
 * Display settings for the views and the HUD, from tuning/render, tuning/physics feedback and imaging rates
 * (prompts/M1-foundations.md §6, §7; docs/M1-plan.md D5). Values are converted once, here: lengths to millimetres for
 * the render scene (1 unit = 1 mm, spec 01 §5), times to seconds, forces to newtons.
 */

type Quantity = { readonly value: number; readonly unit: string };

const si = (quantity: Quantity): number => valueToSI(quantity.value, quantity.unit);
const mm = (quantity: Quantity): number => fromSI(si(quantity), 'mm');

export interface FluoroConfig {
  /** Hz. */
  readonly defaultPulseRate: number;
  /** The sourced pulse-rate options, Hz. */
  readonly pulseRates: readonly number[];
  readonly noiseSigma: number;
  readonly blurRadiusPx: number;
  readonly vignetteStrength: number;
  readonly lastImageHold: boolean;
  readonly background: number;
  readonly contrastPuffMaxOpacity: number;
  /** s. */
  readonly contrastPuffFade: number;
  readonly roadmapOutlineOpacity: number;
  readonly roadmapOutlineGray: number;
  readonly roadmapOutlineWidthPx: number;
  readonly wireOpacity: number;
  readonly catheterOpacity: number;
  readonly softTissueBandOpacity: number;
  readonly softTissueBandMarginMm: number;
  readonly collimatedGray: number;
}

export interface ThreeDConfig {
  readonly vesselOpacity: number;
  readonly wireColor: string;
  readonly catheterColor: string;
  readonly vesselColor: string;
  readonly sheathColor: string;
  readonly backgroundColor: string;
  /** Degrees, for the three.js camera. */
  readonly cameraFovDeg: number;
  readonly cameraDistance: number;
  readonly hemisphereLightIntensity: number;
  readonly keyLightIntensity: number;
  readonly surfaceRoughness: number;
}

export interface HudConfig {
  /** Hz. */
  readonly refreshRate: number;
  /** s. */
  readonly toastDuration: number;
  readonly blockedMessageDebounce: number;
  /** N. */
  readonly hubForceFullScale: number;
  readonly hubForceWarning: number;
  readonly hubForceDanger: number;
  readonly tipForceFullScale: number;
  /** N·s. */
  readonly wallStressFullScale: number;
}

export interface ToneConfig {
  /** Hz, s and peak gain 0..1. */
  readonly frequency: number;
  readonly duration: number;
  readonly gain: number;
}

export interface RenderConfig {
  readonly fluoro: FluoroConfig;
  readonly tubeRadialSegments: number;
  readonly threeD: ThreeDConfig;
  readonly hud: HudConfig;
  readonly audio: { readonly alarm: ToneConfig; readonly blocked: ToneConfig };
  /** Hz. */
  readonly targetFrameRate: number;
}

export function renderConfig(repository: Repository): RenderConfig {
  const { fluoro, threeD, hud, audio } = repository.render;
  const { feedback } = repository.physics;
  const rates = repository.imaging.rates.fluoroPulseRates;
  const pulseRates = rates.options
    .filter((option): option is number => typeof option === 'number')
    .map((option) => valueToSI(option, String(rates.unit)));
  const tipForceFullScale = si(hud.tipForceFullScale);
  return {
    fluoro: {
      defaultPulseRate: si(fluoro.defaultPulseRate),
      pulseRates,
      noiseSigma: fluoro.noiseSigma.value,
      blurRadiusPx: fluoro.blurRadius.value,
      vignetteStrength: fluoro.vignetteStrength.value,
      lastImageHold: fluoro.lastImageHold.value,
      background: fluoro.background.value,
      contrastPuffMaxOpacity: fluoro.contrastPuffMaxOpacity.value,
      contrastPuffFade: si(fluoro.contrastPuffFade),
      roadmapOutlineOpacity: fluoro.roadmapOutlineOpacity.value,
      roadmapOutlineGray: fluoro.roadmapOutlineGray.value,
      roadmapOutlineWidthPx: fluoro.roadmapOutlineWidth.value,
      wireOpacity: fluoro.wireOpacity.value,
      catheterOpacity: fluoro.catheterOpacity.value,
      softTissueBandOpacity: fluoro.softTissueBandOpacity.value,
      softTissueBandMarginMm: mm(fluoro.softTissueBandMargin),
      collimatedGray: fluoro.collimatedGray.value,
    },
    tubeRadialSegments: repository.render.tubeRadialSegments.value,
    threeD: {
      vesselOpacity: threeD.vesselOpacity.value,
      wireColor: threeD.deviceColorWire.text,
      catheterColor: threeD.deviceColorCatheter.text,
      vesselColor: threeD.vesselColor.text,
      sheathColor: threeD.sheathColor.text,
      backgroundColor: threeD.backgroundColor.text,
      cameraFovDeg: fromSI(si(threeD.cameraFov), 'deg'),
      cameraDistance: threeD.cameraDistance.value,
      hemisphereLightIntensity: threeD.hemisphereLightIntensity.value,
      keyLightIntensity: threeD.keyLightIntensity.value,
      surfaceRoughness: threeD.surfaceRoughness.value,
    },
    hud: {
      refreshRate: si(hud.uiRefreshRate),
      toastDuration: si(hud.toastDuration),
      blockedMessageDebounce: si(hud.blockedMessageDebounce),
      hubForceFullScale: si(feedback.hubForceFullScale),
      hubForceWarning: si(feedback.hubForceWarning),
      hubForceDanger: si(feedback.hubForceDanger),
      tipForceFullScale,
      wallStressFullScale: tipForceFullScale * si(hud.wallStressFullScaleTime),
    },
    audio: {
      alarm: {
        frequency: si(audio.alarmToneFrequency),
        duration: si(audio.alarmToneDuration),
        gain: audio.alarmToneGain.value,
      },
      blocked: {
        frequency: si(audio.blockedToneFrequency),
        duration: si(audio.blockedToneDuration),
        gain: audio.blockedToneGain.value,
      },
    },
    targetFrameRate: si(repository.render.targetFrameRate),
  };
}

/** How a device looks in both views: its radii, whether it is a tube, and radiopacity per segment. */
export interface DeviceLook {
  readonly rodModelId: string;
  readonly tube: boolean;
  /** At the tip; a tapered device is wider toward the handle (outerRadiiMm). */
  readonly outerRadiusMm: number;
  /** Outer radius per segment, handle (0) to tip. */
  readonly outerRadiiMm: Float32Array;
  /** 0 for a solid wire. */
  readonly innerRadiusMm: number;
  readonly segmentLengthMm: number;
  /** Radiopacity factor per segment, handle (0) to tip: the distal section gets the tip boost (rod model radiopacity). */
  readonly radiopacity: Float32Array;
  /** Fluoro opacity along a solid path one outer diameter long. */
  readonly opacity: number;
  /** 3D view color. */
  readonly color: string;
}

export function deviceLook(instance: RodDeviceInstance, config: RenderConfig): DeviceLook {
  const { segments } = instance;
  const tube = instance.innerDiameter !== null;
  const radiopacity = new Float32Array(segments.count);
  const outerRadiiMm = new Float32Array(segments.count);
  const tipBoost = instance.radiopacity.tipBoost.value;
  const body = instance.radiopacity.body.value;
  for (let j = 0; j < segments.count; j += 1) {
    radiopacity[j] = segments.section[j] === 0 ? tipBoost : body;
    outerRadiiMm[j] = fromSI(segments.outerRadius[j] ?? 0, 'mm');
  }
  return {
    rodModelId: instance.rodModelId,
    tube,
    outerRadiusMm: fromSI(segments.outerRadius[segments.count - 1] ?? 0, 'mm'),
    outerRadiiMm,
    innerRadiusMm: fromSI(segments.innerRadius[0] ?? 0, 'mm'),
    segmentLengthMm: fromSI(segments.length, 'mm'),
    radiopacity,
    opacity: tube ? config.fluoro.catheterOpacity : config.fluoro.wireOpacity,
    color: tube ? config.threeD.catheterColor : config.threeD.wireColor,
  };
}

/** The look of every rod model, laid out for a tier. */
export function deviceLooks(
  repository: Repository,
  tierId: string,
  config: RenderConfig,
): Readonly<Record<string, DeviceLook>> {
  const { segmentLength } = tierParams(repository, tierId);
  return Object.fromEntries(
    [...repository.rodModels.keys()].map((id) => [
      id,
      deviceLook(buildRodInstance(repository, id, segmentLength), config),
    ]),
  );
}
