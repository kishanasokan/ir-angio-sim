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

/** One playEffect call on the fake pad's actuator. */
export interface RumbleCall {
  readonly type: string;
  readonly strongMagnitude: number;
  readonly weakMagnitude: number;
  readonly duration: number;
}

declare global {
  interface Window {
    __fakePad?: FakePadState;
    __rumbleCalls?: RumbleCall[];
  }
}

const BUTTONS = 17;
const AXES = 4;

/** With `rumble`, the pad has a dual-rumble actuator that records every playEffect call in window.__rumbleCalls. */
export async function installFakeGamepad(
  page: Page,
  options: { readonly rumble?: boolean } = {},
): Promise<void> {
  await page.addInitScript(
    ({ buttons, axes, rumble }) => {
      const state = { axes: new Array<number>(axes).fill(0), buttons: new Array<number>(buttons).fill(0) };
      window.__fakePad = state;
      const calls: RumbleCall[] = [];
      window.__rumbleCalls = calls;
      const actuator = rumble
        ? {
            type: 'dual-rumble',
            playEffect: (type: string, params: Record<string, number>) => {
              calls.push({
                type,
                strongMagnitude: params.strongMagnitude ?? 0,
                weakMagnitude: params.weakMagnitude ?? 0,
                duration: params.duration ?? 0,
              });
              return Promise.resolve('complete');
            },
          }
        : null;
      const pad = () => ({
        id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
        index: 0,
        connected: true,
        mapping: 'standard',
        timestamp: performance.now(),
        axes: [...state.axes],
        buttons: state.buttons.map((value) => ({ value, pressed: value >= 0.5, touched: value > 0 })),
        vibrationActuator: actuator,
      });
      Object.defineProperty(navigator, 'getGamepads', {
        value: () => [pad(), null, null, null],
        configurable: true,
      });
    },
    { buttons: BUTTONS, axes: AXES, rumble: options.rumble ?? false },
  );
}

/** Every rumble effect the app has played on the fake pad so far. */
export async function rumbleCalls(page: Page): Promise<RumbleCall[]> {
  return page.evaluate(() => window.__rumbleCalls ?? []);
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
