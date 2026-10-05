import type { z } from 'zod';
import { anatomyGraphSchema } from './anatomyGraph';
import { anatomyReferenceSchema } from './anatomyReference';
import { caseSchema } from './case';
import { devicesFileSchema } from './devices';
import { drugsSchema } from './drugs';
import { imagingSchema } from './imaging';
import { materialsFileSchema } from './materials';
import { physiologySchema } from './physiology';
import { rulesFileSchema } from './rules';
import { sourcesFileSchema } from './sources';
import { tuningFileSchema } from './tuning';

/** Every schema id in spec 02 §2 and the schema that checks files carrying it. */
export const SCHEMAS = {
  'ir-sim/sources@1': sourcesFileSchema,
  'ir-sim/devices@1': devicesFileSchema,
  'ir-sim/rules@1': rulesFileSchema,
  'ir-sim/materials@1': materialsFileSchema,
  'ir-sim/anatomy-reference@1': anatomyReferenceSchema,
  'ir-sim/anatomy-graph@1': anatomyGraphSchema,
  'ir-sim/imaging@1': imagingSchema,
  'ir-sim/physiology@1': physiologySchema,
  'ir-sim/drugs@1': drugsSchema,
  'ir-sim/tuning@1': tuningFileSchema,
  'ir-sim/case@0': caseSchema,
} as const satisfies Record<string, z.ZodType>;

export type SchemaId = keyof typeof SCHEMAS;

export function isSchemaId(value: unknown): value is SchemaId {
  return typeof value === 'string' && Object.hasOwn(SCHEMAS, value);
}

export type { AnatomyGraphFile, AnatomySegment } from './anatomyGraph';
export type { AnatomyReferenceFile } from './anatomyReference';
export type { CaseFile } from './case';
export type { DeviceItem, DevicesFile } from './devices';
export type { DrugsFile } from './drugs';
export type { ImagingFile } from './imaging';
export type { BulkMaterial, Friction, MaterialsFile } from './materials';
export type { PhysiologyFile } from './physiology';
export type { Check, FailureMode, Rule, RulesFile } from './rules';
export type { Source, SourcesFile } from './sources';
export type { InputTuning, PhysicsTuning, RenderTuning, RodModel, TuningFile } from './tuning';
