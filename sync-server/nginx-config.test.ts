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

  it('DEPLOYMENT.md documents all rate-limit zones used in the template', () => {
    const deploymentMd = readFileSync(
      join(import.meta.dir, '../docs/DEPLOYMENT.md'),
      'utf-8'
    );
    const zoneRefs = [...config.matchAll(/limit_req zone=(\S+)/g)].map(m => m[1]);
    expect(zoneRefs.length).toBeGreaterThan(0);
    for (const zone of zoneRefs) {
      expect(deploymentMd).toContain(`zone=${zone}`);
    }
  });

  it('catch-all /sync/ location block includes a rate limit', () => {
    const catchallMatch = config.match(/location \/sync\/ \{[^}]+\}/s);
    expect(catchallMatch).not.toBeNull();
    expect(catchallMatch![0]).toContain('limit_req');
  });

  it('suppresses access logging inside the syncToken-carrying location block to prevent token leakage into nginx access logs', () => {
    // The block matched by 'location ~ "^/sync/[a-f0-9]{64}$"' carries the syncToken
    // verbatim in the URL path. Without 'access_log off;' inside this block, nginx's
    // default combined log format writes the full URL (including the token) to
    // /var/log/nginx/access.log on every GET/PUT. See SEC-000028.
    const tokenBlockMatch = config.match(
      /location ~ "\^\/sync\/\[a-f0-9\]\{64\}\$" \{[^}]+\}/s,
    );
    expect(tokenBlockMatch).not.toBeNull();
    expect(tokenBlockMatch![0]).toContain('access_log off;');
  });
});
