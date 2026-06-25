import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { push, pull } from '@/sync/server';
import { setDirtyListener, isDirty } from '@/sync/dirty';
import { getSyncState } from '@/db';

const DEBOUNCE_MS = 10_000;
const MAX_CONSECUTIVE_FAILURES = 3;

export interface SyncStatus {
  lastSyncedAt: string | undefined;
  error: boolean;
  retryNow: () => void;
}

export function useSync(): SyncStatus {
  const db = useAppStore((s) => s.db);
  const reload = useAppStore((s) => s.reload);
  const syncState = useAppStore((s) => s.syncState);
  const updateSyncState = useAppStore((s) => s.updateSyncState);

  const [error, setError] = useState(false);
  const consecutiveFailures = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function doPush() {
    if (!db) return;
    const result = await push(db);
    if (result.success) {
      consecutiveFailures.current = 0;
      setError(false);
      const updated = await getSyncState(db);
      if (updated) await updateSyncState(updated);
    } else {
      consecutiveFailures.current += 1;
      if (consecutiveFailures.current >= MAX_CONSECUTIVE_FAILURES) {
        setError(true);
      }
    }
  }

  function schedulePush() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (consecutiveFailures.current >= MAX_CONSECUTIVE_FAILURES) return;
    debounceRef.current = setTimeout(() => { void doPush(); }, DEBOUNCE_MS);
  }

  function retryNow() {
    consecutiveFailures.current = 0;
    setError(false);
    void doPush();
  }

  // Startup pull
  useEffect(() => {
    if (!db) return;
    pull(db).then(async (imported) => {
      if (imported) await reload();
    });
  }, [db]); // eslint-disable-line react-hooks/exhaustive-deps

  // Register dirty listener for debounced push
  useEffect(() => {
    setDirtyListener(schedulePush);
    return () => {
      setDirtyListener(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [db]); // eslint-disable-line react-hooks/exhaustive-deps

  // pagehide: best-effort push if dirty
  useEffect(() => {
    function handlePageHide() {
      if (!db || !isDirty()) return;
      void push(db);
    }
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [db]);

  return { lastSyncedAt: syncState?.lastSyncedAt, error, retryNow };
}
