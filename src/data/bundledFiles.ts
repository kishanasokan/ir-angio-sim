import type { DataFile } from './validate';

/**
 * Every /data file, bundled into the app as raw text by Vite, so the browser validates exactly the bytes that
 * `npm run validate-data` checked. No file is fetched at runtime (CLAUDE.md rule 12).
 */
const RAW_FILES = import.meta.glob<string>('/data/**/*.json', { query: '?raw', import: 'default', eager: true });

export const BUNDLED_DATA_FILES: readonly DataFile[] = Object.entries(RAW_FILES)
  .map(([path, text]) => ({ path: path.replace(/^\/data\//, ''), text }))
  .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
