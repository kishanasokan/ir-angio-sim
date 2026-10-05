import { z } from 'zod';
import { factSchema, idSchema, vec3Schema } from './fact';

/**
 * Vessel graphs, data/anatomy/phantoms/*.json (spec 02 §9.2). Positions are millimetres in the LPS patient frame:
 * x = patient left, y = posterior, z = superior. Geometric consistency (nodes exist, centerlines meet their nodes,
 * one positive radius per point) is checked by validate.ts with the `graph` error code.
 */

export const NODE_KINDS = ['inlet', 'junction', 'outlet', 'cap'] as const;
export const DISEASE_KINDS = ['stenosis', 'occlusion', 'calcification', 'aneurysm', 'tortuosity'] as const;

export const anatomyNodeSchema = z.looseObject({
  id: idSchema,
  position: vec3Schema,
  kind: z.enum(NODE_KINDS),
});

export const anatomySegmentSchema = z.looseObject({
  id: idSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  centerline: z.array(vec3Schema),
  radii: z.array(z.number()),
  tags: z.looseObject({ name: z.string().min(1), territory: z.string().min(1), variant: z.string().optional() }),
  wall: z.record(z.string(), factSchema).optional(),
  disease: z
    .array(
      z.looseObject({
        kind: z.enum(DISEASE_KINDS),
        at: z.number(),
        params: z.record(z.string(), factSchema),
      }),
    )
    .optional(),
});

export const anatomyAccessSchema = z.looseObject({
  id: idSchema,
  node: z.string().min(1),
  kind: z.literal('sheath'),
  direction: vec3Schema,
});

export const anatomyGraphSchema = z.looseObject({
  schema: z.literal('ir-sim/anatomy-graph@1'),
  id: idSchema,
  name: z.string().min(1),
  units: z.literal('mm'),
  frame: z.literal('LPS'),
  frameNote: z.string().optional(),
  provenance: factSchema,
  nodes: z.array(anatomyNodeSchema).min(1),
  segments: z.array(anatomySegmentSchema),
  outlets: z
    .array(
      z.looseObject({
        node: z.string().min(1),
        bed: z.string().min(1),
        resistance: factSchema.optional(),
        flowFraction: factSchema.optional(),
      }),
    )
    .optional(),
  access: z.array(anatomyAccessSchema),
  landmarks: z.array(z.looseObject({ id: idSchema, position: vec3Schema, kind: z.string().min(1) })),
});

export type AnatomyGraphFile = z.infer<typeof anatomyGraphSchema>;
export type AnatomySegment = z.infer<typeof anatomySegmentSchema>;
