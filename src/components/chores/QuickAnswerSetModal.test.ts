import { describe, it, expect } from 'bun:test';

function isValidLabel(label: string): boolean {
  return label.trim().length > 0;
}

describe('QuickAnswerSetModal — label validation', () => {
  it('accepts a non-empty label', () => {
    expect(isValidLabel('Default')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidLabel('')).toBe(false);
  });

  it('rejects whitespace only', () => {
    expect(isValidLabel('   ')).toBe(false);
  });
});
