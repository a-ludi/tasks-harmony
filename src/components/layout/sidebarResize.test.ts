import { describe, it, expect, beforeEach } from 'bun:test';
import { clampSidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT, readStoredWidth, writeStoredWidth } from './sidebarResize';

// Mock localStorage for testing
const mockStorage: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = value;
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
  },
  length: 0,
  key: () => null,
} as Storage;

describe('clampSidebarWidth', () => {
  it('returns the value unchanged when within bounds', () => {
    expect(clampSidebarWidth(200)).toBe(200);
  });

  it('clamps to SIDEBAR_MIN when below minimum', () => {
    expect(clampSidebarWidth(50)).toBe(SIDEBAR_MIN);
  });

  it('clamps to SIDEBAR_MAX when above maximum', () => {
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX);
  });

  it('accepts exactly SIDEBAR_MIN', () => {
    expect(clampSidebarWidth(SIDEBAR_MIN)).toBe(SIDEBAR_MIN);
  });

  it('accepts exactly SIDEBAR_MAX', () => {
    expect(clampSidebarWidth(SIDEBAR_MAX)).toBe(SIDEBAR_MAX);
  });
});

describe('SIDEBAR_DEFAULT', () => {
  it('is within [SIDEBAR_MIN, SIDEBAR_MAX]', () => {
    expect(SIDEBAR_DEFAULT).toBeGreaterThanOrEqual(SIDEBAR_MIN);
    expect(SIDEBAR_DEFAULT).toBeLessThanOrEqual(SIDEBAR_MAX);
  });
});

describe('readStoredWidth', () => {
  beforeEach(() => localStorage.clear());

  it('returns SIDEBAR_DEFAULT when no value stored', () => {
    expect(readStoredWidth()).toBe(SIDEBAR_DEFAULT);
  });

  it('returns the stored clamped value when valid', () => {
    localStorage.setItem('sidebarWidth', '250');
    expect(readStoredWidth()).toBe(250);
  });

  it('clamps a stored value that is below minimum', () => {
    localStorage.setItem('sidebarWidth', '50');
    expect(readStoredWidth()).toBe(SIDEBAR_MIN);
  });

  it('clamps a stored value that is above maximum', () => {
    localStorage.setItem('sidebarWidth', '9999');
    expect(readStoredWidth()).toBe(SIDEBAR_MAX);
  });

  it('returns SIDEBAR_DEFAULT for a non-numeric stored value', () => {
    localStorage.setItem('sidebarWidth', 'abc');
    expect(readStoredWidth()).toBe(SIDEBAR_DEFAULT);
  });
});

describe('writeStoredWidth', () => {
  beforeEach(() => localStorage.clear());

  it('writes the clamped value to localStorage', () => {
    writeStoredWidth(300);
    expect(localStorage.getItem('sidebarWidth')).toBe('300');
  });

  it('clamps out-of-range values before writing', () => {
    writeStoredWidth(9999);
    expect(localStorage.getItem('sidebarWidth')).toBe(String(SIDEBAR_MAX));
  });
});
