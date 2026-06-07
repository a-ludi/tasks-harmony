// src/db/index.test.ts
import 'fake-indexeddb/auto';
import { describe, expect, it, test } from 'bun:test';
import { openDB, getPacks, getProfile, getXPSettings, getSyncState, migrateXpPerUnit } from './index';

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

describe('migrateXpPerUnit', () => {
  it('leaves xpPerUnit = 1 unchanged', () => {
    expect(migrateXpPerUnit(1)).toBe(1);
  });

  it('leaves xpPerUnit > 1 unchanged', () => {
    expect(migrateXpPerUnit(2)).toBe(2);
    expect(migrateXpPerUnit(1.5)).toBe(1.5);
  });

  it('converts xpPerUnit = 0.5 to 1/round(2) = 0.5 (unchanged, already exact)', () => {
    expect(migrateXpPerUnit(0.5)).toBeCloseTo(0.5);
  });

  it('converts xpPerUnit = 0.25 to 1/round(4) = 0.25 (unchanged, already exact)', () => {
    expect(migrateXpPerUnit(0.25)).toBeCloseTo(0.25);
  });

  it('rounds 0.4 to nearest integer factor: round(1/0.4)=round(2.5)=3, result=1/3', () => {
    expect(migrateXpPerUnit(0.4)).toBeCloseTo(1 / 3);
  });

  it('rounds 0.9 to nearest integer factor: round(1/0.9)=round(1.11)=1, result=1', () => {
    expect(migrateXpPerUnit(0.9)).toBeCloseTo(1);
  });
});
