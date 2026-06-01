import { create } from 'zustand';
import { openDB, getAllChores, getAllCompletions, getAllQuestions, getXPSettings, getProfile, getSyncState, getPacks, putChore, putCompletion, putProfile, putSyncState } from '@/db';
import { titleToFilename } from '@/cdp/filename';
import { calculateXP } from '@/xp/calculator';
import { computeNewStreak } from '@/chores/streak';
import type {
  Chore,
  Completion,
  Pack,
  Question,
  XPSettings,
  UserProfile,
  SyncState,
  Answer,
} from '@/types';
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';

interface AppState {
  db: IDBPDatabase<TasksHarmonyDB> | null;
  loaded: boolean;
  packs: Pack[];
  chores: Chore[];
  completions: Completion[];
  questions: Question[];
  xpSettings: XPSettings[];
  profile: UserProfile | null;
  syncState: SyncState | null;

  init: () => Promise<void>;
  addChore: (data: Omit<Chore, 'key' | 'choreId' | 'createdAt'>) => Promise<void>;
  updateChore: (chore: Chore) => Promise<void>;
  deactivateChore: (key: string) => Promise<void>;
  recordCompletion: (choreKey: string, answers?: Answer[]) => Promise<void>;
  updateProfile: (profile: UserProfile) => Promise<void>;
  updateSyncState: (state: SyncState) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  db: null,
  loaded: false,
  packs: [],
  chores: [],
  completions: [],
  questions: [],
  xpSettings: [],
  profile: null,
  syncState: null,

  init: async () => {
    if (get().loaded) return;

    const db = await openDB();
    const [packs, chores, completions, questions, xpSettings, profile, syncState] =
      await Promise.all([
        getPacks(db),
        getAllChores(db),
        getAllCompletions(db),
        getAllQuestions(db),
        getXPSettings(db),
        getProfile(db),
        getSyncState(db),
      ]);

    set({ db, loaded: true, packs, chores, completions, questions, xpSettings, profile, syncState });
  },

  addChore: async (data) => {
    const { db, chores } = get();
    if (!db) throw new Error('DB not initialised');

    const baseId = titleToFilename(data.title);
    const existingIds = new Set(
      chores.filter((c) => c.packId === data.packId).map((c) => c.choreId),
    );

    let choreId = baseId;
    let counter = 1;
    while (existingIds.has(choreId)) {
      choreId = `${baseId}-${counter}`;
      counter++;
    }

    const newChore: Chore = {
      ...data,
      choreId,
      key: `${data.packId}/${choreId}`,
      createdAt: new Date().toISOString(),
    };

    await putChore(db, newChore);
    set((state) => ({ chores: [...state.chores, newChore] }));
  },

  updateChore: async (chore) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');

    await putChore(db, chore);
    set((state) => ({
      chores: state.chores.map((c) => (c.key === chore.key ? chore : c)),
    }));
  },

  deactivateChore: async (key) => {
    const { db, chores } = get();
    if (!db) throw new Error('DB not initialised');

    const chore = chores.find((c) => c.key === key);
    if (!chore) return;

    const deactivated: Chore = { ...chore, active: false };
    await putChore(db, deactivated);
    set((state) => ({
      chores: state.chores.map((c) => (c.key === key ? deactivated : c)),
    }));
  },

  recordCompletion: async (choreKey, answers = []) => {
    const { db, chores, completions, xpSettings, profile } = get();
    if (!db) throw new Error('DB not initialised');

    const chore = chores.find((c) => c.key === choreKey);
    if (!chore) throw new Error(`Chore not found: ${choreKey}`);

    const now = new Date();

    const activeSettingsId = profile?.activeXPSettingsId;
    const activeSettings =
      xpSettings.find((s) => s.id === activeSettingsId) ?? xpSettings[0];
    if (!activeSettings) throw new Error('No XP settings found');

    const choreCompletions = completions.filter((c) => c.choreKey === choreKey);

    const streak = computeNewStreak(chore, choreCompletions, now);
    const totalCompletions = choreCompletions.length;
    const xpEarned = calculateXP(chore.xpSize, streak, totalCompletions, activeSettings);

    const newCompletion: Completion = {
      id: crypto.randomUUID(),
      choreKey,
      completedAt: now.toISOString(),
      xpEarned,
      streak,
      answers,
    };

    await putCompletion(db, newCompletion);
    set((state) => ({ completions: [...state.completions, newCompletion] }));
  },

  updateProfile: async (profile) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');

    await putProfile(db, profile);
    set({ profile });
  },

  updateSyncState: async (state) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');

    await putSyncState(db, state);
    set({ syncState: state });
  },
}));
