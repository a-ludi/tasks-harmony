import { describe, it, expect } from 'bun:test';

function buildDropdownLabel(compact: boolean): string {
  return compact ? 'Normal view' : 'Compact view';
}

describe('compact toggle dropdown label', () => {
  it('shows "Compact view" when not compact', () => {
    expect(buildDropdownLabel(false)).toBe('Compact view');
  });
  it('shows "Normal view" when compact', () => {
    expect(buildDropdownLabel(true)).toBe('Normal view');
  });
});
