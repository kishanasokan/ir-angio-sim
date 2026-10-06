import type { Page } from '@playwright/test';

/**
 * A fake standard-mapping gamepad (prompts/M1-foundations.md §8, test 3): an init script replaces
 * navigator.getGamepads before the app loads, and the test moves its sticks and presses its buttons. The app reads it
 * through the same gamepad source, mapper and worker as a real pad.
 */

interface FakePadState {
  axes: number[];
  buttons: number[];
}

declare global {
  interface Window {
    __fakePad?: FakePadState;
  }
}

const BUTTONS = 17;
const AXES = 4;

export async function installFakeGamepad(page: Page): Promise<void> {
  await page.addInitScript(
    ({ buttons, axes }) => {
      const state = { axes: new Array<number>(axes).fill(0), buttons: new Array<number>(buttons).fill(0) };
      window.__fakePad = state;
      const pad = () => ({
        id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
        index: 0,
        connected: true,
        mapping: 'standard',
        timestamp: performance.now(),
        axes: [...state.axes],
        buttons: state.buttons.map((value) => ({ value, pressed: value >= 0.5, touched: value > 0 })),
        vibrationActuator: null,
      });
      Object.defineProperty(navigator, 'getGamepads', {
        value: () => [pad(), null, null, null],
        configurable: true,
      });
    },
    { buttons: BUTTONS, axes: AXES },
  );
}

export async function setAxis(page: Page, index: number, value: number): Promise<void> {
  await page.evaluate(
    ([i, v]) => {
      if (window.__fakePad !== undefined) {
        window.__fakePad.axes[i] = v;
      }
    },
    [index, value] as const,
  );
}

export async function setButton(page: Page, index: number, value: number): Promise<void> {
  await page.evaluate(
    ([i, v]) => {
      if (window.__fakePad !== undefined) {
        window.__fakePad.buttons[i] = v;
      }
    },
    [index, value] as const,
  );
}

/** Presses and releases a button, held long enough for several animation frames to see it. */
export async function tapButton(page: Page, index: number, holdMs = 250): Promise<void> {
  await setButton(page, index, 1);
  await page.waitForTimeout(holdMs);
  await setButton(page, index, 0);
}
