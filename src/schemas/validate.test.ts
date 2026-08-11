import { describe, expect, it, test } from 'bun:test';
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

describe('validateChoreDefinition — questions', () => {
  it('accepts a chore with no questions field', () => {
    const result = validateChoreDefinition({ title: 'T', xpSize: 'S', frequency: 'daily', interval: 1 });
    expect(result.valid).toBe(true);
  });

  it('accepts a valid TEXT question', () => {
    const result = validateChoreDefinition({
      title: 'T', xpSize: 'S', frequency: 'daily', interval: 1,
      questions: [{ id: 'q-1', type: 'TEXT', prompt: 'How?', required: true, order: 0 }],
    });
    expect(result.valid).toBe(true);
  });

  it('accepts a valid ENUM question with choices', () => {
    const result = validateChoreDefinition({
      title: 'T', xpSize: 'S', frequency: 'daily', interval: 1,
      questions: [{
        id: 'q-1', type: 'ENUM', prompt: 'Effort?', required: true, order: 0,
        choices: [{ id: 'c-1', label: 'Low', order: 0 }],
      }],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects a question missing required fields', () => {
    const result = validateChoreDefinition({
      title: 'T', xpSize: 'S', frequency: 'daily', interval: 1,
      questions: [{ type: 'TEXT' }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects an unknown question type', () => {
    const result = validateChoreDefinition({
      title: 'T', xpSize: 'S', frequency: 'daily', interval: 1,
      questions: [{ id: 'q-1', type: 'UNKNOWN', prompt: 'Q', required: true, order: 0 }],
    });
    expect(result.valid).toBe(false);
  });
});

describe('validatePackManifest — sprint fields', () => {
  it('accepts streak: false', () => {
    expect(validatePackManifest({ title: 'T', streak: false }).valid).toBe(true);
  });

  it('accepts streak: true', () => {
    expect(validatePackManifest({ title: 'T', streak: true }).valid).toBe(true);
  });

  it('rejects non-boolean streak', () => {
    expect(validatePackManifest({ title: 'T', streak: 'yes' }).valid).toBe(false);
  });

  it('accepts xpTarget number', () => {
    expect(validatePackManifest({ title: 'T', xpTarget: 1200 }).valid).toBe(true);
  });

  it('rejects negative xpTarget', () => {
    expect(validatePackManifest({ title: 'T', xpTarget: -1 }).valid).toBe(false);
  });

  it('accepts valid targetDate', () => {
    expect(validatePackManifest({ title: 'T', targetDate: '2026-12-31' }).valid).toBe(true);
  });

  it('rejects malformed targetDate', () => {
    expect(validatePackManifest({ title: 'T', targetDate: '31-12-2026' }).valid).toBe(false);
  });

  it('accepts allowShiftOnImport: true', () => {
    expect(validatePackManifest({ title: 'T', allowShiftOnImport: true }).valid).toBe(true);
  });
});

describe('validatePackManifest — chore filename security', () => {
  it('rejects pack manifest with path-traversal chore filename (../)', () => {
    const result = validatePackManifest({
      title: 'Test Pack',
      chores: ['../evil.yaml'],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects pack manifest with deep path-traversal chore filename', () => {
    const result = validatePackManifest({
      title: 'Test Pack',
      chores: ['../../other-user/other-repo/refs/heads/main/inject/malicious.yaml'],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects pack manifest with subdirectory chore filename', () => {
    const result = validatePackManifest({
      title: 'Test Pack',
      chores: ['subdir/chore.yaml'],
    });
    expect(result.valid).toBe(false);
  });

  it('accepts pack manifest with simple safe chore filenames', () => {
    const result = validatePackManifest({
      title: 'Test Pack',
      chores: ['morning-routine.yaml', 'chore_01.yaml', 'CleanUp.yaml'],
    });
    expect(result.valid).toBe(true);
  });

  it('accepts pack manifest with dotted chore filename', () => {
    const result = validatePackManifest({
      title: 'Test Pack',
      chores: ['clean.up.yaml'],
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateChoreDefinition — duePeriod', () => {
  it('accepts valid duePeriod', () => {
    const result = validateChoreDefinition({
      title: 'T', xpSize: 'S', frequency: 'daily', interval: 1,
      duePeriod: { value: 2, unit: 'days' },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts duePeriod with unit: minutes', () => {
    const result = validateChoreDefinition({
      title: 'T', xpSize: 'S', frequency: 'daily', interval: 1,
      duePeriod: { value: 30, unit: 'minutes' },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects duePeriod with unknown unit', () => {
    const result = validateChoreDefinition({
      title: 'T', xpSize: 'S', frequency: 'daily', interval: 1,
      duePeriod: { value: 1, unit: 'years' },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects duePeriod missing value', () => {
    const result = validateChoreDefinition({
      title: 'T', xpSize: 'S', frequency: 'daily', interval: 1,
      duePeriod: { unit: 'days' },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects duePeriod missing unit', () => {
    const result = validateChoreDefinition({
      title: 'T', xpSize: 'S', frequency: 'daily', interval: 1,
      duePeriod: { value: 1 },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects negative duePeriod value', () => {
    const result = validateChoreDefinition({
      title: 'T', xpSize: 'S', frequency: 'daily', interval: 1,
      duePeriod: { value: -1, unit: 'hours' },
    });
    expect(result.valid).toBe(false);
  });
});

describe('validateAppState — malicious pack sourceUrl (SEC-000023)', () => {
  test('rejects a pack entry that is not a valid Pack shape', () => {
    const state = {
      schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
      packs: [{
        id: 'morning-routines',
        manifest: { title: 'Morning Routines' },
        isPersonal: false,
        importedAt: '2026-07-04T00:00:00Z',
        updatedAt:  '2026-07-04T00:00:00Z',
        sourceUrl:  'https://evil.example/packs/morning-routines',
        __attacker_extra: true,
      }],
      chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
      profile: { id: 'me', displayName: '', email: '', activeXPSettingsId: 'standard' },
      syncState: { id: 'main', pendingSync: false },
    };
    expect(validateAppState(state).valid).toBe(false);
  });

  test('accepts a well-formed backup with a legitimate pack, chore, completion, and quickAnswerSet', () => {
    const state = {
      schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
      packs: [{
        id: 'personal', manifest: { title: 'Personal' }, isPersonal: true,
        importedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      }],
      chores: [{
        key: 'personal/floss', choreId: 'floss', packId: 'personal',
        title: 'Floss', xpSize: 'XS',
        recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
        repeatable: false, active: true, createdAt: '2026-01-01T00:00:00Z',
      }],
      questions: [],
      completions: [{
        id: 'c1', choreKey: 'personal/floss', completedAt: '2026-01-01T00:00:00Z',
        xpEarned: 10, streak: 1, answers: [],
      }],
      xpSettings: [{
        id: 'standard', name: 'Standard',
        maxStreakMultiplier: 2, decayFloor: 0.5, streakHalfLife: 7, decayHalfLife: 14,
      }],
      quickAnswerSets: [{
        id: 'qa1', choreKey: 'personal/floss', label: 'Ok', answers: [],
      }],
      profile: { id: 'me', displayName: '', email: '', activeXPSettingsId: 'standard' },
      syncState: { id: 'main', pendingSync: false },
    };
    expect(validateAppState(state).valid).toBe(true);
  });
});

describe('validateAppState — notification fields', () => {
  const baseState = {
    schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
    packs: [{
      id: 'personal', manifest: { title: 'Personal' }, isPersonal: true,
      importedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    }],
    questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
    profile: { id: 'me', displayName: '', email: '', activeXPSettingsId: 'standard' },
    syncState: { id: 'main', pendingSync: false },
  };

  it('accepts a chore with notifications enabled', () => {
    const state = {
      ...baseState,
      chores: [{
        key: 'personal/floss', choreId: 'floss', packId: 'personal',
        title: 'Floss', xpSize: 'XS',
        recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
        repeatable: false, active: true, createdAt: '2026-01-01T00:00:00Z',
        notifications: { enabled: 'on', trigger: 'at-due-time' },
      }],
    };
    expect(validateAppState(state).valid).toBe(true);
  });

  it('accepts a chore with notifications set to default', () => {
    const state = {
      ...baseState,
      chores: [{
        key: 'personal/floss', choreId: 'floss', packId: 'personal',
        title: 'Floss', xpSize: 'XS',
        recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
        repeatable: false, active: true, createdAt: '2026-01-01T00:00:00Z',
        notifications: { enabled: 'default', trigger: 'at-due-time' },
      }],
    };
    expect(validateAppState(state).valid).toBe(true);
  });

  it('rejects a chore with an invalid notifications.enabled value', () => {
    const state = {
      ...baseState,
      chores: [{
        key: 'personal/floss', choreId: 'floss', packId: 'personal',
        title: 'Floss', xpSize: 'XS',
        recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
        repeatable: false, active: true, createdAt: '2026-01-01T00:00:00Z',
        notifications: { enabled: 'maybe', trigger: 'at-due-time' },
      }],
    };
    expect(validateAppState(state).valid).toBe(false);
  });

  it('rejects a chore with an invalid notifications.trigger value', () => {
    const state = {
      ...baseState,
      chores: [{
        key: 'personal/floss', choreId: 'floss', packId: 'personal',
        title: 'Floss', xpSize: 'XS',
        recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
        repeatable: false, active: true, createdAt: '2026-01-01T00:00:00Z',
        notifications: { enabled: 'on', trigger: 'immediately' },
      }],
    };
    expect(validateAppState(state).valid).toBe(false);
  });

  it('accepts a pack manifest with defaultNotifications', () => {
    const state = {
      ...baseState,
      chores: [],
      packs: [{
        id: 'personal',
        manifest: { title: 'Personal', defaultNotifications: 'on' },
        isPersonal: true,
        importedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }],
    };
    expect(validateAppState(state).valid).toBe(true);
  });

  it('rejects a pack manifest with an invalid defaultNotifications value', () => {
    const state = {
      ...baseState,
      chores: [],
      packs: [{
        id: 'personal',
        manifest: { title: 'Personal', defaultNotifications: 'maybe' },
        isPersonal: true,
        importedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }],
    };
    expect(validateAppState(state).valid).toBe(false);
  });

  it('accepts a profile with defaultNotifications', () => {
    const state = {
      ...baseState,
      chores: [],
      profile: { id: 'me', displayName: 'User', email: 'u@example.com', activeXPSettingsId: 'standard', defaultNotifications: 'on' },
    };
    expect(validateAppState(state).valid).toBe(true);
  });

  it('rejects a profile with defaultNotifications set to "default" (not allowed at profile level)', () => {
    const state = {
      ...baseState,
      chores: [],
      profile: { id: 'me', displayName: 'User', email: 'u@example.com', activeXPSettingsId: 'standard', defaultNotifications: 'default' },
    };
    expect(validateAppState(state).valid).toBe(false);
  });
});

describe('validatePackManifest — notification fields', () => {
  it('accepts defaultNotifications: "on"', () => {
    expect(validatePackManifest({ title: 'T', defaultNotifications: 'on' }).valid).toBe(true);
  });

  it('accepts defaultNotifications: "off"', () => {
    expect(validatePackManifest({ title: 'T', defaultNotifications: 'off' }).valid).toBe(true);
  });

  it('accepts defaultNotifications: "default"', () => {
    expect(validatePackManifest({ title: 'T', defaultNotifications: 'default' }).valid).toBe(true);
  });

  it('rejects defaultNotifications with an invalid value', () => {
    expect(validatePackManifest({ title: 'T', defaultNotifications: 'maybe' }).valid).toBe(false);
  });
});

describe('validateAppState — malicious pack manifest (SEC-000030)', () => {
  test('rejects a pack whose manifest carries an unknown property', () => {
    const state = {
      schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
      packs: [{
        id: 'evil-pack',
        manifest: { title: 'Evil', __attacker_extra: 'payload' },
        isPersonal: false,
        importedAt: '2026-07-04T00:00:00Z',
        updatedAt:  '2026-07-04T00:00:00Z',
      }],
      chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
      profile: { id: 'me', displayName: '', email: '', activeXPSettingsId: 'standard' },
      syncState: { id: 'main', pendingSync: false },
    };
    expect(validateAppState(state).valid).toBe(false);
  });

  test('rejects a pack whose manifest.description is not a string', () => {
    const state = {
      schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
      packs: [{
        id: 'evil-pack',
        manifest: { title: 'Evil', description: { evil: 'obj' } },
        isPersonal: false,
        importedAt: '2026-07-04T00:00:00Z',
        updatedAt:  '2026-07-04T00:00:00Z',
      }],
      chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
      profile: { id: 'me', displayName: '', email: '', activeXPSettingsId: 'standard' },
      syncState: { id: 'main', pendingSync: false },
    };
    expect(validateAppState(state).valid).toBe(false);
  });

  test('rejects a pack whose manifest.xpTarget is a string', () => {
    const state = {
      schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
      packs: [{
        id: 'evil-pack',
        manifest: { title: 'Evil', xpTarget: '9e99' },
        isPersonal: false,
        importedAt: '2026-07-04T00:00:00Z',
        updatedAt:  '2026-07-04T00:00:00Z',
      }],
      chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
      profile: { id: 'me', displayName: '', email: '', activeXPSettingsId: 'standard' },
      syncState: { id: 'main', pendingSync: false },
    };
    expect(validateAppState(state).valid).toBe(false);
  });

  test('accepts a legitimate backup carrying user-only manifest fields (decay, defaultXPSize)', () => {
    const state = {
      schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z',
      packs: [{
        id: 'personal',
        manifest: {
          title: 'Personal',
          description: 'My chores',
          streak: true,
          decay: false,
          defaultXPSize: 'M',
          xpTarget: 1200,
          targetDate: '2026-12-31',
          allowShiftOnImport: true,
        },
        isPersonal: true,
        importedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }],
      chores: [], questions: [], completions: [], xpSettings: [], quickAnswerSets: [],
      profile: { id: 'me', displayName: '', email: '', activeXPSettingsId: 'standard' },
      syncState: { id: 'main', pendingSync: false },
    };
    expect(validateAppState(state).valid).toBe(true);
  });
});
