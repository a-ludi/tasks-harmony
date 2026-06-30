import { describe, it, expect } from 'bun:test';
import { streakFactorValue, decayFactorValue } from './XPFormula';

describe('XPFormula factor values include their own × operator', () => {
  it('streakFactorValue returns range prefixed with ×', () => {
    expect(streakFactorValue('1×–3×')).toBe('× 1×–3×');
  });

  it('decayFactorValue returns range prefixed with ×', () => {
    expect(decayFactorValue('0.5×–1×')).toBe('× 0.5×–1×');
  });
});
