import { describe, expect, it, test } from 'bun:test';
import { unzipSync, strFromU8 } from 'fflate';
import jsYaml from 'js-yaml';
import type { Pack, Chore, Question, UserProfile } from '@/types';
import { buildCDPZip } from './cdp-export';

const PACK: Pack = {
  id: 'morning-routines',
  manifest: { title: 'Morning Routines' },
  isPersonal: false,
  importedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const ACTIVE_CHORE: Chore = {
  key: 'morning-routines/brush-teeth',
  choreId: 'brush-teeth',
  packId: 'morning-routines',
  title: 'Brush Teeth',
  xpSize: 'XXS',
  recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '22:00' },
  repeatable: false,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const INACTIVE_CHORE: Chore = {
  ...ACTIVE_CHORE,
  choreId: 'archived',
  key: 'morning-routines/archived',
  active: false,
};

const PROFILE: UserProfile = {
  id: 'me',
  displayName: 'Alice',
  email: 'alice@example.com',
  activeXPSettingsId: 'default',
};

describe('buildCDPZip', () => {
  test('returns a Uint8Array', () => {
    expect(buildCDPZip(PACK, [ACTIVE_CHORE], [], PROFILE)).toBeInstanceOf(Uint8Array);
  });

  test('__pack__.yaml contains title and chores list', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.title).toBe('Morning Routines');
    expect(manifest.chores).toEqual(['brush-teeth.yaml']);
  });

  test('per-chore YAML contains required fields', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], PROFILE));
    const chore = jsYaml.load(strFromU8(files['morning-routines/brush-teeth.yaml'])) as Record<string, unknown>;
    expect(chore.title).toBe('Brush Teeth');
    expect(chore.xpSize).toBe('XXS');
    expect(chore.frequency).toBe('daily');
    expect(chore.interval).toBe(1);
    expect(chore.windowStartTime).toBe('22:00');
    expect(chore.repeatable).toBe(false);
  });

  test('excludes inactive chores from zip and chores list', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE, INACTIVE_CHORE], [], PROFILE));
    expect(files['morning-routines/archived.yaml']).toBeUndefined();
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect((manifest.chores as string[]).length).toBe(1);
  });

  test('omits optional pack manifest fields when absent', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.license).toBeUndefined();
    expect(manifest.description).toBeUndefined();
  });

  test('includes optional pack manifest fields when present', () => {
    const packWithExtras: Pack = {
      ...PACK,
      manifest: { ...PACK.manifest, author: 'Alice', license: 'MIT' },
    };
    const files = unzipSync(buildCDPZip(packWithExtras, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.license).toBe('MIT');
  });

  test('omits chore description when absent', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], PROFILE));
    const chore = jsYaml.load(strFromU8(files['morning-routines/brush-teeth.yaml'])) as Record<string, unknown>;
    expect(chore.description).toBeUndefined();
  });

  test('includes chore description when present', () => {
    const choreWithDesc: Chore = { ...ACTIVE_CHORE, description: 'Do it properly' };
    const files = unzipSync(buildCDPZip(PACK, [choreWithDesc], [], PROFILE));
    const chore = jsYaml.load(strFromU8(files['morning-routines/brush-teeth.yaml'])) as Record<string, unknown>;
    expect(chore.description).toBe('Do it properly');
  });
});

describe('buildCDPZip — metadata', () => {
  test('includes author as "Name <email>" when both are set', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBe('Alice <alice@example.com>');
  });

  test('includes only name when email is empty', () => {
    const noEmail = { ...PROFILE, email: '' };
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], noEmail));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBe('Alice');
  });

  test('includes only email in angle brackets when name is empty', () => {
    const noName = { ...PROFILE, displayName: '' };
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], noName));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBe('<alice@example.com>');
  });

  test('omits author when both name and email are empty', () => {
    const noIdentity = { ...PROFILE, displayName: '', email: '' };
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], noIdentity));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBeUndefined();
  });

  test('includes createdAt as an ISO string', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(typeof manifest.createdAt).toBe('string');
    expect(manifest.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

const PACK2: Pack = {
  id: 'my-pack', manifest: { title: 'My Pack' }, isPersonal: false,
  importedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const CHORE2: Chore = {
  key: 'my-pack/clean', choreId: 'clean', packId: 'my-pack', title: 'Clean',
  xpSize: 'S',
  recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
  repeatable: false, active: true, createdAt: '2026-01-01T00:00:00Z',
};
const PROFILE2: UserProfile = { id: 'me', displayName: 'Alice', email: 'alice@example.com', activeXPSettingsId: 'default' };

describe('buildCDPZip — question serialisation', () => {
  it('includes questions array in the chore YAML when questions are provided', () => {
    const question: Question = {
      id: 'q-1', choreKey: 'my-pack/clean', prompt: 'How long?', required: true, order: 0, type: 'TEXT',
    };
    const zipBytes = buildCDPZip(PACK2, [CHORE2], [question], PROFILE2);
    const files = unzipSync(zipBytes);
    const choreYaml = strFromU8(files['my-pack/clean.yaml']);
    const parsed = jsYaml.load(choreYaml) as Record<string, unknown>;
    expect(Array.isArray(parsed.questions)).toBe(true);
    const qs = parsed.questions as Array<Record<string, unknown>>;
    expect(qs[0].id).toBe('q-1');
    expect(qs[0].type).toBe('TEXT');
    expect(qs[0].prompt).toBe('How long?');
  });

  it('omits questions key when no questions exist for the chore', () => {
    const zipBytes = buildCDPZip(PACK2, [CHORE2], [], PROFILE2);
    const files = unzipSync(zipBytes);
    const choreYaml = strFromU8(files['my-pack/clean.yaml']);
    const parsed = jsYaml.load(choreYaml) as Record<string, unknown>;
    expect(parsed.questions).toBeUndefined();
  });

  it('does not include choreKey in the serialised question', () => {
    const question: Question = {
      id: 'q-2', choreKey: 'my-pack/clean', prompt: 'Minutes?', required: false, order: 0, type: 'INTEGER',
    };
    const zipBytes = buildCDPZip(PACK2, [CHORE2], [question], PROFILE2);
    const files = unzipSync(zipBytes);
    const choreYaml = strFromU8(files['my-pack/clean.yaml']);
    const parsed = jsYaml.load(choreYaml) as Record<string, unknown>;
    const qs = parsed.questions as Array<Record<string, unknown>>;
    expect(qs[0].choreKey).toBeUndefined();
  });

  it('does not include order in the serialised question', () => {
    const question: Question = {
      id: 'q-3', choreKey: 'my-pack/clean', prompt: 'How many?', required: true, order: 0, type: 'INTEGER',
    };
    const zipBytes = buildCDPZip(PACK2, [CHORE2], [question], PROFILE2);
    const files = unzipSync(zipBytes);
    const choreYaml = strFromU8(files['my-pack/clean.yaml']);
    const parsed = jsYaml.load(choreYaml) as Record<string, unknown>;
    const qs = parsed.questions as Array<Record<string, unknown>>;
    expect(qs[0].order).toBeUndefined();
  });

  it('exports questions sorted by their order field', () => {
    const q1: Question = { id: 'q-b', choreKey: 'my-pack/clean', prompt: 'Second', required: false, order: 1, type: 'TEXT' };
    const q0: Question = { id: 'q-a', choreKey: 'my-pack/clean', prompt: 'First', required: false, order: 0, type: 'TEXT' };
    const zipBytes = buildCDPZip(PACK2, [CHORE2], [q1, q0], PROFILE2);
    const files = unzipSync(zipBytes);
    const parsed = jsYaml.load(strFromU8(files['my-pack/clean.yaml'])) as Record<string, unknown>;
    const qs = parsed.questions as Array<Record<string, unknown>>;
    expect(qs[0].id).toBe('q-a');
    expect(qs[1].id).toBe('q-b');
  });
});

describe('buildCDPZip — sprint pack fields', () => {
  test('omits streak when not set', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.streak).toBeUndefined();
  });

  test('omits streak when true', () => {
    const packWithStreakTrue: Pack = {
      ...PACK,
      manifest: { ...PACK.manifest, streak: true },
    };
    const files = unzipSync(buildCDPZip(packWithStreakTrue, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.streak).toBeUndefined();
  });

  test('exports streak: false when set', () => {
    const packWithStreakFalse: Pack = {
      ...PACK,
      manifest: { ...PACK.manifest, streak: false },
    };
    const files = unzipSync(buildCDPZip(packWithStreakFalse, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.streak).toBe(false);
  });

  test('exports xpTarget when set', () => {
    const packWithXpTarget: Pack = {
      ...PACK,
      manifest: { ...PACK.manifest, xpTarget: 1200 },
    };
    const files = unzipSync(buildCDPZip(packWithXpTarget, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.xpTarget).toBe(1200);
  });

  test('omits xpTarget when not set', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.xpTarget).toBeUndefined();
  });

  test('exports targetDate when set', () => {
    const packWithTargetDate: Pack = {
      ...PACK,
      manifest: { ...PACK.manifest, targetDate: '2026-12-31' },
    };
    const files = unzipSync(buildCDPZip(packWithTargetDate, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.targetDate).toBe('2026-12-31');
  });

  test('omits targetDate when not set', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.targetDate).toBeUndefined();
  });

  test('exports allowShiftOnImport when true', () => {
    const packWithAllowShift: Pack = {
      ...PACK,
      manifest: { ...PACK.manifest, allowShiftOnImport: true },
    };
    const files = unzipSync(buildCDPZip(packWithAllowShift, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.allowShiftOnImport).toBe(true);
  });

  test('omits allowShiftOnImport when false or not set', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.allowShiftOnImport).toBeUndefined();
  });

  test('exports duePeriod in chore YAML when set', () => {
    const choreWithDuePeriod: Chore = {
      ...ACTIVE_CHORE,
      duePeriod: { value: 2, unit: 'days' },
    };
    const files = unzipSync(buildCDPZip(PACK, [choreWithDuePeriod], [], PROFILE));
    const chore = jsYaml.load(strFromU8(files['morning-routines/brush-teeth.yaml'])) as Record<string, unknown>;
    const duePeriod = chore.duePeriod as Record<string, unknown>;
    expect(duePeriod.value).toBe(2);
    expect(duePeriod.unit).toBe('days');
  });

  test('omits duePeriod when not set', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], [], PROFILE));
    const chore = jsYaml.load(strFromU8(files['morning-routines/brush-teeth.yaml'])) as Record<string, unknown>;
    expect(chore.duePeriod).toBeUndefined();
  });
});
