import { defineConfig, devices } from '@playwright/test';
import type { E2EOptions } from './tests/e2e/fixtures';

/**
 * End-to-end tests (prompts/M1-foundations.md §8) run against the production preview (docs/M1-plan.md D23), in
 * Chromium, on both rendering backends:
 *
 * - `webgpu`: WebGPU on SwiftShader's software Vulkan, so it runs in headless CI without a GPU;
 * - `webgl2`: WebGL 2 forced with ?webgl=1, the fallback path.
 *
 * Both use SwiftShader for WebGL when no GPU is present (`--use-angle=swiftshader --enable-unsafe-swiftshader`).
 * PLAYWRIGHT_CHROMIUM_PATH points at a preinstalled Chromium when Playwright's own is not installed.
 */
const PORT = 4173;
const SWIFTSHADER_GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const SWIFTSHADER_WEBGPU = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-vulkan=swiftshader',
  '--use-webgpu-adapter=swiftshader',
];
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

const chromium = (args: readonly string[]) => ({
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 900 },
  launchOptions: { args: [...args], ...(executablePath === undefined ? {} : { executablePath }) },
});

export default defineConfig<E2EOptions>({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // The demo test sets its own 180 s budget (test 2).
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'webgpu', use: { ...chromium([...SWIFTSHADER_WEBGPU, ...SWIFTSHADER_GL]), forceWebGL: false } },
    { name: 'webgl2', use: { ...chromium(SWIFTSHADER_GL), forceWebGL: true } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
