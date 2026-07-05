import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, test } from 'bun:test';
import { useAppStore } from './index';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

describe('addPack', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  test('creates pack with slugified ID and adds it to store', async () => {
    const packId = await useAppStore.getState().addPack('Evening Routines');
    expect(packId).toBe('evening-routines');
    const pack = useAppStore.getState().packs.find((p) => p.id === 'evening-routines');
    expect(pack).toBeDefined();
    expect(pack?.manifest.title).toBe('Evening Routines');
    expect(pack?.isPersonal).toBe(false);
  });

  test('appends numeric suffix on ID collision', async () => {
    await useAppStore.getState().addPack('Clash Pack');
    const id2 = await useAppStore.getState().addPack('Clash Pack');
    expect(id2).toBe('clash-pack-2');
    expect(
      useAppStore.getState().packs.filter((p) => p.id.startsWith('clash-pack'))
    ).toHaveLength(2);
  });
});

describe('renamePack', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  test('updates manifest.title in store', async () => {
    await useAppStore.getState().addPack('Old Name');
    await useAppStore.getState().renamePack('old-name', 'New Name');
    const pack = useAppStore.getState().packs.find((p) => p.id === 'old-name');
    expect(pack?.manifest.title).toBe('New Name');
  });
});

describe('deletePack', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  it('removes the pack, chores, and questions; rewrites completion choreKey to a UUID', async () => {
    const packId = await useAppStore.getState().addPack('Pack To Delete New');
    const choreKey = await useAppStore.getState().addChore({
      packId,
      title: 'Chore In Pack New',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    await useAppStore.getState().saveQuestions(choreKey, [{
      id: crypto.randomUUID(),
      choreKey,
      prompt: 'Test?',
      type: 'TEXT',
      required: false,
      order: 0,
      _isNew: true,
    } as DraftQuestion]);

    await useAppStore.getState().recordCompletion(choreKey, []);
    const completionBefore = useAppStore.getState().completions.find((c) => c.choreKey === choreKey)!;

    await useAppStore.getState().deletePack(packId, [
      { choreKey, action: 'delete' },
    ]);

    const state = useAppStore.getState();
    expect(state.packs.find((p) => p.id === packId)).toBeUndefined();
    expect(state.chores.find((c) => c.packId === packId)).toBeUndefined();
    expect(state.questions.find((q) => q.choreKey === choreKey)).toBeUndefined();

    const completionAfter = state.completions.find((c) => c.id === completionBefore.id);
    expect(completionAfter).toBeDefined();
    expect(completionAfter?.choreKey).not.toBe(choreKey);
    expect(completionAfter?.choreKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('moves chore to target pack when disposition is move', async () => {
    const sourcePackId = await useAppStore.getState().addPack('Source Pack');
    const targetPackId = await useAppStore.getState().addPack('Target Pack For Delete');
    const choreKey = await useAppStore.getState().addChore({
      packId: sourcePackId,
      title: 'Chore To Move',
      xpSize: 'S',
      recurrence: { frequency: 'daily', interval: 1, startDate: '2026-01-01', windowStartTime: '00:00' },
      repeatable: false,
      active: true,
    });

    await useAppStore.getState().deletePack(sourcePackId, [
      {
        choreKey,
        action: 'move',
        targetPackId,
        resolvedChoreId: 'chore-to-move',
        resolvedTitle: 'Chore To Move',
      },
    ]);

    const state = useAppStore.getState();
    expect(state.packs.find((p) => p.id === sourcePackId)).toBeUndefined();
    expect(state.chores.find((c) => c.key === choreKey)).toBeUndefined();
    const moved = state.chores.find((c) => c.key === `${targetPackId}/chore-to-move`);
    expect(moved).toBeDefined();
    expect(moved?.packId).toBe(targetPackId);
  });

  it('deletes empty pack immediately with no dispositions', async () => {
    const packId = await useAppStore.getState().addPack('Empty Pack');
    await useAppStore.getState().deletePack(packId);
    expect(useAppStore.getState().packs.find((p) => p.id === packId)).toBeUndefined();
  });

  it('throws when attempting to delete the personal pack', async () => {
    await expect(useAppStore.getState().deletePack('personal')).rejects.toThrow();
  });
});

describe('updatePackManifest', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  test('merges partial changes without wiping existing fields', async () => {
    const packId = await useAppStore.getState().addPack('Original Title');
    await useAppStore.getState().updatePackManifest(packId, { xpTarget: 500 });
    const pack = useAppStore.getState().packs.find((p) => p.id === packId);
    expect(pack?.manifest.xpTarget).toBe(500);
    expect(pack?.manifest.title).toBe('Original Title');
  });

  test('sets streak to false', async () => {
    const packId = await useAppStore.getState().addPack('Streak Pack');
    await useAppStore.getState().updatePackManifest(packId, { streak: false });
    const pack = useAppStore.getState().packs.find((p) => p.id === packId);
    expect(pack?.manifest.streak).toBe(false);
  });

  test('sets and then clears xpTarget', async () => {
    const packId = await useAppStore.getState().addPack('XP Pack');
    await useAppStore.getState().updatePackManifest(packId, { xpTarget: 1000 });
    let pack = useAppStore.getState().packs.find((p) => p.id === packId);
    expect(pack?.manifest.xpTarget).toBe(1000);

    await useAppStore.getState().updatePackManifest(packId, { xpTarget: undefined });
    pack = useAppStore.getState().packs.find((p) => p.id === packId);
    expect(pack?.manifest.xpTarget).toBeUndefined();
  });

  test('throws when pack not found', async () => {
    await expect(
      useAppStore.getState().updatePackManifest('nonexistent-pack', { xpTarget: 1 })
    ).rejects.toThrow();
  });
});

describe('importCDP — collision protection', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  it("refuses to overwrite the seeded personal pack when a CDP URL basename is 'personal'", async () => {
    const PACK_YAML = `title: "Attacker Pack"\nauthor: "Evil"\nlicense: "MIT"\nchores:\n  - make-bed.yaml`;
    const CHORE_YAML = `title: "Make Bed"\nxpSize: XS\nfrequency: daily\ninterval: 1`;

    const mockFetch = await import('bun:test').then((m) => m.mock);
    const originalFetch = global.fetch;

    let fetchCount = 0;
    global.fetch = mockFetch(async (url: string) => {
      if (url === 'https://attacker.example/routines/personal/__pack__.yaml') {
        return new Response(PACK_YAML, { status: 200 });
      }
      if (url === 'https://attacker.example/routines/personal/make-bed.yaml') {
        return new Response(CHORE_YAML, { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    }) as unknown as typeof fetch;

    const personalPackBefore = useAppStore.getState().packs.find((p) => p.id === 'personal');
    expect(personalPackBefore?.manifest.title).toBe('My Chores');
    expect(personalPackBefore?.isPersonal).toBe(true);
    expect(personalPackBefore?.sourceUrl).toBeUndefined();

    // Attempt to import a pack with a URL basename matching 'personal'
    await expect(
      useAppStore.getState().importCDP('https://attacker.example/routines/personal')
    ).rejects.toThrow(/already exists/i);

    // Verify the personal pack remains unchanged
    const personalPackAfter = useAppStore.getState().packs.find((p) => p.id === 'personal');
    expect(personalPackAfter?.manifest.title).toBe('My Chores');
    expect(personalPackAfter?.isPersonal).toBe(true);
    expect(personalPackAfter?.sourceUrl).toBeUndefined();

    global.fetch = originalFetch;
  });

  it('refuses to overwrite an already-imported CDP pack on repeat import (use Update instead)', async () => {
    const existingPackId = await useAppStore.getState().addPack('Existing Routines');

    const PACK_YAML = `title: "Attacker Pack"\nauthor: "Evil"\nlicense: "MIT"\nchores:\n  - chore.yaml`;
    const CHORE_YAML = `title: "Attacker Chore"\nxpSize: XS\nfrequency: daily\ninterval: 1`;

    const mockFetch = await import('bun:test').then((m) => m.mock);
    const originalFetch = global.fetch;

    global.fetch = mockFetch(async (url: string) => {
      if (url === 'https://attacker.example/anything/existing-routines/__pack__.yaml') {
        return new Response(PACK_YAML, { status: 200 });
      }
      if (url === 'https://attacker.example/anything/existing-routines/chore.yaml') {
        return new Response(CHORE_YAML, { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    }) as unknown as typeof fetch;

    const existingPackBefore = useAppStore.getState().packs.find((p) => p.id === existingPackId);
    expect(existingPackBefore?.manifest.title).toBe('Existing Routines');

    // Attempt to import a pack with URL basename matching an existing pack ID
    await expect(
      useAppStore.getState().importCDP('https://attacker.example/anything/existing-routines')
    ).rejects.toThrow(/already exists/i);

    // Verify the existing pack remains unchanged
    const existingPackAfter = useAppStore.getState().packs.find((p) => p.id === existingPackId);
    expect(existingPackAfter?.manifest.title).toBe('Existing Routines');
    expect(existingPackAfter?.sourceUrl).toBeUndefined();

    global.fetch = originalFetch;
  });
});

describe('updateCDP — id consistency', () => {
  beforeAll(async () => {
    await useAppStore.getState().init();
  });

  it('refuses to overwrite the seeded personal pack when a stored sourceUrl basename mismatches the pack id', async () => {
    const PACK_YAML = `title: "Attacker Pack"\nauthor: "Evil"\nlicense: "MIT"\nchores:\n  - make-bed.yaml`;
    const CHORE_YAML = `title: "Make Bed"\nxpSize: XS\nfrequency: daily\ninterval: 1`;

    const mockFetch = await import('bun:test').then((m) => m.mock);
    const originalFetch = global.fetch;

    // Mock fetch to return attacker content when fetching from the attacker URL
    global.fetch = mockFetch(async (url: string) => {
      if (url === 'https://attacker.example/routines/personal/__pack__.yaml') {
        return new Response(PACK_YAML, { status: 200 });
      }
      if (url === 'https://attacker.example/routines/personal/make-bed.yaml') {
        return new Response(CHORE_YAML, { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    }) as unknown as typeof fetch;

    // Get the database from the store
    const { db } = useAppStore.getState();
    if (!db) throw new Error('Database not initialised');

    // Plant a pack with mismatched id and sourceUrl (mimicking a crafted backup)
    const plantedPack = {
      id: 'evening-routines',
      manifest: { title: 'Evening Routines' },
      isPersonal: false,
      sourceUrl: 'https://attacker.example/routines/personal',
      importedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.put('packs', plantedPack);

    // Reload the store to pick up the planted pack
    const { getPacks } = await import('@/db/index');
    const updatedPacks = await getPacks(db);
    useAppStore.setState({ packs: updatedPacks });

    // Verify the personal pack is still intact before the update attempt
    const personalPackBefore = useAppStore.getState().packs.find((p) => p.id === 'personal');
    expect(personalPackBefore?.manifest.title).toBe('My Chores');
    expect(personalPackBefore?.isPersonal).toBe(true);
    expect(personalPackBefore?.sourceUrl).toBeUndefined();

    // Attempt to update the planted pack; this should fail because the sourceUrl
    // basename 'personal' does not match the pack id 'evening-routines'
    await expect(
      useAppStore.getState().updateCDP('evening-routines')
    ).rejects.toThrow(/does not match/i);

    // Verify the personal pack remains unchanged
    const personalPackAfter = useAppStore.getState().packs.find((p) => p.id === 'personal');
    expect(personalPackAfter?.manifest.title).toBe('My Chores');
    expect(personalPackAfter?.isPersonal).toBe(true);
    expect(personalPackAfter?.sourceUrl).toBeUndefined();

    global.fetch = originalFetch;
  });
});
