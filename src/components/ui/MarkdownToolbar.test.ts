import { describe, it, expect } from 'bun:test';
import { TOOLBAR_ITEMS } from './MarkdownToolbar';

describe('TOOLBAR_ITEMS', () => {
  const buttons = TOOLBAR_ITEMS.filter((i) => i.type === 'button');
  const separators = TOOLBAR_ITEMS.filter((i) => i.type === 'separator');

  it('has at least 10 buttons', () => expect(buttons.length).toBeGreaterThanOrEqual(10));
  it('has at least 2 separators', () => expect(separators.length).toBeGreaterThanOrEqual(2));

  it('every button has label, title, and command', () => {
    for (const item of buttons) {
      if (item.type !== 'button') continue;
      expect(item.label).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.command).toBeTruthy();
    }
  });

  it('includes Bold, Italic, Strikethrough, Inline code', () => {
    const titles = buttons.map((i) => (i.type === 'button' ? i.title : '')).filter(Boolean);
    expect(titles).toContain('Bold');
    expect(titles).toContain('Italic');
    expect(titles).toContain('Strikethrough');
    expect(titles).toContain('Inline code');
  });

  it('includes H1, H2, H3 with correct payloads', () => {
    const headings = buttons.filter((i) => i.type === 'button' && i.title.startsWith('Heading'));
    expect(headings.length).toBe(3);
    const payloads = headings.map((i) => (i.type === 'button' ? i.payload : undefined));
    expect(payloads).toEqual([1, 2, 3]);
  });

  it('includes Bullet list, Ordered list, Blockquote, Code block', () => {
    const titles = buttons.map((i) => (i.type === 'button' ? i.title : '')).filter(Boolean);
    expect(titles).toContain('Bullet list');
    expect(titles).toContain('Ordered list');
    expect(titles).toContain('Blockquote');
    expect(titles).toContain('Code block');
  });
});
