import { describe, expect, test } from 'bun:test';
import { resolveChoreIdCollision } from './resolveCollision';

describe('resolveChoreIdCollision', () => {
  test('returns original when no collision', () => {
    expect(resolveChoreIdCollision('make-bed', 'Make Bed', new Set())).toEqual({
      choreId: 'make-bed',
      title: 'Make Bed',
    });
  });

  test('appends -2 suffix on first collision', () => {
    expect(
      resolveChoreIdCollision('make-bed', 'Make Bed', new Set(['make-bed']))
    ).toEqual({ choreId: 'make-bed-2', title: 'Make Bed 2' });
  });

  test('skips taken suffixes and picks next free one', () => {
    expect(
      resolveChoreIdCollision(
        'make-bed', 'Make Bed',
        new Set(['make-bed', 'make-bed-2', 'make-bed-3'])
      )
    ).toEqual({ choreId: 'make-bed-4', title: 'Make Bed 4' });
  });

  test('appends fresh suffix without parsing existing suffix', () => {
    expect(
      resolveChoreIdCollision('make-bed-2', 'Make Bed 2', new Set(['make-bed-2']))
    ).toEqual({ choreId: 'make-bed-2-2', title: 'Make Bed 2 2' });
  });
});
