import { describe, expect, test } from 'bun:test';
import { validateAppState, validatePackManifest, validateChoreDefinition } from './validate';

describe('validateAppState', () => {
  test('valid AppState passes', () => {
    const valid = {
      schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
      packs: [], chores: [], questions: [], completions: [], xpSettings: [],
      profile: { id: 'me', displayName: '', email: '', activeXPSettingsId: 'standard' },
      syncState: { id: 'main', pendingSync: false },
    };
    expect(validateAppState(valid).valid).toBe(true);
  });
  test('missing schemaVersion fails', () => {
    const invalid = { exportedAt: '2026-01-01T00:00:00.000Z', packs: [], chores: [], questions: [], completions: [], xpSettings: [], profile: {}, syncState: {} };
    expect(validateAppState(invalid).valid).toBe(false);
  });
  test('wrong schemaVersion fails', () => {
    const invalid = { schemaVersion: 2, exportedAt: '2026-01-01T00:00:00.000Z', packs: [], chores: [], questions: [], completions: [], xpSettings: [], profile: { id: 'me', displayName: '', email: '', activeXPSettingsId: 'standard' }, syncState: { id: 'main', pendingSync: false } };
    expect(validateAppState(invalid).valid).toBe(false);
  });
});

describe('validatePackManifest', () => {
  test('valid manifest passes', () => {
    expect(validatePackManifest({ title: 'Fitness Pack' }).valid).toBe(true);
  });
  test('missing title fails', () => {
    expect(validatePackManifest({ author: 'Alice' }).valid).toBe(false);
  });
  test('extra properties fail', () => {
    expect(validatePackManifest({ title: 'X', unknown: true }).valid).toBe(false);
  });
});

describe('validateChoreDefinition', () => {
  test('valid chore passes', () => {
    expect(validateChoreDefinition({ title: 'Floss teeth', xpSize: 'XS', frequency: 'daily', interval: 1 }).valid).toBe(true);
  });
  test('invalid xpSize fails', () => {
    expect(validateChoreDefinition({ title: 'X', xpSize: 'HUGE', frequency: 'daily', interval: 1 }).valid).toBe(false);
  });
  test('invalid frequency fails', () => {
    expect(validateChoreDefinition({ title: 'X', xpSize: 'S', frequency: 'bogus', interval: 1 }).valid).toBe(false);
  });
  test('invalid windowStartTime pattern fails', () => {
    expect(validateChoreDefinition({ title: 'X', xpSize: 'S', frequency: 'daily', interval: 1, windowStartTime: '25:00' }).valid).toBe(false);
  });
});
