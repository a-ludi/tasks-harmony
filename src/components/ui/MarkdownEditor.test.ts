import { describe, it, expect } from 'bun:test';
import { sanitizeEditorValue } from './MarkdownEditor';

describe('MarkdownEditor - sanitizeEditorValue (SEC-000021)', () => {
  it('rewrites javascript: URLs before defaultValueCtx receives them', () => {
    expect(sanitizeEditorValue('[click me](javascript:alert(1))'))
      .toBe('[click me](about:blank#blocked)');
  });

  it('blocks data: URLs', () => {
    expect(sanitizeEditorValue('[x](data:text/html,<script>1</script>)'))
      .toBe('[x](about:blank#blocked)');
  });

  it('blocks vbscript: URLs', () => {
    expect(sanitizeEditorValue('[x](vbscript:msgbox("x"))'))
      .toBe('[x](about:blank#blocked)');
  });

  it('blocks case-variant javascript: (JavaScript:, JAVASCRIPT:)', () => {
    expect(sanitizeEditorValue('[x](JavaScript:alert(1))'))
      .toBe('[x](about:blank#blocked)');
    expect(sanitizeEditorValue('[x](JAVASCRIPT:alert(1))'))
      .toBe('[x](about:blank#blocked)');
  });

  it('blocks whitespace/control-char smuggling in scheme', () => {
    expect(sanitizeEditorValue('[x](java\tscript:alert(1))'))
      .toBe('[x](about:blank#blocked)');
    expect(sanitizeEditorValue('[x](java\nscript:alert(1))'))
      .toBe('[x](about:blank#blocked)');
  });

  it('blocks javascript: inside autolinks <javascript:...>', () => {
    expect(sanitizeEditorValue('<javascript:alert(1)>'))
      .toBe('<about:blank#blocked>');
  });

  it('blocks javascript: inside reference-style link definitions', () => {
    expect(sanitizeEditorValue('[id]: javascript:alert(1)'))
      .toBe('[id]: about:blank#blocked');
  });

  it('preserves safe http(s), mailto, and relative links unchanged', () => {
    const markdown = '[a](https://example.com) [b](http://example.com) [c](mailto:a@b.c) [d](/rel) [e](#anchor) [f](?q=1)';
    expect(sanitizeEditorValue(markdown)).toBe(markdown);
  });

  it('leaves plain markdown without links unchanged', () => {
    const markdown = '# Title\n\nA paragraph with **bold** and _italic_.';
    expect(sanitizeEditorValue(markdown)).toBe(markdown);
  });
});
