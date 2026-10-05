import { createHasher, hashHex, hashString } from '../sim/core/hash';
import type { DataFile } from './validate';

/**
 * A hash of /data (spec 02 §13): FNV-1a over every file's path and text, in path order, with line endings normalized
 * so a checkout on any platform hashes the same. Input logs carry it, and a replay refuses different data.
 */
export function dataHash(files: readonly DataFile[]): string {
  const hasher = createHasher();
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const file of sorted) {
    hashString(hasher, file.path);
    hashString(hasher, '\n');
    hashString(hasher, file.text.replace(/\r\n/g, '\n'));
    hashString(hasher, '\n');
  }
  return hashHex(hasher);
}
