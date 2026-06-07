// src/db/index.ts
import { openDB as idbOpen, type IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from './schema';
import { seed } from './seed';
import type {
  Pack, Chore, Question, Completion,
  XPSettings, UserProfile, SyncState, QuickAnswerSet,
} from '@/types';

const DB_NAME = 'tasks-harmony';
const DB_VERSION = 3;

export function migrateXpPerUnit(xpPerUnit: number): number {
  return xpPerUnit < 1 ? 1 / Math.round(1 / xpPerUnit) : xpPerUnit;
}

export async function openDB(
  name = DB_NAME,
): Promise<IDBPDatabase<TasksHarmonyDB>> {
  const db = await idbOpen<TasksHarmonyDB>(name, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        db.createObjectStore('packs', { keyPath: 'id' });

        const chores = db.createObjectStore('chores', { keyPath: 'key' });
        chores.createIndex('by-pack', 'packId');

        const questions = db.createObjectStore('questions', { keyPath: 'id' });
        questions.createIndex('by-chore', 'choreKey');

        const completions = db.createObjectStore('completions', { keyPath: 'id' });
        completions.createIndex('by-chore', 'choreKey');
        completions.createIndex('by-date', 'completedAt');

        db.createObjectStore('xpSettings', { keyPath: 'id' });
        db.createObjectStore('profile', { keyPath: 'id' });
        db.createObjectStore('syncState', { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        const qas = db.createObjectStore('quickAnswerSets', { keyPath: 'id' });
        qas.createIndex('by-chore', 'choreKey');
      }
      if (oldVersion < 3) {
        const migrationPromise = (async () => {
          const store = transaction.objectStore('questions');
          const questions = await store.getAll();
          for (const q of questions) {
            if ((q as unknown as { type: string }).type === 'MULTIPLIER') {
              const mq = q as unknown as { xpPerUnit: number; [key: string]: unknown };
              await store.put({ ...mq, xpPerUnit: migrateXpPerUnit(mq.xpPerUnit) } as unknown as Question);
            }
          }
        })();
        migrationPromise.catch(() => transaction.abort());
      }
    },
  });
  await seed(db);
  return db;
}

export const getPacks = (db: IDBPDatabase<TasksHarmonyDB>): Promise<Pack[]> =>
  db.getAll('packs');

export const getAllChores = (db: IDBPDatabase<TasksHarmonyDB>): Promise<Chore[]> =>
  db.getAll('chores');

export const getChoresByPack = (
  db: IDBPDatabase<TasksHarmonyDB>,
  packId: string,
): Promise<Chore[]> =>
  db.getAllFromIndex('chores', 'by-pack', packId);

export const getChore = (
  db: IDBPDatabase<TasksHarmonyDB>,
  key: string,
): Promise<Chore | undefined> =>
  db.get('chores', key);

export const getQuestions = (
  db: IDBPDatabase<TasksHarmonyDB>,
  choreKey: string,
): Promise<Question[]> =>
  db.getAllFromIndex('questions', 'by-chore', choreKey);

export const getAllQuestions = (db: IDBPDatabase<TasksHarmonyDB>): Promise<Question[]> =>
  db.getAll('questions');

export const getAllCompletions = (db: IDBPDatabase<TasksHarmonyDB>): Promise<Completion[]> =>
  db.getAll('completions');

export const getCompletionsByChore = (
  db: IDBPDatabase<TasksHarmonyDB>,
  choreKey: string,
): Promise<Completion[]> =>
  db.getAllFromIndex('completions', 'by-chore', choreKey);

export const getXPSettings = (db: IDBPDatabase<TasksHarmonyDB>): Promise<XPSettings[]> =>
  db.getAll('xpSettings');

export const getXPSettingsById = (
  db: IDBPDatabase<TasksHarmonyDB>,
  id: string,
): Promise<XPSettings | undefined> =>
  db.get('xpSettings', id);

export const getProfile = (
  db: IDBPDatabase<TasksHarmonyDB>,
): Promise<UserProfile | undefined> =>
  db.get('profile', 'me');

export const getSyncState = (
  db: IDBPDatabase<TasksHarmonyDB>,
): Promise<SyncState | undefined> =>
  db.get('syncState', 'main');

export const putPack = (db: IDBPDatabase<TasksHarmonyDB>, pack: Pack): Promise<string> =>
  db.put('packs', pack);

export const putChore = (db: IDBPDatabase<TasksHarmonyDB>, chore: Chore): Promise<string> =>
  db.put('chores', chore);

export const putQuestion = (
  db: IDBPDatabase<TasksHarmonyDB>,
  question: Question,
): Promise<string> =>
  db.put('questions', question);

export const putCompletion = (
  db: IDBPDatabase<TasksHarmonyDB>,
  completion: Completion,
): Promise<string> =>
  db.put('completions', completion);

export const putXPSettings = (
  db: IDBPDatabase<TasksHarmonyDB>,
  settings: XPSettings,
): Promise<string> =>
  db.put('xpSettings', settings);

export const putProfile = (
  db: IDBPDatabase<TasksHarmonyDB>,
  profile: UserProfile,
): Promise<string> =>
  db.put('profile', profile);

export const putSyncState = (
  db: IDBPDatabase<TasksHarmonyDB>,
  state: SyncState,
): Promise<string> =>
  db.put('syncState', state);

export const deleteChore = (
  db: IDBPDatabase<TasksHarmonyDB>,
  key: string,
): Promise<void> =>
  db.delete('chores', key);

export const deleteQuestion = (
  db: IDBPDatabase<TasksHarmonyDB>,
  id: string,
): Promise<void> =>
  db.delete('questions', id);

export const deleteCompletion = (
  db: IDBPDatabase<TasksHarmonyDB>,
  id: string,
): Promise<void> =>
  db.delete('completions', id);

export const deletePack = (
  db: IDBPDatabase<TasksHarmonyDB>,
  id: string,
): Promise<void> =>
  db.delete('packs', id);

export const getAllQuickAnswerSets = (
  db: IDBPDatabase<TasksHarmonyDB>,
): Promise<QuickAnswerSet[]> =>
  db.getAll('quickAnswerSets');

export const getQuickAnswerSetsByChore = (
  db: IDBPDatabase<TasksHarmonyDB>,
  choreKey: string,
): Promise<QuickAnswerSet[]> =>
  db.getAllFromIndex('quickAnswerSets', 'by-chore', choreKey);

export const putQuickAnswerSet = (
  db: IDBPDatabase<TasksHarmonyDB>,
  qas: QuickAnswerSet,
): Promise<string> =>
  db.put('quickAnswerSets', qas);

export const deleteQuickAnswerSet = (
  db: IDBPDatabase<TasksHarmonyDB>,
  id: string,
): Promise<void> =>
  db.delete('quickAnswerSets', id);
