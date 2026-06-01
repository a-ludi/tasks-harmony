// src/db/schema.ts
import type { DBSchema } from 'idb';
import type {
  Pack, Chore, Question, Completion,
  XPSettings, UserProfile, SyncState,
} from '@/types';

export interface TasksHarmonyDB extends DBSchema {
  packs:       { key: string; value: Pack };
  chores:      { key: string; value: Chore; indexes: { 'by-pack': string } };
  questions:   { key: string; value: Question; indexes: { 'by-chore': string } };
  completions: { key: string; value: Completion; indexes: { 'by-chore': string; 'by-date': string } };
  xpSettings:  { key: string; value: XPSettings };
  profile:     { key: string; value: UserProfile };
  syncState:   { key: string; value: SyncState };
}
