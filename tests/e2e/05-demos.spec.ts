import type { Page } from '@playwright/test';
import { expect, numberAttribute, test } from './fixtures';

// The gate's demo check (prompts/M1-foundations.md "Done when"; prompts/M1-sessions.md session 6): the other two
// autopilot scripts run start to finish with no console errors (sandbox-c-left is end-to-end test 2).
// sandbox-b-bend ends with the wire tip withdrawn behind the catheter tip, so the catheter's curve can re-form.
// sandbox-a-buckle drives the resistance meter into its red band, and the buckled wire stays on screen afterwards;
// the test switches to the 3D view and attaches a screenshot of it.

const DEMO_BUDGET_MS = 180_000;

async function watchDemo(page: Page, id: string): Promise<void> {
  await page.getByTestId('watch-demo').click();
  await page.getByTestId(`demo-${id}`).click();
  await expect(page.getByTestId('demo-badge')).toBeVisible();
}

async function demoFinished(page: Page): Promise<void> {
  await expect(page.getByTestId('toast-success')).toContainText('Demo finished', { timeout: DEMO_BUDGET_MS });
  await expect(page.getByTestId('demo-badge')).toBeHidden();
}

test('the sandbox-b-bend demo finishes with the wire withdrawn behind the catheter tip', async ({
  page,
  openApp,
}) => {
  test.setTimeout(DEMO_BUDGET_MS + 30_000);
  await openApp();
  await watchDemo(page, 'sandbox-b-bend');
  await demoFinished(page);

  const wire = await numberAttribute(page, 'device-wire', 'data-depth-mm');
  const catheter = await numberAttribute(page, 'device-catheter', 'data-depth-mm');
  expect(wire).toBeLessThan(catheter);
});

test('the sandbox-a-buckle demo buckles the wire and turns the resistance meter red', async ({
  page,
  openApp,
}, testInfo) => {
  test.setTimeout(DEMO_BUDGET_MS + 30_000);
  await openApp();
  await watchDemo(page, 'sandbox-a-buckle');
  await expect(page.getByTestId('resistance')).toHaveAttribute('data-level', 'danger', {
    timeout: DEMO_BUDGET_MS,
  });
  await demoFinished(page);

  // The demo leaves the hub pushed, so the wire stays buckled against the cap. G shows it in the 3D view; the key
  // press would hand control back to the learner, which is why it waits until the demo is over.
  await page.keyboard.press('g');
  await expect(page.getByTestId('monitor')).toHaveAttribute('data-view', '3d');
  await testInfo.attach('sandbox-a-buckle in the 3D view', {
    body: await page.getByTestId('monitor').screenshot(),
    contentType: 'image/png',
  });
});
