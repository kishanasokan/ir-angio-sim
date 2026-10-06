import { PAD_AXES, PAD_BUTTONS } from '../../src/sim/core/records';
import { installFakeGamepad, setAxis, setButton } from './fakeGamepad';
import { expect, numberAttribute, test } from './fixtures';

// The three-device stack (prompts/M2-core-systems.md §1.7, §6): setup offers a catheter, microcatheter and microwire,
// checks each pairing (a 0.035 in wire is blocked in the microcatheter, with the rule's message), and the sandbox
// shows three devices in the HUD. The sticks drive the innermost pair first; the D-pad moves the pair outward, so
// the right stick then advances the microcatheter.

test('the three-device stack starts, shows three devices and the D-pad moves the active pair', async ({
  page,
  openApp,
}) => {
  await installFakeGamepad(page);
  await openApp();
  await page.getByTestId('enter-sandbox').click();
  await page.getByTestId('setup-stack-catheter-microcatheter-microwire').click();
  await expect(page.getByTestId('setup-fixed-rm-cobra-c2-5f-65')).toBeVisible();
  await expect(page.getByTestId('setup-fixed-rm-progreat-2.4-130')).toBeVisible();

  // A 0.035 in guidewire will not pass the microcatheter.
  await page.getByTestId('setup-wire-rm-glidewire-035-angled-150').click();
  const check = page.getByTestId('check-fit-wire-microcatheter');
  await expect(check).toHaveAttribute('data-status', 'block');
  await expect(check).toContainText('This wire is too large for the microcatheter.');
  await expect(page.getByTestId('setup-start')).toBeDisabled();

  await page.getByTestId('setup-wire-rm-gt-016-angled-180').click();
  await expect(page.getByTestId('setup-start')).toBeEnabled();
  await page.getByTestId('setup-start').click();

  const catheter = page.getByTestId('device-catheter');
  const micro = page.getByTestId('device-microcatheter');
  const wire = page.getByTestId('device-wire');
  await expect(catheter).toHaveAttribute('data-rod-model', 'rm-cobra-c2-5f-65');
  await expect(micro).toHaveAttribute('data-rod-model', 'rm-progreat-2.4-130');
  await expect(wire).toHaveAttribute('data-rod-model', 'rm-gt-016-angled-180');
  await expect(micro).toHaveAttribute('data-stick', 'left');
  await expect(wire).toHaveAttribute('data-stick', 'right');

  // D-pad up moves the pair outward; held until the HUD shows it, as one press edge (see end-to-end test 3).
  await setButton(page, PAD_BUTTONS.up, 1);
  await expect(catheter).toHaveAttribute('data-stick', 'left', { timeout: 30_000 });
  await setButton(page, PAD_BUTTONS.up, 0);
  await expect(micro).toHaveAttribute('data-stick', 'right');
  await expect(wire).toHaveAttribute('data-stick', '');

  // The right stick now drives the microcatheter.
  const before = await numberAttribute(page, 'device-microcatheter', 'data-depth-mm');
  await setAxis(page, PAD_AXES.rightY, -1);
  await expect
    .poll(() => numberAttribute(page, 'device-microcatheter', 'data-depth-mm'), { timeout: 30_000 })
    .toBeGreaterThan(before + 2);
  await setAxis(page, PAD_AXES.rightY, 0);
});
