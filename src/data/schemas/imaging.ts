import { z } from 'zod';
import {
  factSchema,
  idSchema,
  numberFactSchema,
  optionsFactSchema,
  rangeFactSchema,
  textFactSchema,
} from './fact';

/**
 * Gantry and table limits, imaging modes, dose thresholds, injection protocols and contrast limits,
 * data/imaging/imaging.json (spec 02 §10). M1 reads the gantry, table and rates; spec 08 details the rest.
 */

export const imagingSchema = z.looseObject({
  schema: z.literal('ir-sim/imaging@1'),
  notes: z.string().optional(),
  gantry: z.looseObject({
    rotation: rangeFactSchema,
    rotationSpeedMax: numberFactSchema,
    angulation: rangeFactSchema,
    angulationSpeedMax: numberFactSchema,
    sourceToImageDistance: rangeFactSchema,
    focalSpotToIsocenter: numberFactSchema,
    detectorDiagonal: numberFactSchema,
    zoomFields: optionsFactSchema,
  }),
  table: z.looseObject({
    height: rangeFactSchema,
    longitudinalTravel: numberFactSchema,
    lateralTravel: numberFactSchema,
  }),
  rates: z.looseObject({
    fluoroPulseRates: optionsFactSchema,
    acquisitionFrameRates: rangeFactSchema,
  }),
  projections: z.array(z.looseObject({ target: z.string().min(1), projection: factSchema })),
  modes: z.array(z.looseObject({ id: idSchema, behavior: factSchema })),
  dose: z.looseObject({ metrics: z.array(z.looseObject({ id: idSchema, name: z.string().min(1) })) }),
  injections: z.looseObject({ protocols: z.array(z.looseObject({ territory: z.string().min(1) })) }),
  contrast: z.looseObject({}),
  injectionModelRules: z.array(textFactSchema),
});

export type ImagingFile = z.infer<typeof imagingSchema>;
