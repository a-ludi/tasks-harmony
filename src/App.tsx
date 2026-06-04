import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { useAppStore } from '@/store';
import Sidebar from '@/components/layout/Sidebar';
import { clampSidebarWidth, readStoredWidth, writeStoredWidth } from '@/components/layout/sidebarResize';
import Dashboard from '@/components/dashboard/Dashboard';
import { ProfilePage } from '@/components/profile/ProfilePage';
import NewPackDialog from '@/components/packs/NewPackDialog';
import PackDashboard from '@/components/packs/PackDashboard';
import CompletionsPage from '@/components/completion/CompletionsPage';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { performSync } from '@/sync/sync';
import { getDisplayName } from '@/components/layout/displayName';

export default function App() {
  const init = useAppStore((s) => s.init);
  const loaded = useAppStore((s) => s.loaded);
  const isOnline = useOnlineStatus();
  const wasOnlineRef = useRef(isOnline);
  const syncState = useAppStore((s) => s.syncState);
  const updateSyncState = useAppStore((s) => s.updateSyncState);
  const db = useAppStore((s) => s.db);

  const completions = useAppStore((s) => s.completions);
  const totalXP = completions.reduce((sum, c) => sum + c.xpEarned, 0);

  const profile = useAppStore((s) => s.profile);
  const displayName = getDisplayName(profile?.displayName ?? '');

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNewPackDialog, setShowNewPackDialog] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredWidth(window.innerWidth));
  const sidebarWidthRef = useRef(sidebarWidth);

  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidthRef.current;

    function onMouseMove(ev: MouseEvent) {
      const newWidth = clampSidebarWidth(startWidth + ev.clientX - startX, window.innerWidth);
      sidebarWidthRef.current = newWidth;
      setSidebarWidth(newWidth);
    }

    function onMouseUp() {
      writeStoredWidth(sidebarWidthRef.current, window.innerWidth);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

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

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

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
        style={{ width: sidebarWidth }}
        className={`fixed inset-y-0 left-0 z-40 bg-white border-r border-gray-200 transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          onClose={() => setSidebarOpen(false)}
          onNewPack={() => setShowNewPackDialog(true)}
        />
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute inset-y-0 right-0 hidden w-1 cursor-col-resize bg-transparent hover:bg-blue-300 md:block"
          title="Drag to resize sidebar"
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
          <Link to="/" className="font-bold text-gray-900 flex items-baseline gap-1.5">
            Tasks Harmony
            {displayName && (
              <>
                <span className="text-gray-300 font-normal">·</span>
                <span className="font-serif italic font-normal text-gray-700">{displayName}</span>
              </>
            )}
          </Link>
          <span className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
            {totalXP.toLocaleString()} XP
          </span>
        </header>

        <main className="flex-1 px-4">
          <div className="mx-auto max-w-2xl">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/packs/:packId" element={<PackDashboard />} />
              <Route path="/chores/:encodedChoreKey/completions" element={<CompletionsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Routes>
          </div>
        </main>
      </div>

      {showNewPackDialog && (
        <NewPackDialog onClose={() => setShowNewPackDialog(false)} />
      )}
    </div>
  );
}
