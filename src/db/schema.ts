// src/db/schema.ts
import type { DBSchema } from 'idb';
import type {
  Pack, Chore, Question, Completion,
  XPSettings, UserProfile, SyncState, QuickAnswerSet,
} from '@/types';

export interface LegacySyncCredentials {
  id: 'main';
  cryptoKey: CryptoKey;
}

export interface PQSyncCredentials {
  id: 'main';
  version: 2;
  mlkemPublicKey: Uint8Array;
  mlkemPrivateKey: Uint8Array;
  mldsaPublicKey: Uint8Array;
  mldsaPrivateKey: Uint8Array;
}

export type SyncCredentials = LegacySyncCredentials | PQSyncCredentials;

export interface TasksHarmonyDB extends DBSchema {
  packs:           { key: string; value: Pack };
  chores:          { key: string; value: Chore; indexes: { 'by-pack': string } };
  questions:       { key: string; value: Question; indexes: { 'by-chore': string } };
  completions:     { key: string; value: Completion; indexes: { 'by-chore': string; 'by-date': string } };
  xpSettings:      { key: string; value: XPSettings };
  profile:         { key: string; value: UserProfile };
  syncState:       { key: string; value: SyncState };
  quickAnswerSets: { key: string; value: QuickAnswerSet; indexes: { 'by-chore': string } };
  credentials:     { key: string; value: SyncCredentials };
}
