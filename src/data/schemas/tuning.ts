import { z } from 'zod';
import {
  factSchema,
  idSchema,
  numberFactSchema,
  rangeFactSchema,
  selectionSchema,
  textFactSchema,
  tuningNumberSchema,
} from './fact';

/**
 * Design values and rod models, data/tuning/*.json (spec 02 §11). Unit-bearing values without a confidence are
 * design choices (spec 02 §4.5); anything that describes a real device carries its own confidence.
 */

const value = tuningNumberSchema;

const tuningBase = {
  schema: z.literal('ir-sim/tuning@1'),
  notes: z.string().optional(),
};

const tierSchema = z.looseObject({
  id: idSchema,
  renderer: z.string().min(1),
  model: z.enum(['rod', 'rail']),
  stepRate: value,
  substeps: value,
  segmentLength: value,
  autoSelect: z.looseObject({ maxPhysicsPerFrame: value, benchmarkSteps: value, benchmarkDepth: value }).optional(),
  availableFrom: z.string().optional(),
});

const sectionSchema = z
  .looseObject({
    name: z.string().min(1),
    fromTip: value,
    toTip: value,
    // An absolute modulus, or a ratio to the item's body modulus; a {min, max} ratio is a linear ramp.
    youngsModulus: numberFactSchema.optional(),
    youngsModulusRatio: factSchema.optional(),
  })
  .refine(
    (section) => (section.youngsModulus === undefined) !== (section.youngsModulusRatio === undefined),
    'a section needs exactly one of youngsModulus and youngsModulusRatio',
  );

const restShapeSchema = z.looseObject({
  fromTip: value,
  toTip: value,
  bendAngle: numberFactSchema,
  // The region turns the tip toward material axis d1 unless it says d2 (spec 02 §11.1).
  toward: z.enum(['d1', 'd2']).optional(),
});

export const rodModelSchema = z.looseObject({
  id: idSchema,
  deviceId: idSchema,
  variant: z.record(z.string(), selectionSchema),
  variantNote: z.string().optional(),
  materialId: idSchema,
  materialAssumption: textFactSchema.optional(),
  innerDiameter: numberFactSchema.optional(),
  sections: z.array(sectionSchema).min(1),
  bodyYoungsModulusFrom: z.string().min(1).optional(),
  restShape: z.array(restShapeSchema),
  frictionId: idSchema,
  lumenFrictionId: idSchema.optional(),
  radiopacity: z.looseObject({ tipBoost: numberFactSchema, body: numberFactSchema }),
});

export const physicsTuningSchema = z.looseObject({
  ...tuningBase,
  category: z.literal('physics'),
  solver: z.looseObject({
    linearDamping: value,
    angularDamping: value,
    gravity: value,
    lumenContactMargin: value,
    settleKineticEnergy: value,
    lumenGridCell: value,
    settleSteps: value,
    maxStepsPerMessage: value,
    maxStepsPerMessageFast: value,
    contactActivationDistance: value,
    contactSolvePasses: value,
    rotationalInertiaScale: value,
    frictionSlipSpeed: value,
    frictionSlipSpin: value,
    loadRelaxSteps: value,
  }),
  tiers: z.array(tierSchema).min(1),
  feedback: z.looseObject({
    hubForceFullScale: value,
    hubForceWarning: value,
    hubForceDanger: value,
    wallStressThreshold: value,
    tipForceNodes: value,
  }),
  rodModels: z.array(rodModelSchema),
  ruleParameters: z.record(z.string(), value),
});

const rumbleEventSchema = z.looseObject({
  id: idSchema,
  pattern: z.enum(['single', 'double', 'long', 'pulsed']),
  strong: value,
  weak: value,
  duration: value,
  gap: value.optional(),
  repeats: value.optional(),
  note: z.string().optional(),
});

export const inputTuningSchema = z.looseObject({
  ...tuningBase,
  category: z.literal('input'),
  sticks: z.looseObject({ deadZone: value, responseExponent: value, triggerThreshold: value }),
  settingsLimits: z.looseObject({
    deadZone: rangeFactSchema,
    deadZoneStep: value,
    responseExponent: rangeFactSchema,
    responseExponentStep: value,
    rumbleStrengthStep: value,
  }),
  devices: z.looseObject({
    advanceSpeedMax: value,
    rotationSpeedMax: value,
    fineScale: value,
    quarterTurnStep: value,
  }),
  mouse: z.looseObject({
    dragAdvancePerPixel: value,
    dragRotatePerPixel: value,
    wheelAdvancePerNotch: value,
    dragCarmPerPixel: value,
    dragTablePerPixel: value,
  }),
  control: z.looseObject({
    tablePanSpeed: value,
    tableHeightSpeed: value,
    detectorSpeed: value,
    collimationSpeed: value,
    collimationMin: value,
    collimationMax: value,
    savedViews: value,
  }),
  rumble: z.looseObject({
    updateRate: value,
    contactDuration: value,
    contactFullScaleForce: value,
    contactWeakMax: value,
    events: z.array(rumbleEventSchema),
    strengthDefault: value,
  }),
  autopilot: z.looseObject({ takeoverThreshold: value, advanceSpeed: value, rotateSpeed: value, settings: textFactSchema }),
});

export const renderTuningSchema = z.looseObject({
  ...tuningBase,
  category: z.literal('render'),
  fluoro: z.looseObject({
    defaultPulseRate: value,
    noiseSigma: value,
    blurRadius: value,
    vignetteStrength: value,
    lastImageHold: z.looseObject({ value: z.boolean() }),
    background: value,
    contrastPuffMaxOpacity: value,
    contrastPuffFade: value,
    roadmapOutlineOpacity: value,
    wireOpacity: value,
    catheterOpacity: value,
    softTissueBandOpacity: value,
    softTissueBandMargin: value,
    collimatedGray: value,
    roadmapOutlineGray: value,
    roadmapOutlineWidth: value,
  }),
  tubeRadialSegments: value,
  threeD: z.looseObject({
    vesselOpacity: value,
    deviceColorWire: textFactSchema,
    deviceColorCatheter: textFactSchema,
    vesselColor: textFactSchema,
    sheathColor: textFactSchema,
    backgroundColor: textFactSchema,
    cameraFov: value,
    cameraDistance: value,
    hemisphereLightIntensity: value,
    keyLightIntensity: value,
    surfaceRoughness: value,
  }),
  hud: z.looseObject({
    uiRefreshRate: value,
    toastDuration: value,
    blockedMessageDebounce: value,
    tipForceFullScale: value,
    wallStressFullScaleTime: value,
  }),
  audio: z.looseObject({
    alarmToneFrequency: value,
    alarmToneDuration: value,
    alarmToneGain: value,
    blockedToneFrequency: value,
    blockedToneDuration: value,
    blockedToneGain: value,
  }),
  targetFrameRate: value,
  carm: z.looseObject({
    defaultSourceToImageDistance: value,
    defaultZoomField: value,
    defaultTableHeight: value,
  }),
});

export const tuningFileSchema = z.discriminatedUnion('category', [
  physicsTuningSchema,
  inputTuningSchema,
  renderTuningSchema,
]);

export type RodModel = z.infer<typeof rodModelSchema>;
export type PhysicsTuning = z.infer<typeof physicsTuningSchema>;
export type InputTuning = z.infer<typeof inputTuningSchema>;
export type RenderTuning = z.infer<typeof renderTuningSchema>;
export type TuningFile = z.infer<typeof tuningFileSchema>;
