import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import type { AppState, SyncState } from '@/types';
import { exportAppState } from '@/sync/export';
import { getServerEtag, pushState } from '@/sync/webdav';
import { canSync, needsConflictResolution } from '@/sync/state';

export interface ConflictInfo {
  localState: AppState;
  serverEtag: string;
  serverTimestamp?: string;
  detectedAt: string;
}

export async function performSync(
  db: IDBPDatabase<TasksHarmonyDB>,
  syncState: SyncState,
  onConflict: (info: ConflictInfo) => void,
): Promise<SyncState> {
  if (!canSync(syncState)) return syncState;

  const url = syncState.webdavUrl!;
  const now = new Date().toISOString();
  const localState = await exportAppState(db);
  const serverEtag = await getServerEtag(url);

  if (serverEtag !== null && needsConflictResolution(syncState, serverEtag)) {
    onConflict({ localState, serverEtag, detectedAt: now });
    return syncState;
  }

  const result = await pushState(url, localState, syncState.serverEtag);
  if (!result.success) {
    onConflict({ localState, serverEtag: result.serverEtag, detectedAt: now });
    return syncState;
  }

  return { ...syncState, serverEtag: result.newEtag, lastSyncedAt: now, pendingSync: false };
}

export function buildConflictUrl(stateUrl: string, isoDatetime: string): string {
  const suffix = `_conflict_${isoDatetime.slice(0, 10)}`;
  return stateUrl.replace(/\.json$/, `${suffix}.json`);
}
