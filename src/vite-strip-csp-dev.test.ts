import { describe, it, expect } from 'bun:test';
import { stripCspMetaTag } from './vite-strip-csp-dev';

describe('stripCspMetaTag', () => {
  it('removes the CSP meta tag', () => {
    const html =
      '<head><meta http-equiv="Content-Security-Policy" content="script-src \'self\'"></head>';
    expect(stripCspMetaTag(html)).not.toContain('Content-Security-Policy');
  });

  it('is a no-op when no CSP tag is present', () => {
    const html = '<head><meta charset="UTF-8"></head>';
    expect(stripCspMetaTag(html)).toBe(html);
  });

  it('preserves surrounding HTML', () => {
    const html =
      '<head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="x"><title>Test</title></head>';
    const result = stripCspMetaTag(html);
    expect(result).toContain('<meta charset="UTF-8">');
    expect(result).toContain('<title>Test</title>');
    expect(result).not.toContain('Content-Security-Policy');
  });

  it('handles single-quoted http-equiv attribute', () => {
    const html = "<meta http-equiv='Content-Security-Policy' content='x'>";
    expect(stripCspMetaTag(html)).not.toContain('Content-Security-Policy');
  });
});
