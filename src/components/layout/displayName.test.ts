import { describe, it, expect } from 'bun:test';
import { getDisplayName } from './displayName';

describe('getDisplayName', () => {
  it('returns the trimmed display name when set', () => {
    expect(getDisplayName('Alice')).toBe('Alice');
  });

  it('returns null when display name is empty', () => {
    expect(getDisplayName('')).toBeNull();
  });

  it('returns null when display name is whitespace only', () => {
    expect(getDisplayName('   ')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(getDisplayName('  Bob  ')).toBe('Bob');
  });
});
