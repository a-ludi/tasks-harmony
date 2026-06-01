// src/db/seed.ts
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from './schema';

export async function seed(db: IDBPDatabase<TasksHarmonyDB>): Promise<void> {
  const tx = db.transaction(
    ['packs', 'xpSettings', 'profile', 'syncState'],
    'readwrite',
  );
  const packs     = tx.objectStore('packs');
  const settings  = tx.objectStore('xpSettings');
  const profile   = tx.objectStore('profile');
  const syncStore = tx.objectStore('syncState');

  if (!(await packs.get('personal'))) {
    await packs.put({
      id: 'personal',
      manifest: { title: 'My Chores' },
      isPersonal: true,
      importedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
  }

  if (!(await settings.get('standard'))) {
    await settings.put({
      id: 'standard',
      name: 'Standard',
      maxStreakMultiplier: 2,
      decayFloor: 0.5,
      streakHalfLife: 7,
      decayHalfLife: 56,
    });
    await settings.put({
      id: 'hard',
      name: 'Hard Mode',
      maxStreakMultiplier: 2.5,
      decayFloor: 0.4,
      streakHalfLife: 14,
      decayHalfLife: 56,
    });
  }

  if (!(await profile.get('me'))) {
    await profile.put({
      id: 'me',
      displayName: '',
      email: '',
      activeXPSettingsId: 'standard',
    });
  }

  if (!(await syncStore.get('main'))) {
    await syncStore.put({ id: 'main', pendingSync: false });
  }

  await tx.done;
}
