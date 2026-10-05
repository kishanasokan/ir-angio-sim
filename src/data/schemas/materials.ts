import { z } from 'zod';
import { idSchema, numberFactSchema, textFactSchema } from './fact';

/** Friction coefficients and bulk material properties, data/physics/materials.json (spec 02 §2). */

export const frictionSchema = z.looseObject({
  id: idSchema,
  pair: z.string().min(1),
  coefficient: numberFactSchema,
});

export const bulkMaterialSchema = z.looseObject({
  id: idSchema,
  name: z.string().min(1),
  density: numberFactSchema,
  poissonRatio: numberFactSchema,
});

export const materialsFileSchema = z.looseObject({
  schema: z.literal('ir-sim/materials@1'),
  notes: z.string().optional(),
  friction: z.array(frictionSchema),
  derivations: z.array(textFactSchema.extend({ id: idSchema })).optional(),
  bulk: z.array(bulkMaterialSchema),
});

export type Friction = z.infer<typeof frictionSchema>;
export type BulkMaterial = z.infer<typeof bulkMaterialSchema>;
export type MaterialsFile = z.infer<typeof materialsFileSchema>;
