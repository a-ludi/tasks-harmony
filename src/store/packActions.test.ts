import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, test } from 'bun:test';
import { useAppStore } from './index';

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
