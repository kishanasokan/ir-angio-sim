import { z } from 'zod';
import { factSchema, idSchema } from './fact';

/** The drug cart and contrast-reaction protocol, data/patient/drugs.json (spec 02 §10). */

export const drugsSchema = z.looseObject({
  schema: z.literal('ir-sim/drugs@1'),
  notes: z.string().optional(),
  drugs: z.array(
    z.looseObject({
      id: idSchema,
      name: z.string().min(1),
      doses: z.array(factSchema).optional(),
    }),
  ),
  contrastReactions: z.array(
    z.looseObject({
      id: idSchema,
      reaction: z.string().min(1),
      steps: z.array(factSchema).min(1),
    }),
  ),
});

export type DrugsFile = z.infer<typeof drugsSchema>;
