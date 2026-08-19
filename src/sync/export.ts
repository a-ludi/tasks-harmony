import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import {
  getPacks, getAllChores, getAllQuestions, getAllCompletions,
  getXPSettings, getProfile, getSyncState, getAllQuickAnswerSets, getAllTargets,
  getCredentials,
} from '@/db/index';
import type { AppState } from '@/types';
import { isLegacyCredentials } from '@/sync/credentials';
import { encryptState, encryptStatePQ } from '@/sync/encrypt';

export async function exportAppState(db: IDBPDatabase<TasksHarmonyDB>): Promise<AppState> {
  const [packs, chores, questions, completions, xpSettings, profile, syncState, quickAnswerSets, targets] =
    await Promise.all([
      getPacks(db), getAllChores(db), getAllQuestions(db), getAllCompletions(db),
      getXPSettings(db), getProfile(db), getSyncState(db), getAllQuickAnswerSets(db), getAllTargets(db),
    ]);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    packs, chores, questions, completions, xpSettings,
    quickAnswerSets,
    targets,
    profile: profile!,
    syncState: syncState!,
  };
}

export async function encryptedExport(db: IDBPDatabase<TasksHarmonyDB>): Promise<Uint8Array> {
  const creds = await getCredentials(db);
  if (!creds) throw new Error('No sync credentials found. Cannot create encrypted backup.');
  const state = await exportAppState(db);
  if (isLegacyCredentials(creds)) {
    return encryptState(creds.cryptoKey, state);
  }
  return encryptStatePQ(creds, state);
}
