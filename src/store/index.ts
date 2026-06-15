import { create } from 'zustand';
import { openDB, getAllChores, getAllCompletions, getAllQuestions, getXPSettings, getProfile, getSyncState, getPacks, putChore, putCompletion, putProfile, putSyncState, putQuestion, deleteQuestion, deleteChore, putPack, deleteCompletion, deletePack as dbDeletePack, getChoresByPack, getQuestions, getCompletionsByChore, getAllQuickAnswerSets, putQuickAnswerSet, deleteQuickAnswerSet as dbDeleteQuickAnswerSet } from '@/db';
import { titleToFilename } from '@/cdp/filename';
import { slugifyPackId } from '@/cdp/packId';
import { fetchCDP } from '@/cdp/cdp-import';
import { calculateXP } from '@/xp/calculator';
import { computeNewStreak } from '@/chores/streak';
import { recordCompletionWithTimestamp } from './recordCompletion';
import type { ChoreDisposition } from '@/types';
import type {
  Chore,
  Completion,
  MultiplierQuestion,
  Pack,
  PackManifest,
  Question,
  XPSettings,
  UserProfile,
  SyncState,
  Answer,
  QuickAnswerSet,
} from '@/types';
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import type { DraftQuestion } from '@/components/questions/QuestionFormFields';

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
  quickAnswerSets: QuickAnswerSet[];

  init: () => Promise<void>;
  reload: () => Promise<void>;
  addChore: (data: Omit<Chore, 'key' | 'choreId' | 'createdAt'>) => Promise<string>;
  updateChore: (chore: Chore) => Promise<void>;
  deactivateChore: (key: string) => Promise<void>;
  recordCompletion: (choreKey: string, answers?: Answer[]) => Promise<void>;
  updateProfile: (profile: UserProfile) => Promise<void>;
  updateSyncState: (state: SyncState) => Promise<void>;
  saveQuestions: (choreKey: string, drafts: DraftQuestion[]) => Promise<void>;
  importCDP: (baseUrl: string, startDateOffsetDays?: number) => Promise<void>;
  updateCDP: (packId: string) => Promise<void>;
  addPack: (name: string) => Promise<string>;
  renamePack: (packId: string, newTitle: string) => Promise<void>;
  updatePackDescription: (packId: string, description: string) => Promise<void>;
  updatePackManifest: (packId: string, changes: Partial<PackManifest>) => Promise<void>;
  deletePack: (packId: string, dispositions?: ChoreDisposition[]) => Promise<void>;
  saveQuickAnswerSet: (qas: QuickAnswerSet) => Promise<void>;
  removeQuickAnswerSet: (id: string) => Promise<void>;
  moveChore: (choreKey: string, targetPackId: string) => Promise<boolean>;
  duplicateChore: (choreKey: string, newTitle: string, targetPackId: string) => Promise<string>;
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
  quickAnswerSets: [],

  init: async () => {
    if (get().loaded) return;

    const db = await openDB();
    const [packs, chores, completions, questions, xpSettings, profile, syncState, quickAnswerSets] =
      await Promise.all([
        getPacks(db),
        getAllChores(db),
        getAllCompletions(db),
        getAllQuestions(db),
        getXPSettings(db),
        getProfile(db),
        getSyncState(db),
        getAllQuickAnswerSets(db),
      ]);

    set({ db, loaded: true, packs, chores, completions, questions, xpSettings, profile, syncState, quickAnswerSets });
  },

  reload: async () => {
    const { db } = get();
    if (!db) return;
    const [packs, chores, completions, questions, xpSettings, profile, syncState, quickAnswerSets] =
      await Promise.all([
        getPacks(db), getAllChores(db), getAllCompletions(db), getAllQuestions(db),
        getXPSettings(db), getProfile(db), getSyncState(db), getAllQuickAnswerSets(db),
      ]);
    set({ packs, chores, completions, questions, xpSettings, profile: profile ?? null, syncState: syncState ?? null, quickAnswerSets });
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
    return newChore.key;
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

    const chorePack = get().packs.find((p) => p.id === chore.packId);
    const packStreak = chorePack?.manifest.streak ?? true;

    const now = recordCompletionWithTimestamp(new Date());

    const activeSettingsId = profile?.activeXPSettingsId;
    const activeSettings =
      xpSettings.find((s) => s.id === activeSettingsId) ?? xpSettings[0];
    if (!activeSettings) throw new Error('No XP settings found');

    const choreCompletions = completions.filter((c) => c.choreKey === choreKey);

    const streak = packStreak ? computeNewStreak(chore, choreCompletions, now) : 0;
    const totalCompletions = choreCompletions.length;
    const { questions } = get();
    let xpEarned = calculateXP(chore.xpSize, streak, totalCompletions, activeSettings);
    const multiplierQ = questions.find(
      (q): q is MultiplierQuestion => q.choreKey === choreKey && q.type === 'MULTIPLIER',
    );
    if (multiplierQ) {
      const mulAnswer = answers.find((a) => a.questionId === multiplierQ.id);
      if (mulAnswer && typeof mulAnswer.value === 'number' && mulAnswer.value > 0) {
        xpEarned = Math.round(xpEarned * multiplierQ.xpPerUnit * mulAnswer.value);
      }
    }

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

  saveQuestions: async (choreKey, drafts) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');

    for (const q of drafts.filter((d) => d._deleted)) {
      await deleteQuestion(db, q.id);
    }

    const toSave = drafts
      .filter((d) => !d._deleted)
      .map(({ _isNew: _n, _deleted: _d, ...q }) => q as Question);
    for (const q of toSave) {
      await putQuestion(db, q);
    }

    const allQuestions = await getAllQuestions(db);
    set({ questions: allQuestions });
  },

  importCDP: async (baseUrl, startDateOffsetDays = 0) => {
    const { db } = get();
    if (!db) throw new Error('Database not initialised');
    const { pack, chores, questions } = await fetchCDP(baseUrl, startDateOffsetDays);
    await putPack(db, pack);
    for (const chore of chores) await putChore(db, chore);
    for (const question of questions) await putQuestion(db, question);
    const [updatedPacks, updatedChores, updatedQuestions] = await Promise.all([
      getPacks(db), getAllChores(db), getAllQuestions(db),
    ]);
    set({ packs: updatedPacks, chores: updatedChores, questions: updatedQuestions });
  },

  updateCDP: async (packId) => {
    const { db, packs } = get();
    if (!db) throw new Error('Database not initialised');
    const pack = packs.find((p) => p.id === packId);
    if (!pack) throw new Error(`Pack '${packId}' not found in store`);
    if (!pack.sourceUrl) throw new Error(`Pack '${packId}' has no sourceUrl — cannot update`);
    const { pack: updatedPack, chores: updatedChores, questions: updatedQuestions } = await fetchCDP(pack.sourceUrl);
    for (const chore of updatedChores) await putChore(db, chore);
    for (const question of updatedQuestions) await putQuestion(db, question);
    const refreshedPack: Pack = { ...updatedPack, importedAt: pack.importedAt, updatedAt: new Date().toISOString() };
    await putPack(db, refreshedPack);
    const [finalPacks, finalChores, finalQuestions] = await Promise.all([
      getPacks(db), getAllChores(db), getAllQuestions(db),
    ]);
    set({ packs: finalPacks, chores: finalChores, questions: finalQuestions });
  },

  addPack: async (name) => {
    const { db, packs } = get();
    if (!db) throw new Error('DB not initialised');

    const packId = slugifyPackId(name, packs.map((p) => p.id));
    const now = new Date().toISOString();
    const newPack: Pack = {
      id: packId,
      manifest: { title: name },
      isPersonal: false,
      importedAt: now,
      updatedAt: now,
    };

    await putPack(db, newPack);
    set((state) => ({ packs: [...state.packs, newPack] }));
    return packId;
  },

  renamePack: async (packId, newTitle) => {
    const { db, packs } = get();
    if (!db) throw new Error('DB not initialised');

    const pack = packs.find((p) => p.id === packId);
    if (!pack) throw new Error(`Pack '${packId}' not found`);
    const updated: Pack = {
      ...pack,
      manifest: { ...pack.manifest, title: newTitle },
      updatedAt: new Date().toISOString(),
    };

    await putPack(db, updated);
    set((state) => ({
      packs: state.packs.map((p) => (p.id === packId ? updated : p)),
    }));
  },

  updatePackDescription: async (packId, description) => {
    const { db, packs } = get();
    if (!db) throw new Error('DB not initialised');
    const pack = packs.find((p) => p.id === packId);
    if (!pack) throw new Error(`Pack '${packId}' not found`);
    const updated: Pack = {
      ...pack,
      manifest: { ...pack.manifest, description },
      updatedAt: new Date().toISOString(),
    };
    await putPack(db, updated);
    set((state) => ({
      packs: state.packs.map((p) => (p.id === packId ? updated : p)),
    }));
  },

  updatePackManifest: async (packId, changes) => {
    const { db, packs } = get();
    if (!db) throw new Error('DB not initialised');
    const pack = packs.find((p) => p.id === packId);
    if (!pack) throw new Error(`Pack '${packId}' not found`);
    const updated: Pack = {
      ...pack,
      manifest: { ...pack.manifest, ...changes },
      updatedAt: new Date().toISOString(),
    };
    await putPack(db, updated);
    set((state) => ({
      packs: state.packs.map((p) => (p.id === packId ? updated : p)),
    }));
  },

  deletePack: async (packId, dispositions = []) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');

    const pack = get().packs.find((p) => p.id === packId);
    if (!pack) throw new Error(`Pack '${packId}' not found`);
    if (pack.isPersonal) throw new Error('Cannot delete the personal pack');

    for (const d of dispositions) {
      if (d.action === 'delete') {
        const uuid = crypto.randomUUID();
        const choreCompletions = await getCompletionsByChore(db, d.choreKey);
        const choreQuestions = await getQuestions(db, d.choreKey);
        const tx = db.transaction(['chores', 'questions', 'completions'], 'readwrite');
        for (const c of choreCompletions) {
          await tx.objectStore('completions').put({ ...c, choreKey: uuid });
        }
        for (const q of choreQuestions) {
          await tx.objectStore('questions').delete(q.id);
        }
        await tx.objectStore('chores').delete(d.choreKey);
        await tx.done;
      } else if (d.action === 'move' && d.targetPackId && d.resolvedChoreId) {
        const chore = get().chores.find((c) => c.key === d.choreKey);
        if (!chore) continue;
        const newKey = `${d.targetPackId}/${d.resolvedChoreId}`;
        const choreQuestions = await getQuestions(db, d.choreKey);
        const choreCompletions = await getCompletionsByChore(db, d.choreKey);
        const newChore: Chore = {
          ...chore,
          key: newKey,
          choreId: d.resolvedChoreId,
          title: d.resolvedTitle ?? chore.title,
          packId: d.targetPackId,
        };
        const tx = db.transaction(['chores', 'questions', 'completions'], 'readwrite');
        await tx.objectStore('chores').delete(d.choreKey);
        await tx.objectStore('chores').put(newChore);
        for (const q of choreQuestions) {
          await tx.objectStore('questions').put({ ...q, choreKey: newKey });
        }
        for (const c of choreCompletions) {
          await tx.objectStore('completions').put({ ...c, choreKey: newKey });
        }
        await tx.done;
      }
    }

    await dbDeletePack(db, packId);

    const [updatedPacks, updatedChores, updatedQuestions, updatedCompletions] = await Promise.all([
      getPacks(db), getAllChores(db), getAllQuestions(db), getAllCompletions(db),
    ]);
    set({
      packs: updatedPacks,
      chores: updatedChores,
      questions: updatedQuestions,
      completions: updatedCompletions,
    });
  },

  saveQuickAnswerSet: async (qas) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');
    await putQuickAnswerSet(db, qas);
    set((state) => ({
      quickAnswerSets: [
        ...state.quickAnswerSets.filter((s) => s.id !== qas.id),
        qas,
      ],
    }));
  },

  removeQuickAnswerSet: async (id) => {
    const { db } = get();
    if (!db) throw new Error('DB not initialised');
    await dbDeleteQuickAnswerSet(db, id);
    set((state) => ({
      quickAnswerSets: state.quickAnswerSets.filter((s) => s.id !== id),
    }));
  },

  moveChore: async (choreKey, targetPackId) => {
    const { db, chores, questions, completions } = get();
    if (!db) throw new Error('DB not initialised');

    const chore = chores.find((c) => c.key === choreKey);
    if (!chore) throw new Error(`Chore not found: ${choreKey}`);

    const newKey = `${targetPackId}/${chore.choreId}`;
    if (chores.some((c) => c.key === newKey)) return false;

    const choreQuestions = questions.filter((q) => q.choreKey === choreKey);
    const choreCompletions = completions.filter((c) => c.choreKey === choreKey);
    const newChore: Chore = { ...chore, key: newKey, packId: targetPackId };

    const tx = db.transaction(['chores', 'questions', 'completions'], 'readwrite');
    await tx.objectStore('chores').delete(choreKey);
    await tx.objectStore('chores').put(newChore);
    for (const q of choreQuestions) {
      await tx.objectStore('questions').put({ ...q, choreKey: newKey });
    }
    for (const c of choreCompletions) {
      await tx.objectStore('completions').put({ ...c, choreKey: newKey });
    }
    await tx.done;

    set((state) => ({
      chores: state.chores.map((c) => (c.key === choreKey ? newChore : c)),
      questions: state.questions.map((q) =>
        q.choreKey === choreKey ? { ...q, choreKey: newKey } : q,
      ),
      completions: state.completions.map((c) =>
        c.choreKey === choreKey ? { ...c, choreKey: newKey } : c,
      ),
    }));

    return true;
  },

  duplicateChore: async (choreKey, newTitle, targetPackId) => {
    const { db, chores, questions } = get();
    if (!db) throw new Error('DB not initialised');

    const source = chores.find((c) => c.key === choreKey);
    if (!source) throw new Error(`Chore not found: ${choreKey}`);

    const newChoreId = titleToFilename(newTitle.trim());
    const newKey = `${targetPackId}/${newChoreId}`;

    if (chores.some((c) => c.key === newKey)) {
      throw new Error(`Chore ID "${newChoreId}" already exists in pack "${targetPackId}"`);
    }

    const newChore: Chore = {
      ...source,
      key: newKey,
      choreId: newChoreId,
      packId: targetPackId,
      title: newTitle.trim(),
      createdAt: new Date().toISOString(),
    };

    const sourceQuestions = questions.filter((q) => q.choreKey === choreKey);
    const newQuestions = sourceQuestions.map((q) => ({
      ...q,
      id: crypto.randomUUID(),
      choreKey: newKey,
    }));

    const tx = db.transaction(['chores', 'questions'], 'readwrite');
    await tx.objectStore('chores').put(newChore);
    for (const q of newQuestions) {
      await tx.objectStore('questions').put(q);
    }
    await tx.done;

    set((state) => ({
      chores: [...state.chores, newChore],
      questions: [...state.questions, ...newQuestions],
    }));

    return newKey;
  },
}));
