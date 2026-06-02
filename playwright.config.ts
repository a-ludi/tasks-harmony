import { defineConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

function findHeadlessShell(): string | undefined {
  const cacheHome = process.env.XDG_CACHE_HOME ?? path.join(process.env.HOME ?? '/root', '.cache');
  const base = path.join(cacheHome, 'ms-playwright');
  if (!fs.existsSync(base)) return undefined;
  const dirs = fs.readdirSync(base)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort();
  if (dirs.length === 0) return undefined;
  const candidate = path.join(
    base, dirs.at(-1)!, 'chrome-headless-shell-linux64', 'chrome-headless-shell',
  );
  return fs.existsSync(candidate) ? candidate : undefined;
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? findHeadlessShell(),
      chromiumSandbox: false,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox'],
    },
  },
});
