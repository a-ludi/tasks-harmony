import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store';
import { performSync, buildConflictUrl } from '@/sync/sync';
import { pullState, pushConflictCopy } from '@/sync/webdav';
import { importAppState } from '@/sync/import';
import { buildConflictSuffix } from '@/sync/state';
import { ConflictDialog } from './ConflictDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ConflictInfo } from '@/sync/sync';
import type { ConflictChoice } from './ConflictDialog';
import type { SyncState } from '@/types';

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
}

export function SyncButton() {
  const syncState = useAppStore((s) => s.syncState);
  const updateSyncState = useAppStore((s) => s.updateSyncState);
  const reload = useAppStore((s) => s.reload);
  const db = useAppStore((s) => s.db);

  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webdavInput, setWebdavInput] = useState(syncState?.webdavUrl ?? '');
  const [showUrlInput, setShowUrlInput] = useState(!syncState?.webdavUrl);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const pendingConflictRef = useRef<ConflictInfo | null>(null);
  const syncStateRef = useRef(syncState);
  useEffect(() => { syncStateRef.current = syncState; }, [syncState]);

  // syncState not yet loaded
  if (!syncState) return null;

  async function triggerSync(state: SyncState) {
    if (!db) return;
    setSyncing(true);
    setError(null);
    try {
      const updated = await performSync(db, state, (info) => {
        pendingConflictRef.current = info;
        setConflict(info);
      });
      updateSyncState(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error during sync');
    } finally {
      setSyncing(false);
    }
  }

  async function handleConflictResolve(choice: ConflictChoice) {
    const info = pendingConflictRef.current;
    setConflict(null);
    pendingConflictRef.current = null;
    if (!db || !info || !syncStateRef.current?.webdavUrl) return;

    if (choice === 'local') {
      await triggerSync({ ...syncStateRef.current, id: 'main', serverEtag: undefined });
    } else if (choice === 'remote') {
      try {
        setSyncing(true);
        const remote = await pullState(syncStateRef.current.webdavUrl);
        if (remote) {
          await importAppState(db, remote);
          await reload();
          updateSyncState({
            ...syncStateRef.current,
            serverEtag: info.serverEtag,
            lastSyncedAt: new Date().toISOString(),
            pendingSync: false,
          });
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to pull remote state');
      } finally {
        setSyncing(false);
      }
    } else {
      try {
        setSyncing(true);
        const suffix = buildConflictSuffix(info.detectedAt);
        await pushConflictCopy(syncStateRef.current.webdavUrl, info.localState, suffix);
        const conflictUrl = buildConflictUrl(syncStateRef.current.webdavUrl, info.detectedAt);
        setError(`Conflict copy saved to: ${conflictUrl}. Inspect both files on the server, delete the conflict file, and sync again when ready.`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to write conflict file');
      } finally {
        setSyncing(false);
      }
    }
  }

  function handleSaveUrl() {
    const trimmed = webdavInput.trim();
    if (!trimmed || !syncStateRef.current) return;
    updateSyncState({ ...syncStateRef.current, id: 'main', webdavUrl: trimmed });
    setShowUrlInput(false);
  }

  if (!syncState.webdavUrl || showUrlInput) {
    return (
      <div className="space-y-2">
        <Input type="url" value={webdavInput} onChange={(e) => setWebdavInput(e.target.value)}
          placeholder="https://dav.example.com/.../state.json" aria-label="WebDAV state.json URL" />
        <Button onClick={handleSaveUrl} className="w-full">Save</Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => triggerSync(syncState)} disabled={syncing} aria-label="Sync now" className="flex items-center gap-1.5">
          <svg className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.13-3.13M20 15a9 9 0 01-14.13 3.13" />
          </svg>
          <span>{syncing ? 'Syncing…' : 'Sync'}</span>
        </Button>
        {syncState.pendingSync && !syncing && <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">Pending</span>}
        <span className="text-xs text-muted-foreground hidden sm:inline">{formatRelativeTime(syncState.lastSyncedAt)}</span>
        <button onClick={() => setShowUrlInput(true)} className="text-xs text-muted-foreground hover:text-foreground underline" aria-label="Configure WebDAV URL">Configure</button>
      </div>
      {error && (
        <p className="mt-1 text-xs text-destructive" role="alert">{error}{' '}
          <button onClick={() => setError(null)} className="underline hover:no-underline">Dismiss</button>
        </p>
      )}
      {conflict && (
        <ConflictDialog localState={conflict.localState} serverEtag={conflict.serverEtag} serverTimestamp={conflict.serverTimestamp}
          onResolve={handleConflictResolve} onClose={() => { setConflict(null); pendingConflictRef.current = null; }} />
      )}
    </>
  );
}
