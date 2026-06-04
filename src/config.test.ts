import { describe, it, expect } from 'bun:test';
import { QUICK_ANSWER_SET_LIMIT } from './config';

describe('config', () => {
  it('exports QUICK_ANSWER_SET_LIMIT as a positive integer', () => {
    expect(Number.isInteger(QUICK_ANSWER_SET_LIMIT)).toBe(true);
    expect(QUICK_ANSWER_SET_LIMIT).toBeGreaterThan(0);
  });

  it('is 3', () => {
    expect(QUICK_ANSWER_SET_LIMIT).toBe(3);
  });
});
