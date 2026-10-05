import { z } from 'zod';
import { idSchema } from './fact';

/** Machine-checkable compatibility rules, data/rules/compatibility.json (spec 02 §8). */

export const FAILURE_MODES = [
  'block',
  'block-or-friction',
  'jam',
  'degrade',
  'rupture',
  'warn',
  'fail-closure',
] as const;
export type FailureMode = (typeof FAILURE_MODES)[number];

export type Aggregate = 'max' | 'min';

export type Check =
  | {
      readonly type: 'lte' | 'lt';
      readonly left: string;
      readonly right: string;
      readonly leftAgg?: Aggregate;
      readonly rightAgg?: Aggregate;
    }
  | { readonly type: 'all'; readonly of: readonly Check[] }
  | { readonly type: 'sum-lte'; readonly terms: readonly string[]; readonly limit: string }
  | {
      readonly type: 'flag-required';
      readonly flag: string;
      readonly when: { readonly path: string; readonly equals: string | number | boolean };
    }
  | { readonly type: 'device-specific'; readonly field: string }
  | { readonly type: 'state'; readonly condition: string };

const aggregateSchema = z.enum(['max', 'min']);

export const checkSchema: z.ZodType<Check> = z.lazy(() =>
  z.union([
    z.object({
      type: z.enum(['lte', 'lt']),
      left: z.string().min(1),
      right: z.string().min(1),
      leftAgg: aggregateSchema.optional(),
      rightAgg: aggregateSchema.optional(),
    }),
    z.object({ type: z.literal('all'), of: z.array(checkSchema).min(1) }),
    z.object({ type: z.literal('sum-lte'), terms: z.array(z.string().min(1)).min(1), limit: z.string().min(1) }),
    z.object({
      type: z.literal('flag-required'),
      flag: z.string().min(1),
      when: z.object({ path: z.string().min(1), equals: z.union([z.string(), z.number(), z.boolean()]) }),
    }),
    z.object({ type: z.literal('device-specific'), field: z.string().min(1) }),
    z.object({ type: z.literal('state'), condition: z.string().min(1) }),
  ]),
);

export const ruleSchema = z.looseObject({
  id: idSchema,
  // Shown to the learner when the rule blocks something (golden rule 7).
  text: z.string().min(1),
  pair: z.tuple([z.string(), z.string()]).optional(),
  check: checkSchema,
  failure: z.object({ mode: z.enum(FAILURE_MODES), message: z.string().min(1) }),
  confidence: z.string(),
});

export const rulesFileSchema = z.looseObject({
  schema: z.literal('ir-sim/rules@1'),
  category: z.string().min(1),
  notes: z.string().optional(),
  rules: z.array(ruleSchema),
  // Roles map to device kinds, for example catheter → selective-catheter, flush-catheter...
  roles: z.record(z.string(), z.array(z.string().min(1)).min(1)),
});

export type Rule = z.infer<typeof ruleSchema>;
export type RulesFile = z.infer<typeof rulesFileSchema>;
