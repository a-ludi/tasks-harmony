// src/App.tsx
import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { useAppStore } from '@/store';
import Sidebar from '@/components/layout/Sidebar';
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

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (!wasOnline && isOnline && syncState?.pendingSync && db) {
      performSync(db, syncState, () => {}).then((updated) => {
        updateSyncState(updated);
      }).catch(() => {});
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
    <div className="flex min-h-screen bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-48 bg-white border-r border-gray-200 transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          onClose={() => setSidebarOpen(false)}
          onNewPack={() => {}}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-xl text-gray-600"
            aria-label="Open menu"
          >
            ☰
          </button>
          <Link to="/" className="font-bold text-gray-900">
            Tasks Harmony
          </Link>
        </header>

        <main className="flex-1 px-4">
          <div className="mx-auto max-w-2xl">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}
