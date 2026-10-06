import { DISCLAIMER } from '../../src/app/disclaimer';
import { expect, test } from './fixtures';

// End-to-end test 1 (prompts/M1-foundations.md §8): the start screen shows the exact disclaimer, and nothing logs a
// console error on load (the guard in fixtures.ts).

test('the start screen shows the exact disclaimer with no console errors', async ({ page, openApp }) => {
  await openApp();
  await expect(page.getByTestId('disclaimer')).toHaveText(DISCLAIMER);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('IR Angio Suite Simulator');
  await expect(page.getByTestId('enter-sandbox')).toBeVisible();
  await expect(page.getByTestId('watch-demo')).toBeVisible();
  // Firefox shows a pad only after a press, so the screen asks for one.
  await expect(page.getByTestId('pad-status')).toHaveText('Press any button on your controller');
});
