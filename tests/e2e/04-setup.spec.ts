import { expect, test } from './fixtures';

// End-to-end test 4 (prompts/M1-foundations.md §8): sandbox setup with a 4F sheath and the 5F catheter shows the
// fit-catheter-sheath message with its source and does not start (CLAUDE.md rule 7).

test('a 4F sheath with the 5F catheter is blocked with the rule message and source', async ({
  page,
  openApp,
}) => {
  await openApp();
  await page.getByTestId('enter-sandbox').click();
  await expect(page.getByTestId('setup-start')).toBeEnabled();

  await page.getByTestId('setup-sheath-4').click();
  const check = page.getByTestId('check-fit-catheter-sheath');
  await expect(check).toHaveAttribute('data-status', 'block');
  await expect(check).toContainText('This catheter will not enter the sheath valve.');
  await expect(check).toContainText('Radiology Key');
  await expect(page.getByTestId('setup-start')).toBeDisabled();
  await expect(page.getByTestId('setup-blocked')).toBeVisible();

  // A disabled Start does nothing, even when clicked.
  await page.getByTestId('setup-start').click({ force: true });
  await expect(page.getByTestId('sandbox')).toHaveCount(0);

  // A 5F sheath clears it.
  await page.getByTestId('setup-sheath-5').click();
  await expect(page.getByTestId('check-fit-catheter-sheath')).toHaveCount(0);
  await expect(page.getByTestId('setup-start')).toBeEnabled();
});
