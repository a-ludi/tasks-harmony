export type XPSize = 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';
export type DuePeriodUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
export type ChoreStatus = 'overdue' | 'due' | 'completed' | 'upcoming';
export type ChoreSyncStatus = 'in-sync' | 'out-of-sync';

export interface DuePeriod {
  value: number;
  unit: DuePeriodUnit;
}

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

export interface TextQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  type: 'TEXT';
  regexPattern?: string;
}
export interface IntegerQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  type: 'INTEGER';
  minValue?: number;
  maxValue?: number;
}
export interface BooleanQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  type: 'BOOLEAN';
}
export interface EnumQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  type: 'ENUM';
  choices?: EnumChoice[];
}
export interface MultiplierQuestion {
  id: string; choreKey: string; prompt: string; required: boolean; order: number;
  type: 'MULTIPLIER';
  xpPerUnit: number;
  multiplierAnswerType: 'integer' | 'float';
}
export type Question = TextQuestion | IntegerQuestion | BooleanQuestion | EnumQuestion | MultiplierQuestion;
export type QuestionType = Question['type'];

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
  duePeriod?: DuePeriod;   // if set, chore shows as upcoming until this long before window end
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
  streak?: boolean;         // default true; false disables streak mechanics for all chores
  xpTarget?: number;        // total XP goal for the pack
  targetDate?: string;      // ISO date 'YYYY-MM-DD'
  allowShiftOnImport?: boolean; // default false; when true, import dialog offers date shifting
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
  lastSyncedAt?: string;
  pendingSync: boolean;
}

export interface QuickAnswerSet {
  id: string;
  choreKey: string;
  label: string;
  answers: Answer[];
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

export interface ChoreDisposition {
  choreKey: string;
  action: 'delete' | 'move';
  targetPackId?: string;
  resolvedChoreId?: string;
  resolvedTitle?: string;
}
