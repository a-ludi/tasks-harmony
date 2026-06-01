import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import type { AppState } from '@/types';

export async function importAppState(db: IDBPDatabase<TasksHarmonyDB>, state: AppState): Promise<void> {
  const storeNames = ['packs', 'chores', 'questions', 'completions', 'xpSettings', 'profile', 'syncState'] as const;
  const tx = db.transaction(storeNames, 'readwrite');

  // Clear all stores first
  await Promise.all(storeNames.map((name) => tx.objectStore(name).clear()));

  // Write all data
  await Promise.all([
    ...state.packs.map((p) => tx.objectStore('packs').put(p)),
    ...state.chores.map((c) => tx.objectStore('chores').put(c)),
    ...state.questions.map((q) => tx.objectStore('questions').put(q)),
    ...state.completions.map((c) => tx.objectStore('completions').put(c)),
    ...state.xpSettings.map((s) => tx.objectStore('xpSettings').put(s)),
    tx.objectStore('profile').put(state.profile),
    tx.objectStore('syncState').put(state.syncState),
  ]);

  await tx.done;
}
