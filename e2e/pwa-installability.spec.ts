import { test, expect, type Page } from '@playwright/test';

type InstallabilityError = {
  errorId: string;
  errorArguments: Array<{ name: string; value: string }>;
};

// Playwright runs in an isolated context that Chrome identifies as incognito.
// That prevents install prompts in the browser UI but is not a configuration
// defect — filter it so the test focuses on real PWA setup errors.
const TEST_ENV_ERRORS = new Set(['in-incognito']);

async function checkPrerequisites(page: Page): Promise<void> {
  // .href on HTMLLinkElement is always absolute, so we get a fully-resolved URL.
  const manifestHref = await page.evaluate(() =>
    document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? null,
  );
  expect(manifestHref, 'Page must include <link rel="manifest">').not.toBeNull();

  const manifestResponse = await page.request.get(manifestHref!);
  expect(manifestResponse.status(), 'Manifest must return HTTP 200').toBe(200);

  const manifest = await manifestResponse.json() as {
    name?: string;
    start_url?: string;
    display?: string;
    icons?: Array<{ src: string; sizes?: string }>;
  };
  expect(manifest.name, 'Manifest must have name').toBeTruthy();
  expect(manifest.start_url, 'Manifest must have start_url').toBeTruthy();
  expect(manifest.display, 'Manifest must have display').toBeTruthy();

  const hasLargeIcon = (manifest.icons ?? []).some((icon) =>
    (icon.sizes ?? '').split(' ').some((s) => {
      const [w] = s.split('x').map(Number);
      return w >= 192;
    }),
  );
  expect(hasLargeIcon, 'Manifest must have an icon with sizes >= 192').toBe(true);

  // Resolve icon srcs against the manifest URL so we test the actual server-delivered URLs.
  const manifestUrl = new URL(manifestHref!);
  for (const icon of manifest.icons ?? []) {
    const iconUrl = new URL(icon.src, manifestUrl).toString();
    const iconResponse = await page.request.get(iconUrl);
    expect(iconResponse.status(), `Icon ${icon.src} must return HTTP 200`).toBe(200);
    const contentType = iconResponse.headers()['content-type'] ?? '';
    expect(contentType, `Icon ${icon.src} must have content-type image/png`).toContain('image/png');
  }
}

test('PWA prerequisites are met', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'Firefox does not support PWAs');

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await checkPrerequisites(page);
});

test('PWA is installable by Chrome', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP installability check is Chromium-only');

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
