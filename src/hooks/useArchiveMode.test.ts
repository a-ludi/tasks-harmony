import { describe, it, expect } from 'bun:test';
import { resolveInitialArchiveMode } from './useArchiveMode';

describe('resolveInitialArchiveMode', () => {
  it('returns false when storage is null', () => {
    expect(resolveInitialArchiveMode(null)).toBe(false);
  });
  it('returns true when storage is "true"', () => {
    expect(resolveInitialArchiveMode('true')).toBe(true);
  });
  it('returns false when storage is "false"', () => {
    expect(resolveInitialArchiveMode('false')).toBe(false);
  });
  it('returns false for any unrecognised value', () => {
    expect(resolveInitialArchiveMode('yes')).toBe(false);
    expect(resolveInitialArchiveMode('1')).toBe(false);
  });
});
