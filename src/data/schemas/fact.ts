import { z } from 'zod';

// Zod's JIT probes for eval support with `new Function`, which a strict Content Security Policy reports as a
// console error; jitless mode skips the probe (docs/M1-plan.md D23).
z.config({ jitless: true });

/**
 * These schemas check the structure of /data files. Fact contents (confidence level, quantity shape, units and
 * provenance) are checked by the fact walker in validate.ts, which reports each problem with its own error code.
 */

/** Ids are lowercase kebab-case; microcatheter ids also carry decimal sizes such as mc-progreat-2.0. */
export const idSchema = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'ids are lowercase kebab-case');

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dates are written YYYY-MM-DD');

export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

/** Any fact: an object with a confidence field (spec 02 §4). */
export const factSchema = z.looseObject({ confidence: z.string() });

export const textFactSchema = z.looseObject({ text: z.string().min(1), confidence: z.string() });

/** A numeric fact the simulation or the UI reads. */
export const numberFactSchema = z.looseObject({
  value: z.number(),
  unit: z.string(),
  confidence: z.string(),
});

export const rangeFactSchema = z.looseObject({
  min: z.number(),
  max: z.number(),
  unit: z.string(),
  confidence: z.string(),
});

export const optionsFactSchema = z.looseObject({
  options: z.array(z.union([z.number(), z.string()])).min(1),
  confidence: z.string(),
});

/** A numeric value in a tuning file; without a confidence it is a design value (spec 02 §4.5). */
export const tuningNumberSchema = z.looseObject({ value: z.number(), unit: z.string() });

/** A choice from an item's options or range (spec 02 §4.4). */
export const selectionSchema = z.union([
  z.string(),
  z.number(),
  z.looseObject({ value: z.union([z.number(), z.string()]) }),
]);
