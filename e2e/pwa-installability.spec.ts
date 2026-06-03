import { test, expect } from '@playwright/test';

type InstallabilityError = {
  errorId: string;
  errorArguments: Array<{ name: string; value: string }>;
};

// Playwright runs in an isolated context that Chrome identifies as incognito.
// That prevents install prompts in the browser UI but is not a configuration
// defect — filter it so the test focuses on real PWA setup errors.
const TEST_ENV_ERRORS = new Set(['in-incognito']);

test('PWA is installable by Chrome', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const client = await context.newCDPSession(page);
  const { installabilityErrors } = await client.send(
    'Page.getInstallabilityErrors',
  ) as { installabilityErrors: InstallabilityError[] };

  const configErrors = installabilityErrors.filter((e) => !TEST_ENV_ERRORS.has(e.errorId));

  expect(
    configErrors.map((e) => e.errorId),
    `PWA has installability errors: ${installabilityErrors.map((e) => e.errorId).join(', ')}`,
  ).toEqual([]);
});
