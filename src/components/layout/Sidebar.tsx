// src/components/layout/Sidebar.tsx
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAppStore } from '@/store';
import { SyncButton } from '@/components/sync/SyncButton';
import { CDPImportDialog } from '@/components/cdp/CDPImportDialog';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface Props {
  onClose: () => void;
  onNewPack: () => void;
}

export default function Sidebar({ onClose, onNewPack }: Props) {
  const completions = useAppStore((s) => s.completions);
  const packs = useAppStore((s) => s.packs);
  const isOnline = useOnlineStatus();
  const [showCDPDialog, setShowCDPDialog] = useState(false);

  const totalXP = completions.reduce((sum, c) => sum + c.xpEarned, 0);

  return (
    <nav className="flex h-full flex-col overflow-y-auto p-4">
      <Link
        to="/"
        onClick={onClose}
        className="mb-4 hidden text-lg font-bold text-gray-900 hover:text-blue-600 md:block"
      >
        Tasks Harmony
      </Link>

      <div className="mb-4">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
          {totalXP.toLocaleString()} XP
        </span>
      </div>

      <div className="mb-4 flex-1">
        <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Chores
        </p>
        <NavLink
          to="/"
          end
          onClick={onClose}
          className={({ isActive }) =>
            `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`
          }
        >
          Dashboard
        </NavLink>
        {packs.map((pack) => (
          <NavLink
            key={pack.id}
            to={`/packs/${pack.id}`}
            onClick={onClose}
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            {pack.manifest.title}
          </NavLink>
        ))}
        <button
          onClick={() => { onNewPack(); onClose(); }}
          className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
        >
          + New Pack
        </button>
      </div>

      <div className="mb-4">
        <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Account
        </p>
        <NavLink
          to="/profile"
          onClick={onClose}
          className={({ isActive }) =>
            `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`
          }
        >
          Profile
        </NavLink>
      </div>

      <div className="space-y-2 border-t border-gray-200 pt-4">
        <SyncButton />
        <button
          onClick={() => setShowCDPDialog(true)}
          disabled={!isOnline}
          title={!isOnline ? 'Offline — CDP import unavailable' : 'Import Chore Pack'}
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Import Pack
        </button>
      </div>

      {showCDPDialog && <CDPImportDialog onClose={() => setShowCDPDialog(false)} />}
    </nav>
  );
}
