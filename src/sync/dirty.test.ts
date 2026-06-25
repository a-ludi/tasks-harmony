import { describe, it, expect, mock } from 'bun:test';

// Re-import the module fresh for each test by using isolate mode
// dirty.ts is module-level state, so we test it directly
import { markDirty, isDirty, clearDirty, setDirtyListener } from './dirty';

describe('dirty flag', () => {
  it('starts clean', () => {
    clearDirty(); // reset before test
    expect(isDirty()).toBe(false);
  });

  it('markDirty sets the flag', () => {
    clearDirty();
    markDirty();
    expect(isDirty()).toBe(true);
    clearDirty(); // cleanup
  });

  it('clearDirty resets the flag', () => {
    markDirty();
    clearDirty();
    expect(isDirty()).toBe(false);
  });

  it('calls the listener on markDirty', () => {
    clearDirty();
    const listener = mock(() => {});
    setDirtyListener(listener);
    markDirty();
    expect(listener).toHaveBeenCalledTimes(1);
    setDirtyListener(null); // cleanup
    clearDirty();
  });

  it('does not call listener after setDirtyListener(null)', () => {
    const listener = mock(() => {});
    setDirtyListener(listener);
    setDirtyListener(null);
    markDirty();
    expect(listener).not.toHaveBeenCalled();
    clearDirty();
  });
});
