import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('sync-server Dockerfile security', () => {
  const dockerfile = readFileSync(join(import.meta.dir, 'Dockerfile'), 'utf8');

  it('contains a USER directive', () => {
    expect(dockerfile).toMatch(/^USER\s+\S+/m);
  });

  it('does not run as root', () => {
    const userMatches = [...dockerfile.matchAll(/^USER\s+(\S+)/gm)];
    expect(userMatches.length).toBeGreaterThan(0);
    for (const match of userMatches) {
      expect(match[1]).not.toBe('root');
      expect(match[1]).not.toBe('0');
    }
  });

  it('.dockerignore excludes sensitive files from the build context', () => {
    const dockerignore = readFileSync(join(import.meta.dir, '.dockerignore'), 'utf8');
    expect(dockerignore).toMatch('.env*');
    expect(dockerignore).toMatch('.dev-sync-data');
    expect(dockerignore).toMatch('node_modules');
  });

  it('sets NODE_ENV=production to disable Bun dev-mode error pages', () => {
    expect(dockerfile).toMatch(/^ENV\s+NODE_ENV=production$/m);
  });
});
