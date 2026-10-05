import { z } from 'zod';
import { idSchema, numberFactSchema, selectionSchema } from './fact';

/** Case files, data/cases/*.json, version 0: the minimum the sandbox needs (spec 02 §12). */

export const CASE_MODES = ['sandbox', 'guided', 'independent', 'random'] as const;

export const caseSchema = z.looseObject({
  schema: z.literal('ir-sim/case@0'),
  id: idSchema,
  title: z.string().min(1),
  modes: z.array(z.enum(CASE_MODES)).min(1),
  summary: z.string().min(1),
  anatomy: z.looseObject({ options: z.array(idSchema).min(1), default: idSchema }),
  start: z.looseObject({
    sheath: z.looseObject({
      device: idSchema,
      select: z.record(z.string(), selectionSchema),
      choices: z.array(z.number()).optional(),
    }),
    // An access id in the anatomy graph.
    at: idSchema,
    insertion: z
      .array(
        z.looseObject({
          rodModel: idSchema,
          // Initial tip depth past the sheath tip and hub angle.
          tipBeyondAccess: numberFactSchema,
          hubRotation: numberFactSchema,
        }),
      )
      .min(1),
  }),
  inventory: z.array(z.looseObject({ rodModel: idSchema })).min(1),
  // Movable devices, outermost first; the sheath is fixed.
  initialStack: z.array(idSchema).min(1),
  // Read by rules as case.targetDistance.
  targetDistance: numberFactSchema.optional(),
  autopilot: z.array(
    z.looseObject({
      id: idSchema,
      anatomy: idSchema,
      description: z.string().min(1),
      params: z.record(z.string(), numberFactSchema),
    }),
  ),
  disclaimer: z.literal('required'),
});

export type CaseFile = z.infer<typeof caseSchema>;
