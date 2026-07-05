import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('docs-consistency: SYNC_APP_SECRET / VITE_SYNC_APP_SECRET cleanup', () => {
  const projectRoot = join(import.meta.dir, '..');
  const filesToCheck = [
    { path: 'docs/DEPLOYMENT.md', mustExist: true },
    { path: 'docker-compose.yml', mustExist: true },
    { path: 'README.md', mustExist: true },
    { path: '.env.local', mustExist: false },
    { path: 'sync-server/.env.local', mustExist: false },
  ];

  it('no live docs or config still reference the removed SYNC_APP_SECRET / VITE_SYNC_APP_SECRET', () => {
    for (const { path, mustExist } of filesToCheck) {
      const fullPath = join(projectRoot, path);
      const exists = existsSync(fullPath);

      if (!exists && !mustExist) {
        // File is optional and doesn't exist; skip
        continue;
      }

      if (!exists && mustExist) {
        throw new Error(`Expected file not found: ${path}`);
      }

      const content = readFileSync(fullPath, 'utf8');

      // Check that neither SYNC_APP_SECRET nor VITE_SYNC_APP_SECRET appear in the file
      expect(
        content,
        `File ${path} should not contain SYNC_APP_SECRET or VITE_SYNC_APP_SECRET`
      ).not.toMatch(/SYNC_APP_SECRET|VITE_SYNC_APP_SECRET/);
    }
  });

  it('historical planning docs in docs/superpowers/plans and docs/superpowers/specs are explicitly NOT checked', () => {
    // This test is purely documentary — it lists what we intentionally exclude
    const excludedDirs = [
      'docs/superpowers/plans',
      'docs/superpowers/specs',
    ];
    // These directories are deliberately NOT scanned for SECRET references;
    // they document the pre-SEC-000006 design and are load-bearing for CHANGELOG entries.
    expect(excludedDirs).toBeDefined();
  });
});
