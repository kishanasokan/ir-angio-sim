import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DISCLAIMER } from '../../src/app/disclaimer';
import { REPO_ROOT } from '../helpers/repository';

// Golden rule 1: the start screen shows the exact disclaimer from spec/00-product-brief.md §2, and the README
// carries the same text.

function blockquoteAfter(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  if (start < 0) {
    throw new Error(`Heading "${heading}" not found.`);
  }
  const line = markdown
    .slice(start)
    .split('\n')
    .find((candidate) => candidate.startsWith('> '));
  if (line === undefined) {
    throw new Error(`No blockquote after "${heading}".`);
  }
  return line.slice(2).trim();
}

describe('disclaimer', () => {
  it('matches spec/00-product-brief.md §2 exactly', () => {
    const spec = readFileSync(join(REPO_ROOT, 'spec/00-product-brief.md'), 'utf8');
    expect(DISCLAIMER).toBe(blockquoteAfter(spec, '## 2. Disclaimer'));
  });

  it('matches the README, apart from its bold first sentence', () => {
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
    expect(DISCLAIMER).toBe(blockquoteAfter(readme, '# IR Angio Suite Simulator').replaceAll('**', ''));
  });
});
