import { z } from 'zod';
import { factSchema, idSchema } from './fact';

/** Reference calibers, flows and variant frequencies, data/anatomy/reference.json (spec 02 §9.1). */

export const anatomyReferenceSchema = z.looseObject({
  schema: z.literal('ir-sim/anatomy-reference@1'),
  notes: z.string().optional(),
  calibers: z.array(z.looseObject({ id: idSchema, vessel: z.string().min(1) })),
  flows: z.array(z.looseObject({ id: idSchema, bed: z.string().min(1) })),
  variants: z.array(
    z.looseObject({
      territory: z.string().min(1),
      classification: z.string().min(1),
      // Frequencies are sampling weights for the variant generator (spec 03).
      entries: z.array(factSchema.extend({ id: idSchema, label: z.string().min(1) })).min(1),
    }),
  ),
});

export type AnatomyReferenceFile = z.infer<typeof anatomyReferenceSchema>;
