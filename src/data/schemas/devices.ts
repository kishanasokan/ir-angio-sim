import { z } from 'zod';
import { factSchema, idSchema, textFactSchema } from './fact';

/** Device files in data/devices/ (spec 02 §7). Items keep category-specific facts beside the common fields. */

const textFactList = z.array(textFactSchema);
const propertyGroup = z.record(z.string(), factSchema);

export const deviceItemSchema = z
  .looseObject({
    id: idSchema,
    kind: z.string().min(1),
    // Spec 02 §7.1 requires genericName, but nine coil and plug items in embolics.json carry only a brand name,
    // so an item needs at least one of the two.
    genericName: z.string().min(1).optional(),
    brandName: z.string().min(1).optional(),
    manufacturer: z.string().min(1).optional(),
    role: z.string().optional(),
    family: factSchema.optional(),
    design: factSchema.optional(),
    mechanism: factSchema.optional(),
    geometry: propertyGroup.optional(),
    mechanics: propertyGroup.optional(),
    ratings: propertyGroup.optional(),
    compatibility: propertyGroup.optional(),
    teaching: textFactList.optional(),
    steps: textFactList.optional(),
    failureModes: z.union([textFactList, factSchema]).optional(),
  })
  .refine(
    (item) => item.genericName !== undefined || item.brandName !== undefined,
    'a device item needs a genericName or a brandName',
  );

export const devicesFileSchema = z.looseObject({
  schema: z.literal('ir-sim/devices@1'),
  category: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(deviceItemSchema),
  rules: z.array(textFactSchema.extend({ id: idSchema })).optional(),
  behaviorRules: textFactList.optional(),
  sites: z.array(z.looseObject({ id: idSchema, name: z.string().min(1) })).optional(),
});

export type DeviceItem = z.infer<typeof deviceItemSchema>;
export type DevicesFile = z.infer<typeof devicesFileSchema>;
