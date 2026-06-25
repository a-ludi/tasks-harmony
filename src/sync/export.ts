import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import {
  getPacks, getAllChores, getAllQuestions, getAllCompletions,
  getXPSettings, getProfile, getSyncState, getAllQuickAnswerSets,
} from '@/db/index';
import type { AppState } from '@/types';
import { getOrCreateSyncKey } from '@/sync/credentials';
import { encryptState } from '@/sync/encrypt';

export async function exportAppState(db: IDBPDatabase<TasksHarmonyDB>): Promise<AppState> {
  const [packs, chores, questions, completions, xpSettings, profile, syncState, quickAnswerSets] =
    await Promise.all([
      getPacks(db), getAllChores(db), getAllQuestions(db), getAllCompletions(db),
      getXPSettings(db), getProfile(db), getSyncState(db), getAllQuickAnswerSets(db),
    ]);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    packs, chores, questions, completions, xpSettings,
    quickAnswerSets,
    profile: profile!,
    syncState: syncState!,
  };
}

export async function encryptedExport(db: IDBPDatabase<TasksHarmonyDB>): Promise<Uint8Array> {
  const key = await getOrCreateSyncKey(db);
  const state = await exportAppState(db);
  return encryptState(key, state);
}
