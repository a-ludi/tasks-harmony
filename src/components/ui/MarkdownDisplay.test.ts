import { describe, it, expect } from 'bun:test';
import { safeHref, sanitizeMarkdownLinks } from './MarkdownDisplay';

describe('MarkdownDisplay - sanitizeMarkdownLinks (SEC-000019)', () => {
  it('strips javascript: URLs from rendered links', () => {
    const input = '[click me](javascript:alert(1))';
    const output = sanitizeMarkdownLinks(input);
    // Extract the URL from [text](URL) form and verify it is not a javascript: URL.
    const urlMatch = output.match(/\]\(([^)]*)\)/);
    expect(urlMatch).not.toBeNull();
    const url = (urlMatch![1] ?? '').toLowerCase().trim();
    expect(url.startsWith('javascript:')).toBe(false);
    expect(url.startsWith('data:')).toBe(false);
    expect(url.startsWith('vbscript:')).toBe(false);
  });

  it('blocks data: URLs', () => {
    expect(sanitizeMarkdownLinks('[x](data:text/html,<script>1</script>)'))
      .toBe('[x](about:blank#blocked)');
  });

  it('blocks vbscript: URLs', () => {
    expect(sanitizeMarkdownLinks('[x](vbscript:msgbox("x"))'))
      .toBe('[x](about:blank#blocked)');
  });

  it('blocks case-variant javascript: (JavaScript:, JAVASCRIPT:)', () => {
    expect(sanitizeMarkdownLinks('[x](JavaScript:alert(1))'))
      .toBe('[x](about:blank#blocked)');
    expect(sanitizeMarkdownLinks('[x](JAVASCRIPT:alert(1))'))
      .toBe('[x](about:blank#blocked)');
  });

  it('blocks whitespace/control-char smuggling in scheme', () => {
    // Tab or newline inside "javascript" is a classic bypass — real browsers strip
    // these before scheme detection, so we must too.
    expect(sanitizeMarkdownLinks('[x](java\tscript:alert(1))'))
      .toBe('[x](about:blank#blocked)');
    expect(sanitizeMarkdownLinks('[x](java\nscript:alert(1))'))
      .toBe('[x](about:blank#blocked)');
  });

  it('blocks javascript: inside autolinks', () => {
    expect(sanitizeMarkdownLinks('<javascript:alert(1)>'))
      .toBe('<about:blank#blocked>');
  });

  it('blocks javascript: inside reference-style link definitions', () => {
    expect(sanitizeMarkdownLinks('[id]: javascript:alert(1)'))
      .toBe('[id]: about:blank#blocked');
  });

  it('leaves https: URLs untouched', () => {
    expect(sanitizeMarkdownLinks('[x](https://example.com/path?a=1#f)'))
      .toBe('[x](https://example.com/path?a=1#f)');
  });

  it('leaves http: URLs untouched', () => {
    expect(sanitizeMarkdownLinks('[x](http://example.com)'))
      .toBe('[x](http://example.com)');
  });

  it('leaves mailto: URLs untouched', () => {
    expect(sanitizeMarkdownLinks('[x](mailto:a@b.c)'))
      .toBe('[x](mailto:a@b.c)');
  });

  it('leaves relative URLs untouched (/, #, ?)', () => {
    expect(sanitizeMarkdownLinks('[x](/relative)')).toBe('[x](/relative)');
    expect(sanitizeMarkdownLinks('[x](#anchor)')).toBe('[x](#anchor)');
    expect(sanitizeMarkdownLinks('[x](?query)')).toBe('[x](?query)');
  });

  it('leaves plain markdown without links unchanged', () => {
    const md = '# Title\n\nA paragraph with **bold** and _italic_.';
    expect(sanitizeMarkdownLinks(md)).toBe(md);
  });
});

describe('safeHref', () => {
  it('returns the original URL for http(s), mailto, and relative URLs', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeHref('/relative')).toBe('/relative');
    expect(safeHref('#anchor')).toBe('#anchor');
    expect(safeHref('?q=1')).toBe('?q=1');
    expect(safeHref('relative/path')).toBe('relative/path');
  });

  it('returns about:blank#blocked for javascript:, data:, vbscript:, file:, and unknown schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBe('about:blank#blocked');
    expect(safeHref('data:text/html,x')).toBe('about:blank#blocked');
    expect(safeHref('vbscript:msgbox')).toBe('about:blank#blocked');
    expect(safeHref('file:///etc/passwd')).toBe('about:blank#blocked');
    expect(safeHref('chrome://settings')).toBe('about:blank#blocked');
  });

  it('handles empty and whitespace-only input', () => {
    expect(safeHref('')).toBe('about:blank#blocked');
    expect(safeHref('   ')).toBe('about:blank#blocked');
  });
});
