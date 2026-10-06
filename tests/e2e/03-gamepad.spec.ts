import { PAD_AXES, PAD_BUTTONS } from '../../src/sim/core/records';
import { installFakeGamepad, setAxis, setButton, tapButton } from './fakeGamepad';
import { enterSandbox, expect, numberAttribute, test } from './fixtures';

// End-to-end test 3 (prompts/M1-foundations.md §8): a fake gamepad injected with page.addInitScript. Holding the right
// stick up increases the wire's insertion depth in the HUD; pressing Y shows CONTROL; holding RT changes the LAO
// readout.

test('a gamepad drives the wire, switches to Control mode and swings the C-arm', async ({
  page,
  openApp,
}) => {
  await installFakeGamepad(page);
  await openApp();
  await enterSandbox(page);
  await expect(page.getByTestId('mode')).toHaveText('CATH');

  // Right stick up: advance the inner device (the wire). The Gamepad API reports up as negative.
  const before = await numberAttribute(page, 'device-wire', 'data-depth-mm');
  await setAxis(page, PAD_AXES.rightY, -1);
  await expect
    .poll(() => numberAttribute(page, 'device-wire', 'data-depth-mm'), { timeout: 30_000 })
    .toBeGreaterThan(before + 5);
  await setAxis(page, PAD_AXES.rightY, 0);
  // A stick is not a button press: the HUD still asks for one (Firefox exposes a pad only after a press).
  await expect(page.getByTestId('pad-status')).toHaveText('Press any button on your controller');

  // Y switches to Control mode, and the pad now counts as connected, with Xbox glyphs from its id.
  await tapButton(page, PAD_BUTTONS.y);
  await expect(page.getByTestId('mode')).toHaveText('CONTROL');
  await expect(page.getByTestId('pad-status')).toHaveText('Xbox-style controller connected');

  // RT rotates the C-arm toward LAO.
  await expect(page.getByTestId('carm-angles')).toHaveText('LAO 0 CRA 0');
  await setButton(page, PAD_BUTTONS.rt, 1);
  await expect
    .poll(() => numberAttribute(page, 'carm-angles', 'data-rotation-deg'), { timeout: 30_000 })
    .toBeGreaterThan(1);
  await setButton(page, PAD_BUTTONS.rt, 0);
  await expect(page.getByTestId('carm-angles')).toHaveText(/^LAO [1-9]\d* CRA 0$/);
});
