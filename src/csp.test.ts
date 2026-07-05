import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Content-Security-Policy meta tag in index.html (SEC-000031)', () => {
  const html = readFileSync(
    join(import.meta.dir, '..', 'index.html'),
    'utf-8',
  );

  const metaMatch = html.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i,
  );

  it('emits a <meta http-equiv="Content-Security-Policy"> tag in <head>', () => {
    expect(metaMatch).not.toBeNull();
  });

  it('places the CSP meta tag inside <head> before any <script> tag', () => {
    expect(metaMatch).not.toBeNull();
    const headEnd = html.indexOf('</head>');
    const cspIdx = html.indexOf(metaMatch![0]);
    const firstScriptIdx = html.indexOf('<script');
    expect(cspIdx).toBeGreaterThan(-1);
    expect(cspIdx).toBeLessThan(headEnd);
    expect(cspIdx).toBeLessThan(firstScriptIdx);
  });

  describe('policy directives', () => {
    const policy = metaMatch?.[1] ?? '';

    it("sets default-src to 'self'", () => {
      expect(policy).toMatch(/(^|;)\s*default-src\s+'self'\s*(;|$)/);
    });

    it("restricts script-src to 'self' (no unsafe-inline, no unsafe-eval)", () => {
      expect(policy).toMatch(/(^|;)\s*script-src\s+'self'\s*(;|$)/);
      expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(policy).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    });

    it("allows style-src 'self' 'unsafe-inline' (Milkdown/Tailwind inline styles)", () => {
      expect(policy).toMatch(/(^|;)\s*style-src\s+'self'\s+'unsafe-inline'\s*(;|$)/);
    });

    it("allows img-src 'self' data: blob:", () => {
      expect(policy).toMatch(/(^|;)\s*img-src\s+'self'\s+data:\s+blob:\s*(;|$)/);
    });

    it("allows connect-src 'self' https: (covers /sync same-origin, VITE_SYNC_URL cross-origin, and CDP fetches to arbitrary https hosts)", () => {
      expect(policy).toMatch(/(^|;)\s*connect-src\s+'self'\s+https:\s*(;|$)/);
    });

    it("locks base-uri to 'self' (blocks <base> rewrite of relative /sync fetch)", () => {
      expect(policy).toMatch(/(^|;)\s*base-uri\s+'self'\s*(;|$)/);
    });

    it("locks form-action to 'self'", () => {
      expect(policy).toMatch(/(^|;)\s*form-action\s+'self'\s*(;|$)/);
    });

    it("sets object-src 'none'", () => {
      expect(policy).toMatch(/(^|;)\s*object-src\s+'none'\s*(;|$)/);
    });

    it("declares frame-ancestors 'none' (declarative intent even though browsers ignore in meta CSP)", () => {
      expect(policy).toMatch(/(^|;)\s*frame-ancestors\s+'none'\s*(;|$)/);
    });

    it("allows worker-src 'self' blob: (Workbox service worker)", () => {
      expect(policy).toMatch(/(^|;)\s*worker-src\s+'self'\s+blob:\s*(;|$)/);
    });
  });
});
