import { useState, useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAppStore } from '@/store';
import { SyncButton } from '@/components/sync/SyncButton';
import { CDPImportDialog } from '@/components/cdp/CDPImportDialog';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { getDisplayName } from '@/components/layout/displayName';
import { calculatePackXP } from '@/xp/packXP';

interface Props {
  onClose: () => void;
  onNewPack: () => void;
}

export const NAV_LINK_CLASS = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
  }`;

export default function Sidebar({ onClose, onNewPack }: Props) {
  const completions = useAppStore((s) => s.completions);
  const packs = useAppStore((s) => s.packs);
  const chores = useAppStore((s) => s.chores);
  const profile = useAppStore((s) => s.profile);
  const displayName = getDisplayName(profile?.displayName ?? '');
  const isOnline = useOnlineStatus();
  const [showCDPDialog, setShowCDPDialog] = useState(false);
  const [showPackMenu, setShowPackMenu] = useState(false);
  const packMenuRef = useRef<HTMLDivElement>(null);

  const totalXP = completions.reduce((sum, c) => sum + c.xpEarned, 0);
  const sortedPacks = [...packs].sort((a, b) =>
    a.manifest.title.localeCompare(b.manifest.title),
  );

  useEffect(() => {
    if (!showPackMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (packMenuRef.current && !packMenuRef.current.contains(e.target as Node)) {
        setShowPackMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPackMenu]);

  return (
    <nav className="flex h-full flex-col overflow-y-auto p-4">
      <Link
        to="/"
        onClick={onClose}
        className="mb-4 hidden text-lg font-bold text-gray-900 hover:text-blue-600 md:block"
      >
        Tasks Harmony
      </Link>

      {displayName && (
        <p className="mb-3 hidden font-serif italic text-gray-500 md:block">
          {displayName}
        </p>
      )}

      <div className="mb-4">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
          {totalXP.toLocaleString()} XP
        </span>
      </div>

      <NavLink to="/" end onClick={onClose} className={NAV_LINK_CLASS}>
        Dashboard
      </NavLink>

      <div className="mb-4 mt-4 flex-1">
        <div className="mb-1 flex items-center justify-between px-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Packs
          </p>
          <div className="relative" ref={packMenuRef}>
            <button
              onClick={() => setShowPackMenu((v) => !v)}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Pack actions"
              aria-label="Pack actions"
            >
              ⋮
            </button>
            {showPackMenu && (
              <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  onClick={() => { setShowPackMenu(false); onNewPack(); onClose(); }}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  + New Pack
                </button>
                <button
                  onClick={() => { setShowPackMenu(false); setShowCDPDialog(true); }}
                  disabled={!isOnline}
                  title={!isOnline ? 'Offline — CDP import unavailable' : undefined}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Import Pack
                </button>
              </div>
            )}
          </div>
        </div>

        {sortedPacks.map((pack) => {
          const packXP = calculatePackXP(pack.id, chores, completions);
          return (
            <NavLink
              key={pack.id}
              to={`/packs/${pack.id}`}
              onClick={onClose}
              className={NAV_LINK_CLASS}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate">{pack.manifest.title}</span>
                {packXP > 0 && (
                  <span className="shrink-0 text-xs font-normal text-amber-600">
                    {packXP.toLocaleString()} XP
                  </span>
                )}
              </span>
            </NavLink>
          );
        })}
      </div>

      <div className="mb-4">
        <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Account
        </p>
        <NavLink to="/profile" onClick={onClose} className={NAV_LINK_CLASS}>
          Profile
        </NavLink>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <SyncButton />
      </div>

      {showCDPDialog && <CDPImportDialog onClose={() => setShowCDPDialog(false)} />}
    </nav>
  );
}
