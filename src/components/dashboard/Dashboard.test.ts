import { describe, it, expect } from 'bun:test';
import { compactMenuLabel, archiveMenuLabel } from './Dashboard';

describe('compactMenuLabel', () => {
  it('returns "Compact view" when not compact', () => {
    expect(compactMenuLabel(false)).toBe('Compact view');
  });
  it('returns "Normal view" when compact', () => {
    expect(compactMenuLabel(true)).toBe('Normal view');
  });
});

describe('archiveMenuLabel', () => {
  it('returns "View archived" when not in archive mode', () => {
    expect(archiveMenuLabel(false)).toBe('View archived');
  });
  it('returns "Exit archive" when in archive mode', () => {
    expect(archiveMenuLabel(true)).toBe('Exit archive');
  });
});
