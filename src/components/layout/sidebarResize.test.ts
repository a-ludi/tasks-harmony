import { describe, it, expect } from 'bun:test';
import { clampSidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT } from './sidebarResize';

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
