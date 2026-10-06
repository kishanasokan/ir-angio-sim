import type { Page } from '@playwright/test';
import { enterSandbox, expect, test } from './fixtures';

// The sandbox's panels, one end-to-end check per screen flow (CLAUDE.md rule 8; added at the M1 gate after the
// independent review): the device inspector (I), the perf overlay (P), the pause menu (Esc: resume, change phantom,
// quit) and the device picker's wire exchange (B, then swap-device).

/** Time for a swap: the engine withdraws the wire at full speed, then feeds the new one to the catheter tip. */
const SWAP_BUDGET_MS = 60_000;

/**
 * Lets two animation frames pass. Input is polled once per frame and acts on press edges, so a key pressed again
 * before any poll has seen it released is not a new press. Headless software rendering runs near 10 fps, slow enough
 * for two quick test presses to land between the same two polls; a learner's double tap at 60 fps cannot.
 */
async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

test('the device inspector shows each tab with confidence badges and closes with back', async ({
  page,
  openApp,
}) => {
  await openApp();
  await enterSandbox(page);
  await page.keyboard.press('i');
  const inspector = page.getByTestId('device-inspector');
  await expect(inspector).toBeVisible();
  for (const tab of [
    'rm-berenstein-5f-65',
    'rm-glidewire-035-angled-150',
    'sheath',
    'phantom',
    'solver',
    'case',
  ]) {
    await expect(page.getByTestId(`inspector-tab-${tab}`)).toBeVisible();
  }
  // The Glidewire's floppy tip is still a placeholder, and placeholders carry their badge.
  await page.getByTestId('inspector-tab-rm-glidewire-035-angled-150').click();
  await expect(
    inspector.locator('[data-testid="inspector-row"][data-confidence="placeholder"]').first(),
  ).toBeVisible();
  await page.getByTestId('inspector-tab-case').click();
  await expect(inspector.getByText('Start, Glidewire: hub rotation')).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(inspector).toBeHidden();
});

test('the perf overlay toggles with P and reports the tier and the backend', async ({ page, openApp }) => {
  await openApp();
  await enterSandbox(page);
  const overlay = page.getByTestId('perf-overlay');
  await expect(overlay).toBeHidden();
  await page.keyboard.press('p');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByTestId('perf-tier')).toHaveText(/^(high|standard)$/);
  await expect(overlay.getByTestId('perf-backend')).toHaveText(/^(WebGPU|WebGL 2)$/);
  await expect(overlay.getByTestId('physics-ms')).toHaveText(/^\d+\.\d\d ms$/);
  await nextFrames(page);
  await page.keyboard.press('p');
  await expect(overlay).toBeHidden();
});

test('the pause menu resumes, changes the phantom and quits to the start screen', async ({
  page,
  openApp,
}) => {
  await openApp();
  await enterSandbox(page);
  const sandbox = page.getByTestId('sandbox');
  await expect(sandbox).toHaveAttribute('data-anatomy', 'phantom-c-bifurcation');
  const menu = page.getByTestId('pause-menu');

  await page.keyboard.press('Escape');
  await expect(menu).toBeVisible();
  await page.getByTestId('pause-resume').click();
  await expect(menu).toBeHidden();

  await nextFrames(page);
  await page.keyboard.press('Escape');
  await menu.getByRole('button', { name: 'Change phantom' }).click();
  await page.getByTestId('pause-phantom-phantom-a-straight').click();
  await expect(page.getByTestId('pause-phantom')).toBeHidden();
  await expect(sandbox).toHaveAttribute('data-anatomy', 'phantom-a-straight');

  await nextFrames(page);
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-quit').click();
  await expect(page.getByTestId('disclaimer')).toBeVisible();
  await expect(sandbox).toBeHidden();
});

test('the device picker exchanges the wire over the catheter', async ({ page, openApp }) => {
  test.setTimeout(SWAP_BUDGET_MS + 60_000);
  await openApp();
  await enterSandbox(page);
  const wire = page.getByTestId('device-wire');
  await expect(wire).toHaveAttribute('data-rod-model', 'rm-glidewire-035-angled-150');
  await page.keyboard.press('b');
  const picker = page.getByTestId('device-picker');
  await expect(picker).toBeVisible();
  // The wire in use cannot be picked again; the Bentson is compatible with the 5F catheter.
  await expect(page.getByTestId('pick-rm-glidewire-035-angled-150')).toBeDisabled();
  await page.getByTestId('pick-rm-bentson-035-145').click();
  await expect(picker).toBeHidden();
  await expect(wire).toHaveAttribute('data-rod-model', 'rm-bentson-035-145', { timeout: SWAP_BUDGET_MS });
});
