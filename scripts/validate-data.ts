/**
 * npm run validate-data [data-root]
 *
 * Validates /data (or another data root, such as a test fixture) against spec 02 §14, prints every error and a
 * report, and exits 1 on any error. The checks live in src/data/validate.ts.
 */
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { CONFIDENCE_LEVELS } from '../src/data/facts';
import { validateData } from '../src/data/validate';
import { readDataFiles } from './lib/dataFiles';

const root = resolve(process.argv[2] ?? 'data');
const shownRoot = relative(process.cwd(), root) || '.';

if (!existsSync(root)) {
  console.error(`validate-data: ${shownRoot} does not exist.`);
  process.exit(1);
}

const files = readDataFiles(root);
const { errors, report } = validateData(files);
const lines: string[] = [`validate-data: ${files.length} files in ${shownRoot}`, ''];

if (errors.length === 0) {
  lines.push('Errors: none');
} else {
  lines.push(`Errors (${errors.length}):`);
  for (const error of errors) {
    lines.push(`  [${error.code}] ${error.path}: ${error.message}`);
  }
}

// Confidence counts per file (spec 02 §14.7).
const nameWidth = Math.max('total'.length, ...report.files.map((file) => file.path.length));
const columnWidth = Math.max(...CONFIDENCE_LEVELS.map((level) => level.length)) + 2;
const row = (name: string, values: readonly (string | number)[]): string =>
  `  ${name.padEnd(nameWidth)}${values.map((value) => String(value).padStart(columnWidth)).join('')}`;
lines.push('', 'Facts by confidence:', row('file', CONFIDENCE_LEVELS));
for (const file of report.files) {
  lines.push(
    row(
      file.path,
      CONFIDENCE_LEVELS.map((level) => file.counts[level]),
    ),
  );
}
lines.push(
  row(
    'total',
    CONFIDENCE_LEVELS.map((level) => report.totals[level]),
  ),
);

lines.push('', `Placeholders (${report.placeholders.length}):`);
for (const placeholder of report.placeholders) {
  lines.push(`  ${placeholder.path}${placeholder.note === undefined ? '' : ` — ${placeholder.note}`}`);
}

lines.push('', `Sources never cited by /data (${report.uncitedSources.length}):`);
lines.push(`  ${report.uncitedSources.join(', ') || 'none'}`);

lines.push('', errors.length === 0 ? 'OK: the data passes validation.' : `FAILED: ${errors.length} errors.`);
console.log(lines.join('\n'));
process.exitCode = errors.length === 0 ? 0 : 1;
