import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import type { AppState } from '@/types';

export async function importAppState(db: IDBPDatabase<TasksHarmonyDB>, state: AppState): Promise<void> {
  const storeNames = ['packs', 'chores', 'questions', 'completions', 'xpSettings', 'profile', 'syncState'] as const;
  for (const name of storeNames) {
    const tx = db.transaction(name, 'readwrite');
    await tx.store.clear();
    await tx.done;
  }
  await Promise.all([
    ...state.packs.map((p) => db.put('packs', p)),
    ...state.chores.map((c) => db.put('chores', c)),
    ...state.questions.map((q) => db.put('questions', q)),
    ...state.completions.map((c) => db.put('completions', c)),
    ...state.xpSettings.map((s) => db.put('xpSettings', s)),
    db.put('profile', state.profile),
    db.put('syncState', state.syncState),
  ]);
}
