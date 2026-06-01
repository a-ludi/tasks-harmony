import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAppStore } from '@/store';
import { SyncButton } from '@/components/sync/SyncButton';
import { CDPImportDialog } from '@/components/cdp/CDPImportDialog';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export default function NavBar() {
  const completions = useAppStore((s) => s.completions);
  const totalXP = completions.reduce((sum, c) => sum + c.xpEarned, 0);
  const isOnline = useOnlineStatus();
  const [showCDPDialog, setShowCDPDialog] = useState(false);

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-bold text-gray-900 hover:text-blue-600 transition-colors">
          Tasks Harmony
        </Link>

        <div className="flex items-center gap-4">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
            {totalXP.toLocaleString()} XP
          </span>

          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `text-sm font-medium transition-colors ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `text-sm font-medium transition-colors ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`
            }
          >
            Profile
          </NavLink>

          <button
            onClick={() => setShowCDPDialog(true)}
            disabled={!isOnline}
            title={!isOnline ? 'Offline — CDP import unavailable' : 'Import Chore Pack'}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Import Pack
          </button>

          <SyncButton />
        </div>
      </div>

      {showCDPDialog && <CDPImportDialog onClose={() => setShowCDPDialog(false)} />}
    </nav>
  );
}
