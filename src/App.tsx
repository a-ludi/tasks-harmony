import { useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAppStore } from '@/store';
import NavBar from '@/components/layout/NavBar';
import Dashboard from '@/components/dashboard/Dashboard';
import { ProfilePage } from '@/components/profile/ProfilePage';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { performSync } from '@/sync/sync';

export default function App() {
  const init = useAppStore((s) => s.init);
  const loaded = useAppStore((s) => s.loaded);
  const isOnline = useOnlineStatus();
  const wasOnlineRef = useRef(isOnline);
  const syncState = useAppStore((s) => s.syncState);
  const updateSyncState = useAppStore((s) => s.updateSyncState);
  const db = useAppStore((s) => s.db);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (!wasOnline && isOnline && syncState?.pendingSync && db) {
      performSync(db, syncState, () => {
        // Conflict on auto-sync: leave pendingSync=true, user resolves via SyncButton
      }).then((updated) => {
        updateSyncState(updated);
      }).catch(() => {
        // Leave pendingSync=true; user retries manually
      });
    }
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="mx-auto max-w-2xl px-4">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </main>
    </div>
  );
}
