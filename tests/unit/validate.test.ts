import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDataFiles } from '../../scripts/lib/dataFiles';
import { CONFIDENCE_LEVELS } from '../../src/data/facts';
import { ERROR_CODES, validateData } from '../../src/data/validate';
import { DATA_ROOT, FIXTURES_ROOT } from '../helpers/repository';

// Unit test 3 (prompts/M1-foundations.md §8): the repository data passes, and each fixture in
// tests/fixtures/data-invalid/ fails with its expected code, one fixture per code.

describe('unit test 3 · data validation', () => {
  const repositoryFiles = readDataFiles(DATA_ROOT);
  const result = validateData(repositoryFiles);

  it('passes the repository data', () => {
    expect(result.errors).toEqual([]);
    expect(result.files.every((file) => file.valid)).toBe(true);
  });

  it('reports counts that add up', () => {
    const { report } = result;
    expect(report.files.map((file) => file.path)).toEqual(repositoryFiles.map((file) => file.path));
    for (const level of CONFIDENCE_LEVELS) {
      const sum = report.files.reduce((total, file) => total + file.counts[level], 0);
      expect(report.totals[level], level).toBe(sum);
    }
    expect(report.placeholders).toHaveLength(report.totals.placeholder);
    expect(report.uncitedSources.length).toBeGreaterThan(0);
  });

  it('has exactly one fixture folder per error code', () => {
    const folders = readdirSync(FIXTURES_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(folders).toEqual([...ERROR_CODES].sort());
  });

  describe.each(ERROR_CODES)('fixture %s', (code) => {
    it(`fails with code ${code} and nothing else`, () => {
      const { errors } = validateData(readDataFiles(join(FIXTURES_ROOT, code)));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.map((error) => error.code)).toEqual(errors.map(() => code));
    });
  });

  it('reports a file that is not JSON, or has an unknown schema id, as a schema error', () => {
    const { errors } = validateData([
      { path: 'broken.json', text: '{"schema": ' },
      { path: 'future.json', text: '{"schema": "ir-sim/devices@9"}' },
    ]);
    expect(errors.map((error) => [error.code, error.path])).toEqual([
      ['schema', 'broken.json'],
      ['schema', 'future.json#schema'],
    ]);
  });
});
