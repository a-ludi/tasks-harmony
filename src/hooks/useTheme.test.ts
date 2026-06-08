import { describe, it, expect } from 'bun:test';
import { resolveInitialTheme } from './useTheme';

describe('resolveInitialTheme', () => {
  it('returns dark when localStorage has "dark"', () => {
    expect(resolveInitialTheme('dark', false)).toBe('dark');
  });
  it('returns light when localStorage has "light"', () => {
    expect(resolveInitialTheme('light', true)).toBe('light');
  });
  it('falls back to dark when OS prefers dark and no stored value', () => {
    expect(resolveInitialTheme(null, true)).toBe('dark');
  });
  it('falls back to light when OS prefers light and no stored value', () => {
    expect(resolveInitialTheme(null, false)).toBe('light');
  });
  it('ignores unrecognised stored values and falls back to OS preference', () => {
    expect(resolveInitialTheme('system', true)).toBe('dark');
    expect(resolveInitialTheme('system', false)).toBe('light');
  });
});
