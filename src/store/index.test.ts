import { describe, it, expect } from 'bun:test';
import { recordCompletionWithTimestamp } from './recordCompletion';

describe('recordCompletionWithTimestamp', () => {
  it('rejects a timestamp that is more than 1 second in the future', () => {
    const futureDate = new Date(Date.now() + 5000); // 5 seconds in the future
    expect(() => recordCompletionWithTimestamp(futureDate)).toThrow(/future/i);
  });

  it('accepts a timestamp that is now', () => {
    const now = new Date();
    expect(() => recordCompletionWithTimestamp(now)).not.toThrow();
  });

  it('accepts a timestamp that is 1 second ago', () => {
    const past = new Date(Date.now() - 1000);
    expect(() => recordCompletionWithTimestamp(past)).not.toThrow();
  });

  it('accepts a timestamp that is exactly 1 second in the future (within tolerance)', () => {
    const slightlyFuture = new Date(Date.now() + 999);
    expect(() => recordCompletionWithTimestamp(slightlyFuture)).not.toThrow();
  });

  it('rejects a timestamp well beyond the 1s tolerance', () => {
    const tooFuture = new Date(Date.now() + 5000);
    expect(() => recordCompletionWithTimestamp(tooFuture)).toThrow(/future/i);
  });

  it('returns the validated timestamp', () => {
    const now = new Date();
    const returned = recordCompletionWithTimestamp(now);
    expect(returned).toBe(now);
  });
});
