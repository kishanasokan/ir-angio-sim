import { z } from 'zod';
import { dateSchema, idSchema } from './fact';

/** The source registry, data/sources.json (spec 02 §6). */

export const SOURCE_TYPES = [
  'journal',
  'textbook',
  'teaching',
  'manufacturer',
  'ifu',
  'listing',
  'device-guide',
  'guideline',
  'course',
  'web',
  'software',
  'dataset',
] as const;

export const sourceSchema = z.looseObject({
  id: idSchema,
  title: z.string().min(1),
  url: z.string().startsWith('https://', 'source URLs use https'),
  type: z.enum(SOURCE_TYPES),
  // Only opened sources may back sourced or derived facts (spec 02 §3).
  opened: z.boolean(),
  notes: z.string().optional(),
});

export const sourcesFileSchema = z.looseObject({
  schema: z.literal('ir-sim/sources@1'),
  description: z.string().optional(),
  accessed: dateSchema,
  sources: z.array(sourceSchema),
});

export type Source = z.infer<typeof sourceSchema>;
export type SourcesFile = z.infer<typeof sourcesFileSchema>;
