import { describe, it, expect } from 'bun:test';
import type { XPSize } from '@/types';

// Pure logic extracted from PackOptionsModal: resolve the defaultXPSize value
// for updatePackManifest from the UI dropdown state.
// The sentinel 'NONE' represents "no selection" (Radix UI does not allow empty string).
function resolveDefaultXPSize(
  defaultXPSize: XPSize | 'CUSTOM' | 'NONE',
  customDefaultXP: string,
): XPSize | number | undefined {
  const isCustom = defaultXPSize === 'CUSTOM';
  if (isCustom && customDefaultXP.trim()) {
    return Math.max(1, Math.floor(Number(customDefaultXP) || 1));
  } else if (!isCustom && defaultXPSize !== 'NONE') {
    return defaultXPSize as XPSize;
  }
  // 'NONE' sentinel → undefined (no default)
  return undefined;
}

describe('resolveDefaultXPSize — NONE sentinel maps to undefined', () => {
  it('returns undefined when defaultXPSize is NONE (no selection)', () => {
    expect(resolveDefaultXPSize('NONE', '')).toBeUndefined();
  });

  it('returns the XPSize string when a preset is selected', () => {
    expect(resolveDefaultXPSize('S', '')).toBe('S');
    expect(resolveDefaultXPSize('XXL', '')).toBe('XXL');
  });

  it('returns a clamped integer when CUSTOM is selected with a valid value', () => {
    expect(resolveDefaultXPSize('CUSTOM', '15')).toBe(15);
    expect(resolveDefaultXPSize('CUSTOM', '0')).toBe(1); // clamped to minimum 1
  });

  it('returns undefined when CUSTOM is selected but customDefaultXP is empty', () => {
    expect(resolveDefaultXPSize('CUSTOM', '')).toBeUndefined();
  });
});
