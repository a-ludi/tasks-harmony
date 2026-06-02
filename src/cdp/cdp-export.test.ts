import { describe, expect, test } from 'bun:test';
import { unzipSync, strFromU8 } from 'fflate';
import jsYaml from 'js-yaml';
import type { Pack, Chore, UserProfile } from '@/types';
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
    expect(buildCDPZip(PACK, [ACTIVE_CHORE], PROFILE)).toBeInstanceOf(Uint8Array);
  });

  test('__pack__.yaml contains title and chores list', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.title).toBe('Morning Routines');
    expect(manifest.chores).toEqual(['brush-teeth.yaml']);
  });

  test('per-chore YAML contains required fields', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], PROFILE));
    const chore = jsYaml.load(strFromU8(files['morning-routines/brush-teeth.yaml'])) as Record<string, unknown>;
    expect(chore.title).toBe('Brush Teeth');
    expect(chore.xpSize).toBe('XXS');
    expect(chore.frequency).toBe('daily');
    expect(chore.interval).toBe(1);
    expect(chore.windowStartTime).toBe('22:00');
    expect(chore.repeatable).toBe(false);
  });

  test('excludes inactive chores from zip and chores list', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE, INACTIVE_CHORE], PROFILE));
    expect(files['morning-routines/archived.yaml']).toBeUndefined();
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect((manifest.chores as string[]).length).toBe(1);
  });

  test('omits optional pack manifest fields when absent', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.license).toBeUndefined();
    expect(manifest.description).toBeUndefined();
  });

  test('includes optional pack manifest fields when present', () => {
    const packWithExtras: Pack = {
      ...PACK,
      manifest: { ...PACK.manifest, author: 'Alice', license: 'MIT' },
    };
    const files = unzipSync(buildCDPZip(packWithExtras, [ACTIVE_CHORE], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.license).toBe('MIT');
  });

  test('omits chore description when absent', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], PROFILE));
    const chore = jsYaml.load(strFromU8(files['morning-routines/brush-teeth.yaml'])) as Record<string, unknown>;
    expect(chore.description).toBeUndefined();
  });

  test('includes chore description when present', () => {
    const choreWithDesc: Chore = { ...ACTIVE_CHORE, description: 'Do it properly' };
    const files = unzipSync(buildCDPZip(PACK, [choreWithDesc], PROFILE));
    const chore = jsYaml.load(strFromU8(files['morning-routines/brush-teeth.yaml'])) as Record<string, unknown>;
    expect(chore.description).toBe('Do it properly');
  });
});

describe('buildCDPZip — metadata', () => {
  test('includes author as "Name <email>" when both are set', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBe('Alice <alice@example.com>');
  });

  test('includes only name when email is empty', () => {
    const noEmail = { ...PROFILE, email: '' };
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], noEmail));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBe('Alice');
  });

  test('includes only email in angle brackets when name is empty', () => {
    const noName = { ...PROFILE, displayName: '' };
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], noName));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBe('<alice@example.com>');
  });

  test('omits author when both name and email are empty', () => {
    const noIdentity = { ...PROFILE, displayName: '', email: '' };
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], noIdentity));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(manifest.author).toBeUndefined();
  });

  test('includes createdAt as an ISO string', () => {
    const files = unzipSync(buildCDPZip(PACK, [ACTIVE_CHORE], PROFILE));
    const manifest = jsYaml.load(strFromU8(files['morning-routines/__pack__.yaml'])) as Record<string, unknown>;
    expect(typeof manifest.createdAt).toBe('string');
    expect(manifest.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
