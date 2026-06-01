export type XPSize = 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL';
export type RecurrenceFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';
export type QuestionType = 'TEXT' | 'INTEGER' | 'BOOLEAN' | 'ENUM';
export type ChoreStatus = 'overdue' | 'due' | 'completed' | 'upcoming';
export type ChoreSyncStatus = 'in-sync' | 'out-of-sync';

export interface Recurrence {
  frequency: RecurrenceFrequency;
  interval: number;         // every N periods, >= 1
  startDate: string;        // 'YYYY-MM-DD'
  windowStartTime: string;  // 'HH:MM', default '00:00'; offsets window boundaries from midnight
}

export interface EnumChoice {
  id: string;
  label: string;
  order: number;
}

export interface Question {
  id: string;        // UUID
  choreKey: string;  // `${packId}/${choreId}` — matches Chore.key
  prompt: string;
  type: QuestionType;
  required: boolean;
  order: number;
  regexPattern?: string;   // TEXT only
  minValue?: number;       // INTEGER only
  maxValue?: number;       // INTEGER only
  choices?: EnumChoice[];  // ENUM only
}

export interface Chore {
  key: string;       // `${packId}/${choreId}` — DB primary key
  choreId: string;   // filename without .yaml (e.g. 'make-laundry')
  packId: string;
  title: string;
  description?: string;
  xpSize: XPSize;
  recurrence: Recurrence;
  repeatable: boolean;          // if true, multiple completions per window are allowed
  active: boolean;
  createdAt: string;            // ISO datetime
  syncStatus?: ChoreSyncStatus; // set after "Update from URL"; only present on URL-imported chores
}

export interface PackManifest {
  title: string;
  author?: string;
  license?: string;
  description?: string;
  revision?: string;
  revisionHistory?: string;
  cdpCreatedAt?: string;
}

export interface Pack {
  id: string;
  manifest: PackManifest;
  isPersonal: boolean;
  importedAt: string;
  updatedAt: string;
  sourceUrl?: string;
  aliasFor?: string;
}

export interface Answer {
  questionId: string;
  value: string | number | boolean | null;
}

export interface Completion {
  id: string;
  choreKey: string;
  completedAt: string;
  xpEarned: number;
  streak: number;
  answers: Answer[];
}

export interface XPSettings {
  id: string;
  name: string;
  maxStreakMultiplier: number;
  decayFloor: number;
  streakHalfLife: number;
  decayHalfLife: number;
}

export interface UserProfile {
  id: 'me';
  displayName: string;
  email: string;
  activeXPSettingsId: string;
}

export interface SyncState {
  id: 'main';
  webdavUrl?: string;
  serverEtag?: string;
  lastSyncedAt?: string;
  pendingSync: boolean;
}

export interface AppState {
  schemaVersion: 1;
  exportedAt: string;
  packs: Pack[];
  chores: Chore[];
  questions: Question[];
  completions: Completion[];
  xpSettings: XPSettings[];
  profile: UserProfile;
  syncState: SyncState;
}
