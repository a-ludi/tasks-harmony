import { describe, expect, test } from 'bun:test';
import { slugifyPackId } from './packId';

describe('slugifyPackId', () => {
  test('lowercases and hyphenates spaces', () => {
    expect(slugifyPackId('Morning Routines', [])).toBe('morning-routines');
  });

  test('returns base ID when no collision', () => {
    expect(slugifyPackId('My Pack', ['other-pack'])).toBe('my-pack');
  });

  test('appends -2 on first collision', () => {
    expect(slugifyPackId('Morning Routines', ['morning-routines'])).toBe('morning-routines-2');
  });

  test('increments suffix until unique', () => {
    expect(
      slugifyPackId('Morning Routines', ['morning-routines', 'morning-routines-2'])
    ).toBe('morning-routines-3');
  });

  test('falls back to "pack" for symbol-only names', () => {
    expect(slugifyPackId('!!!', [])).toBe('pack');
  });
});
