import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../helpers/repository';

// npm run validate-data prints errors and a report, and exits 1 on any error (spec 02 §14).

const TSX = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const CLI_TIMEOUT_MS = 60_000;

function runCli(...args: string[]) {
  return spawnSync(TSX, ['scripts/validate-data.ts', ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
}

describe('validate-data CLI', () => {
  it(
    'exits 0 on the repository data and prints the report',
    () => {
      const run = runCli();
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('Errors: none');
      expect(run.stdout).toContain('Facts by confidence:');
      expect(run.stdout).toContain('Placeholders (');
      expect(run.stdout).toContain('Sources never cited by /data');
    },
    CLI_TIMEOUT_MS,
  );

  it(
    'exits 1 and names the error on an invalid fixture',
    () => {
      const run = runCli('tests/fixtures/data-invalid/selection-mismatch');
      expect(run.status).toBe(1);
      expect(run.stdout).toContain('[selection-mismatch] tuning/physics.json#rodModels[0].variant.diameter');
    },
    CLI_TIMEOUT_MS,
  );
});
