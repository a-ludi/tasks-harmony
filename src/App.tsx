import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link, useParams, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import Sidebar from '@/components/layout/Sidebar';
import { clampSidebarWidth, readStoredWidth, writeStoredWidth } from '@/components/layout/sidebarResize';
import Dashboard from '@/components/dashboard/Dashboard';
import { ProfilePage } from '@/components/profile/ProfilePage';
import NewPackDialog from '@/components/packs/NewPackDialog';
import PackDashboard from '@/components/packs/PackDashboard';
import ChorePage from '@/components/chores/ChorePage';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useTheme } from '@/hooks/useTheme';
import { performSync } from '@/sync/sync';
import { getDisplayName } from '@/components/layout/displayName';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useUpdateNotification } from '@/hooks/useUpdateNotification';
import { UpdateModal } from '@/components/update/UpdateModal';

function RedirectToChore() {
  const { encodedChoreKey } = useParams<{ encodedChoreKey: string }>();
  return <Navigate to={`/chores/${encodedChoreKey}`} replace />;
}

export default function App() {
  useTheme(); // applies class="dark" to <html> on mount and on toggle
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

  const update = useUpdateNotification();
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // Auto-open modal when update becomes available
  useEffect(() => {
    if (update.available) setShowUpdateModal(true);
  }, [update.available]);

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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile sidebar: Sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <Sidebar onClose={() => setSidebarOpen(false)} onNewPack={() => setShowNewPackDialog(true)} updateVersion={update.available ? update.version : null} onUpdateClick={() => setShowUpdateModal(true)} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar: static aside */}
      <aside
        style={{ width: sidebarWidth }}
        className="hidden md:flex flex-col relative bg-background border-r"
      >
        <Sidebar onClose={() => {}} onNewPack={() => setShowNewPackDialog(true)} updateVersion={update.available ? update.version : null} onUpdateClick={() => setShowUpdateModal(true)} />
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute inset-y-0 right-0 w-1 cursor-col-resize bg-transparent hover:bg-primary/30"
          title="Drag to resize sidebar"
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="relative text-xl text-muted-foreground"
            aria-label="Open menu"
          >
            ☰
            {update.available && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" />
            )}
          </button>
          <Link to="/" className="font-bold text-foreground flex items-baseline gap-1.5">
            Tasks Harmony
            {displayName && (
              <>
                <span className="text-muted-foreground font-normal">·</span>
                <span className="font-serif italic font-normal text-muted-foreground">{displayName}</span>
              </>
            )}
          </Link>
          <span className="ml-auto rounded-full bg-amber-100 dark:bg-amber-900 px-3 py-1 text-sm font-semibold text-amber-800 dark:text-amber-200">
            {totalXP.toLocaleString()} XP
          </span>
        </header>

        <main className="flex-1 px-4">
          <div className="mx-auto max-w-2xl">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/packs/:packId" element={<PackDashboard />} />
              <Route path="/chores/:encodedChoreKey" element={<ChorePage />} />
              <Route path="/chores/:encodedChoreKey/completions" element={<RedirectToChore />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Routes>
          </div>
        </main>
      </div>

      {showNewPackDialog && (
        <NewPackDialog onClose={() => setShowNewPackDialog(false)} />
      )}

        {showUpdateModal && update.available && (
          <UpdateModal
            version={update.version ?? ''}
            highlights={update.highlights}
            fullChangelog={update.fullChangelog}
            onUpdateNow={update.updateNow}
            onRemindLater={() => { update.remindLater(); setShowUpdateModal(false); }}
            onIgnore={() => { update.ignoreUpdate(); setShowUpdateModal(false); }}
          />
        )}
    </div>
  );
}
