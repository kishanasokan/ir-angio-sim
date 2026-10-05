// @ts-check
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// CLAUDE.md rule 4: simulation and input-mapping code is pure and deterministic. It never touches the DOM,
// wall time, randomness, storage or the network.
const PURE_FILES = ['src/sim/**/*.ts', 'src/input/mapping/**/*.ts', 'src/worker/session.ts'];
const SIM_FILES = ['src/sim/**/*.ts'];
// Polynomial, hash and PRNG constants and array strides live here (golden rule 3 override).
const SIM_CONSTANT_FILES = ['src/sim/math/**', 'src/sim/core/**'];

const IMPURE_GLOBALS = [
  'window',
  'document',
  'navigator',
  'self',
  'globalThis',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'performance',
  'crypto',
  'Date',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'postMessage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'setTimeout',
  'setInterval',
  'queueMicrotask',
  'AudioContext',
].map((name) => ({
  name,
  message: `${name} is not allowed in pure simulation or mapping code (CLAUDE.md rule 4).`,
}));

const IMPURE_PROPERTIES = [
  { object: 'Math', property: 'random', message: 'Use the seeded PRNG in src/sim/core/rng.ts.' },
  { object: 'Date', property: 'now', message: 'Time comes from the fixed step counter.' },
  { object: 'performance', property: 'now', message: 'Time comes from the fixed step counter.' },
  { object: 'crypto', property: 'getRandomValues', message: 'Use the seeded PRNG in src/sim/core/rng.ts.' },
  { object: 'crypto', property: 'randomUUID', message: 'Use the seeded PRNG in src/sim/core/rng.ts.' },
];

// Step code uses only + − × ÷, sqrt, abs, min, max and floor; trigonometry goes through detTrig
// (CLAUDE.md rule 4, docs/M1-plan.md D27).
const NON_DETERMINISTIC_MATH = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'pow',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'cbrt',
  'hypot',
].map((property) => ({
  object: 'Math',
  property,
  message: `Math.${property} is not correctly rounded across engines; use src/sim/math/detTrig.ts or plain arithmetic.`,
}));

const NO_EXPONENT_OPERATOR = [
  {
    selector: "BinaryExpression[operator='**']",
    message: 'The ** operator calls pow; multiply instead (CLAUDE.md rule 4).',
  },
  {
    selector: "AssignmentExpression[operator='**=']",
    message: 'The **= operator calls pow; multiply instead (CLAUDE.md rule 4).',
  },
];

// no-magic-numbers lets a number through when it initializes a variable, so such numbers are banned here too:
// they belong in /data, data/tuning or src/sim/core (golden rule 3).
const NO_NUMERIC_CONSTANTS = [
  {
    selector: 'VariableDeclarator > Literal.init[raw=/^(?!(?:0|1|2|0\\.5)$)\\d/]',
    message: 'Numbers in src/sim come from /data, data/tuning or src/sim/core (golden rule 3).',
  },
  {
    selector: "VariableDeclarator > UnaryExpression.init[operator='-'] > Literal[raw!='1']",
    message: 'Numbers in src/sim come from /data, data/tuning or src/sim/core (golden rule 3).',
  },
];

const NODE_ONLY = {
  group: ['node:*', 'fs', 'fs/*', 'path', 'os', 'child_process', 'url', 'module', 'worker_threads'],
  message: 'src/ runs in the browser; Node APIs belong in scripts/ (spec 01 §2).',
};
const UI_LIBRARIES = {
  group: ['three', 'three/*', 'react', 'react/*', 'react-dom', 'react-dom/*', 'zustand', 'zustand/*'],
  message: 'Pure code may not use rendering or UI libraries (CLAUDE.md rule 4).',
};
const APP_LAYERS = {
  group: [
    '**/app/**',
    '**/ui/**',
    '**/state/**',
    '**/render/**',
    '**/audio/**',
    '**/input/sources/**',
    '**/input/rumble',
    '**/worker/physics.worker',
    '**/worker/client',
  ],
  message: 'Pure code may not depend on the app, UI, rendering, audio or I/O layers (spec 01 §2).',
};
const NOT_FROM_SIM = {
  group: ['**/input/**', '**/worker/**'],
  message: 'src/sim never imports src/input or src/worker (docs/M1-plan.md D6).',
};
const DATA_LAYER_VALUES = {
  group: ['**/data/**'],
  allowTypeImports: true,
  message: 'src/sim receives plain data at load; it imports only types from src/data (spec 01 §2).',
};

const MAGIC_NUMBERS = [
  'error',
  {
    ignore: [-1, 0, 0.5, 1, 2],
    ignoreArrayIndexes: true,
    ignoreDefaultValues: false,
    ignoreClassFieldInitialValues: false,
    detectObjects: true,
    ignoreEnums: false,
    ignoreNumericLiteralTypes: true,
    ignoreReadonlyClassProperties: false,
    ignoreTypeIndexes: true,
  },
];

export default defineConfig(
  globalIgnores([
    'dist/',
    'coverage/',
    'playwright-report/',
    'test-results/',
    'blob-report/',
    'data/',
    'spec/',
    'prompts/',
    'docs/',
    'tests/fixtures/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: { '@typescript-eslint/no-restricted-imports': ['error', { patterns: [NODE_ONLY] }] },
  },
  { files: ['src/**/*.tsx'], extends: [reactHooks.configs.flat['recommended-latest']] },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: PURE_FILES,
    rules: {
      'no-restricted-globals': ['error', ...IMPURE_GLOBALS],
      'no-restricted-properties': ['error', ...IMPURE_PROPERTIES],
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [NODE_ONLY, UI_LIBRARIES, APP_LAYERS] },
      ],
    },
  },
  {
    files: [...SIM_FILES, 'src/worker/session.ts'],
    rules: {
      'no-restricted-properties': ['error', ...IMPURE_PROPERTIES, ...NON_DETERMINISTIC_MATH],
      'no-restricted-syntax': ['error', ...NO_EXPONENT_OPERATOR],
    },
  },
  {
    files: SIM_FILES,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [NODE_ONLY, UI_LIBRARIES, APP_LAYERS, NOT_FROM_SIM, DATA_LAYER_VALUES] },
      ],
    },
  },
  {
    files: SIM_FILES,
    ignores: SIM_CONSTANT_FILES,
    rules: {
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-magic-numbers': MAGIC_NUMBERS,
      'no-restricted-syntax': ['error', ...NO_EXPONENT_OPERATOR, ...NO_NUMERIC_CONSTANTS],
    },
  },
  prettierConfig,
);
