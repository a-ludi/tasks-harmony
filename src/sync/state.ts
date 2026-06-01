import type { SyncState } from '@/types';

export function canSync(state: SyncState): boolean {
  return !!state.webdavUrl;
}

export function needsConflictResolution(state: SyncState, currentServerEtag: string): boolean {
  if (!state.serverEtag) return false;
  return state.serverEtag !== currentServerEtag;
}

export function buildConflictSuffix(isoDatetime: string): string {
  return `_conflict_${isoDatetime.slice(0, 10)}`;
}
