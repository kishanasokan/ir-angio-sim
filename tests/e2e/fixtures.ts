import { expect, test as base, type Page } from '@playwright/test';

/**
 * Shared end-to-end fixtures (prompts/M1-foundations.md §8):
 *
 * - every test fails on any console error or uncaught page error, from the first test on;
 * - `openApp` loads the app with ?fast=1, and with ?webgl=1 in the webgl2 project;
 * - in the webgpu project, a shim drops the identity texture-view swizzle that three.js sends, which Chromium
 *   releases before about 142 reject with a TypeError. It changes nothing on newer Chromium. Without it, the app
 *   would fall back to WebGL 2 on such a browser (src/render/renderer.ts), so the WebGPU path would go untested.
 */

/** Per-project options: the webgl2 project forces WebGL 2. */
export interface E2EOptions {
  readonly forceWebGL: boolean;
}

interface Fixtures {
  readonly consoleErrors: string[];
  readonly openApp: (path?: string) => Promise<void>;
}

function swizzleShim(): void {
  const gpu = (
    globalThis as { GPUTexture?: { prototype: { createView: (descriptor?: unknown) => unknown } } }
  ).GPUTexture;
  if (gpu === undefined) {
    return;
  }
  const createView = gpu.prototype.createView;
  gpu.prototype.createView = function (this: unknown, descriptor?: unknown) {
    if (typeof descriptor === 'object' && descriptor !== null && 'swizzle' in descriptor) {
      const { swizzle, ...rest } = descriptor;
      if (swizzle === 'rgba') {
        return createView.call(this, rest);
      }
    }
    return createView.call(this, descriptor);
  };
}

export const test = base.extend<Fixtures, E2EOptions>({
  forceWebGL: [false, { option: true, scope: 'worker' }],
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(message.text());
        }
      });
      page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
  openApp: async ({ page, forceWebGL }, use, testInfo) => {
    if (testInfo.project.name === 'webgpu') {
      await page.addInitScript(swizzleShim);
    }
    await use(async (path = '/') => {
      const query = `fast=1${forceWebGL ? '&webgl=1' : ''}`;
      await page.goto(`${path}${path.includes('?') ? '&' : '?'}${query}`);
    });
  },
});

export { expect };

/** The backend this browser should end up on: WebGL 2 when forced or when WebGPU has no adapter. */
export async function expectedBackend(page: Page, forceWebGL: boolean): Promise<'WebGPU' | 'WebGL 2'> {
  if (forceWebGL) {
    return 'WebGL 2';
  }
  const adapter = await page.evaluate(async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return gpu === undefined ? false : (await gpu.requestAdapter()) !== null;
  });
  return adapter ? 'WebGPU' : 'WebGL 2';
}

/** Goes from the start screen through setup to the sandbox with the default choices. */
export async function enterSandbox(page: Page): Promise<void> {
  await page.getByTestId('enter-sandbox').click();
  await page.getByTestId('setup-start').click();
  await expect(page.getByTestId('device-wire')).toBeVisible();
}

/** A number from a data attribute. */
export async function numberAttribute(page: Page, testId: string, attribute: string): Promise<number> {
  const value = await page.getByTestId(testId).getAttribute(attribute);
  return Number(value);
}
