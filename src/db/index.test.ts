// src/db/index.test.ts
import 'fake-indexeddb/auto';
import { describe, expect, test } from 'bun:test';
import { openDB, getPacks, getProfile, getXPSettings, getSyncState } from './index';

describe('DB', () => {
  test('seeds personal pack on first open', async () => {
    const db = await openDB(`test-${crypto.randomUUID()}`);
    const packs = await getPacks(db);
    expect(packs).toHaveLength(1);
    expect(packs[0].id).toBe('personal');
    expect(packs[0].manifest.title).toBe('My Chores');
  });

  test('seeds Standard and Hard Mode XP settings', async () => {
    const db = await openDB(`test-${crypto.randomUUID()}`);
    const settings = await getXPSettings(db);
    const names = settings.map((s) => s.name);
    expect(names).toContain('Standard');
    expect(names).toContain('Hard Mode');
  });

  test('seeds empty profile with standard XP active', async () => {
    const db = await openDB(`test-${crypto.randomUUID()}`);
    const profile = await getProfile(db);
    expect(profile).toBeDefined();
    expect(profile!.id).toBe('me');
    expect(profile!.displayName).toBe('');
    expect(profile!.activeXPSettingsId).toBe('standard');
  });

  test('seeds sync state with pendingSync false', async () => {
    const db = await openDB(`test-${crypto.randomUUID()}`);
    const state = await getSyncState(db);
    expect(state).toBeDefined();
    expect(state!.pendingSync).toBe(false);
  });
});
