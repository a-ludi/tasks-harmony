import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('nginx sync-location.conf.template security', () => {
  const config = readFileSync(
    join(import.meta.dir, '../nginx/sync-location.conf.template'),
    'utf-8'
  );

  it('has a rate-limited location block for /sync/session', () => {
    expect(config).toContain('location = /sync/session');
  });

  it('applies rate limiting to /sync/session', () => {
    const sessionBlockMatch = config.match(/location = \/sync\/session \{[^}]+\}/s);
    expect(sessionBlockMatch).not.toBeNull();
    expect(sessionBlockMatch![0]).toContain('limit_req');
  });

  it('/sync/session location appears before the catch-all /sync/', () => {
    const sessionIdx = config.indexOf('location = /sync/session');
    // The catch-all block starts with 'location /sync/ {' (with a space and brace)
    const catchallIdx = config.indexOf('location /sync/ {');
    expect(sessionIdx).toBeGreaterThanOrEqual(0);
    expect(sessionIdx).toBeLessThan(catchallIdx);
  });

  it('documents the sync_session rate limit zone', () => {
    expect(config).toContain('sync_session');
  });
});
