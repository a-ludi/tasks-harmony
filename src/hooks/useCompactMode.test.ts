import { describe, it, expect } from 'bun:test';
import { resolveInitialCompact } from './useCompactMode';

describe('resolveInitialCompact', () => {
  it('returns true when localStorage has "true"', () => {
    expect(resolveInitialCompact('true')).toBe(true);
  });
  it('returns false when localStorage is null', () => {
    expect(resolveInitialCompact(null)).toBe(false);
  });
  it('returns false when localStorage has "false"', () => {
    expect(resolveInitialCompact('false')).toBe(false);
  });
  it('returns false for any unrecognised value', () => {
    expect(resolveInitialCompact('yes')).toBe(false);
    expect(resolveInitialCompact('1')).toBe(false);
  });
});
