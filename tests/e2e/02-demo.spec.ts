import { expect, expectedBackend, numberAttribute, test } from './fixtures';

// End-to-end test 2 (prompts/M1-foundations.md §8): "Watch a demo" → sandbox-c-left finishes within 180 s; the HUD
// shows "Tip in: left daughter" for the wire and the catheter at least 20 mm past the carina (read from a data
// attribute, docs/M1-plan.md D25); the renderer backend is reported; no console errors.

const DEMO_BUDGET_MS = 180_000;

test('the sandbox-c-left demo selects the left branch and the catheter follows', async ({
  page,
  openApp,
  forceWebGL,
}) => {
  test.setTimeout(DEMO_BUDGET_MS + 30_000);
  await openApp();
  await page.getByTestId('watch-demo').click();
  await page.getByTestId('demo-sandbox-c-left').click();
  await expect(page.getByTestId('demo-badge')).toBeVisible();

  const started = Date.now();
  await expect(page.getByTestId('toast-success')).toContainText('Demo finished', { timeout: DEMO_BUDGET_MS });
  await expect(page.getByTestId('demo-badge')).toBeHidden();
  expect(Date.now() - started).toBeLessThan(DEMO_BUDGET_MS);

  await expect(page.getByTestId('tip-in-wire')).toHaveText('Tip in: left daughter');
  const pastCarina = await numberAttribute(page, 'device-catheter', 'data-past-carina-mm');
  expect(pastCarina).toBeGreaterThanOrEqual(20);
  await expect(page.getByTestId('tip-in-catheter')).toHaveText('Tip in: left daughter');

  await expect(page.getByTestId('backend')).toHaveText(await expectedBackend(page, forceWebGL));
  // The monitor holds the last fluoro image the demo took.
  await expect(page.getByTestId('fluoro-state')).toHaveText('LIH');
});
