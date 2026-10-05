import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { DataFile } from '../../src/data/validate';

/** Reads every .json file under a data root, with paths relative to the root and sorted for stable output. */
export function readDataFiles(root: string): DataFile[] {
  const files: DataFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push({ path: relative(root, full).split(sep).join('/'), text: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(root);
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
