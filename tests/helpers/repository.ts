import { fileURLToPath } from 'node:url';
import { readDataFiles } from '../../scripts/lib/dataFiles';
import { loadRepository, type Repository } from '../../src/data/loaders';
import { valueToSI } from '../../src/data/units';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DATA_ROOT = fileURLToPath(new URL('../../data/', import.meta.url));
export const FIXTURES_ROOT = fileURLToPath(new URL('../fixtures/data-invalid/', import.meta.url));

let cached: Repository | undefined;

/** The repository data, validated and loaded once per test file. */
export function repository(): Repository {
  cached ??= loadRepository(readDataFiles(DATA_ROOT));
  return cached;
}

/** A tier's segment length in metres, from data/tuning/physics.json. */
export function tierSegmentLength(tierId: string): number {
  const tier = repository().physics.tiers.find((entry) => entry.id === tierId);
  if (tier === undefined) {
    throw new Error(`No tier "${tierId}" in data/tuning/physics.json.`);
  }
  return valueToSI(tier.segmentLength.value, tier.segmentLength.unit);
}

export function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}
