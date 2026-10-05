import { z } from 'zod';
import { factSchema, textFactSchema } from './fact';

/** Hemorrhage classes, sedation behavior and monitor channels, data/patient/physiology.json (spec 02 §10). */

export const physiologySchema = z.looseObject({
  schema: z.literal('ir-sim/physiology@1'),
  notes: z.string().optional(),
  hemorrhageClasses: z.array(z.looseObject({ class: z.string().min(1) })),
  hemorrhageModel: z.array(textFactSchema),
  sedation: z.array(textFactSchema),
  vasovagal: z.looseObject({}),
  monitorChannels: factSchema,
});

export type PhysiologyFile = z.infer<typeof physiologySchema>;
