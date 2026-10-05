import { defineConfig } from 'vitest/config';

// Tests load the code with Node's own import, through tsx, instead of Vite's module runner. The runner reaches every
// imported binding through a getter on a slow-mode object, which made the solver's inner loops about 7× slower.
// Tests of Vite features such as import.meta.glob keep the runner.
const NATIVE = { experimental: { viteModuleRunner: false }, execArgv: ['--import', 'tsx'] };
const NEEDS_VITE = ['tests/unit/loaders.test.ts'];

export default defineConfig({
  test: {
    environment: 'node',
    // Golden scenes simulate several seconds of physics each.
    testTimeout: 300_000,
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], exclude: NEEDS_VITE, ...NATIVE },
      },
      { extends: true, test: { name: 'vite', include: NEEDS_VITE } },
      { extends: true, test: { name: 'golden', include: ['tests/golden/**/*.golden.test.ts'], ...NATIVE } },
    ],
  },
});
