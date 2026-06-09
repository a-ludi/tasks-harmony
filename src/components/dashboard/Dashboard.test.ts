import { describe, it, expect } from 'bun:test';
import { compactMenuLabel } from './Dashboard';

describe('compactMenuLabel', () => {
  it('returns "Compact view" when not compact', () => {
    expect(compactMenuLabel(false)).toBe('Compact view');
  });
  it('returns "Normal view" when compact', () => {
    expect(compactMenuLabel(true)).toBe('Normal view');
  });
});
