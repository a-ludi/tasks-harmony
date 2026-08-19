import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import type { AppState } from '@/types';
import { isLegacyCredentials } from '@/sync/credentials';
import { getCredentials } from '@/db';
import { decryptState, decryptStatePQ } from '@/sync/encrypt';

export async function importAppState(db: IDBPDatabase<TasksHarmonyDB>, state: AppState): Promise<void> {
  const storeNames = [
    'packs', 'chores', 'questions', 'completions',
    'xpSettings', 'profile', 'syncState', 'quickAnswerSets', 'targets',
  ] as const;
  const tx = db.transaction(storeNames, 'readwrite');

  await Promise.all(storeNames.map((name) => tx.objectStore(name).clear()));

  await Promise.all([
    ...state.packs.map((p) => tx.objectStore('packs').put(p)),
    ...state.chores.map((c) => tx.objectStore('chores').put(c)),
    ...state.questions.map((q) => tx.objectStore('questions').put(q)),
    ...state.completions.map((c) => tx.objectStore('completions').put(c)),
    ...state.xpSettings.map((s) => tx.objectStore('xpSettings').put(s)),
    ...(state.quickAnswerSets ?? []).map((q) => tx.objectStore('quickAnswerSets').put(q)),
    ...(state.targets ?? []).map((t) => tx.objectStore('targets').put(t)),
    tx.objectStore('profile').put(state.profile),
    tx.objectStore('syncState').put(state.syncState),
  ]);

  await tx.done;
}

export async function decryptedImport(
  db: IDBPDatabase<TasksHarmonyDB>,
  blob: Uint8Array,
): Promise<AppState> {
  const creds = await getCredentials(db);
  if (!creds) throw new Error('No sync credentials found. Cannot decrypt backup.');
  if (isLegacyCredentials(creds)) {
    return decryptState(creds.cryptoKey, blob);
  }
  return decryptStatePQ(creds, blob);
}
