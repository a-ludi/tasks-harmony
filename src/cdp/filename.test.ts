import { describe, expect, test } from 'bun:test';
import { titleToFilename } from './filename';

describe('titleToFilename', () => {
  test('basic ASCII words become dash-case', () => {
    expect(titleToFilename('Make Laundry')).toBe('make-laundry');
  });
  test('German umlauts transliterated (ä→ae, ö→oe, ü→ue, ß→ss)', () => {
    expect(titleToFilename('Ärger mit Müll')).toBe('aerger-mit-muell');
    expect(titleToFilename('Großeinkauf')).toBe('grosseinkauf');
  });
  test('French accents simplified', () => {
    expect(titleToFilename('Ménage')).toBe('menage');
  });
  test('numbers preserved', () => {
    expect(titleToFilename('Clean 3 Rooms')).toBe('clean-3-rooms');
  });
  test('multiple spaces collapse to one dash', () => {
    expect(titleToFilename('Take   Out   Trash')).toBe('take-out-trash');
  });
  test('leading and trailing whitespace stripped', () => {
    expect(titleToFilename('  Clean up  ')).toBe('clean-up');
  });
  test('special characters stripped', () => {
    expect(titleToFilename('Feed cat!')).toBe('feed-cat');
  });
  test('empty string returns empty string', () => {
    expect(titleToFilename('')).toBe('');
  });
  test('only special chars returns empty string', () => {
    expect(titleToFilename('!@#$%')).toBe('');
  });
});
