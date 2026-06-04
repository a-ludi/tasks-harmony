import { describe, it, expect, beforeEach } from 'bun:test';
import { clampSidebarWidth, SIDEBAR_MIN, SIDEBAR_DEFAULT, computeSidebarMax, readStoredWidth, writeStoredWidth } from './sidebarResize';

const mockStorage: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => { mockStorage[key] = value; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(key => delete mockStorage[key]); },
  length: 0,
  key: () => null,
} as Storage;

describe('SIDEBAR_MIN', () => {
  it('is 200', () => {
    expect(SIDEBAR_MIN).toBe(200);
  });
});

describe('SIDEBAR_DEFAULT', () => {
  it('is within bounds at a normal viewport (1920)', () => {
    const max = computeSidebarMax(1920);
    expect(SIDEBAR_DEFAULT).toBeGreaterThanOrEqual(SIDEBAR_MIN);
    expect(SIDEBAR_DEFAULT).toBeLessThanOrEqual(max);
  });
});

describe('computeSidebarMax', () => {
  it('returns 50% of viewport when that exceeds 200', () => {
    expect(computeSidebarMax(1920)).toBe(960);
    expect(computeSidebarMax(800)).toBe(400);
  });

  it('returns 200 when 50% of viewport is below 200', () => {
    expect(computeSidebarMax(300)).toBe(200);
    expect(computeSidebarMax(0)).toBe(200);
  });

  it('returns exactly 200 at the boundary (viewport 400)', () => {
    expect(computeSidebarMax(400)).toBe(200);
  });

  it('returns 201 at viewport 402', () => {
    expect(computeSidebarMax(402)).toBe(201);
  });
});

describe('clampSidebarWidth', () => {
  it('returns the value unchanged when within bounds', () => {
    expect(clampSidebarWidth(300, 1920)).toBe(300);
  });

  it('clamps to SIDEBAR_MIN when below minimum', () => {
    expect(clampSidebarWidth(50, 1920)).toBe(SIDEBAR_MIN);
  });

  it('clamps to dynamic max when above maximum (large viewport)', () => {
    expect(clampSidebarWidth(9999, 1920)).toBe(960);
  });

  it('clamps to dynamic max when above maximum (800px viewport)', () => {
    expect(clampSidebarWidth(9999, 800)).toBe(400);
  });

  it('uses 200 as max when viewport is very narrow (300px)', () => {
    expect(clampSidebarWidth(9999, 300)).toBe(200);
  });

  it('accepts exactly SIDEBAR_MIN', () => {
    expect(clampSidebarWidth(SIDEBAR_MIN, 1920)).toBe(SIDEBAR_MIN);
  });

  it('accepts exactly the dynamic max', () => {
    expect(clampSidebarWidth(960, 1920)).toBe(960);
  });
});

describe('readStoredWidth', () => {
  beforeEach(() => localStorage.clear());

  it('returns SIDEBAR_DEFAULT when no value stored', () => {
    expect(readStoredWidth(1920)).toBe(SIDEBAR_DEFAULT);
  });

  it('returns the stored clamped value when valid', () => {
    localStorage.setItem('sidebarWidth', '300');
    expect(readStoredWidth(1920)).toBe(300);
  });

  it('clamps a stored value that is below minimum', () => {
    localStorage.setItem('sidebarWidth', '50');
    expect(readStoredWidth(1920)).toBe(SIDEBAR_MIN);
  });

  it('clamps a stored value that exceeds the dynamic max', () => {
    localStorage.setItem('sidebarWidth', '9999');
    expect(readStoredWidth(800)).toBe(400);
  });

  it('returns SIDEBAR_DEFAULT for a non-numeric stored value', () => {
    localStorage.setItem('sidebarWidth', 'abc');
    expect(readStoredWidth(1920)).toBe(SIDEBAR_DEFAULT);
  });
});

describe('writeStoredWidth', () => {
  beforeEach(() => localStorage.clear());

  it('writes the clamped value to localStorage', () => {
    writeStoredWidth(300, 1920);
    expect(localStorage.getItem('sidebarWidth')).toBe('300');
  });

  it('clamps out-of-range values before writing', () => {
    writeStoredWidth(9999, 800);
    expect(localStorage.getItem('sidebarWidth')).toBe('400');
  });
});
