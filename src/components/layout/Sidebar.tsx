import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAppStore } from '@/store';
import { SyncButton } from '@/components/sync/SyncButton';
import { CDPImportDialog } from '@/components/cdp/CDPImportDialog';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useTheme } from '@/hooks/useTheme';
import { getDisplayName } from '@/components/layout/displayName';
import { calculatePackXP } from '@/xp/packXP';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface Props {
  onClose: () => void;
  onNewPack: () => void;
  updateVersion?: string | null;
  onUpdateClick?: () => void;
}

export const NAV_LINK_CLASS = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'}`;

export default function Sidebar({ onClose, onNewPack, updateVersion, onUpdateClick }: Props) {
  const completions = useAppStore((s) => s.completions);
  const packs = useAppStore((s) => s.packs);
  const chores = useAppStore((s) => s.chores);
  const profile = useAppStore((s) => s.profile);
  const displayName = getDisplayName(profile?.displayName ?? '');
  const isOnline = useOnlineStatus();
  const { theme, toggle } = useTheme();
  const [showCDPDialog, setShowCDPDialog] = useState(false);

  const totalXP = completions.reduce((sum, c) => sum + c.xpEarned, 0);
  const sortedPacks = [...packs].sort((a, b) => a.manifest.title.localeCompare(b.manifest.title));

  return (
    <nav className="flex h-full flex-col overflow-y-auto p-4">
      <Link to="/" onClick={onClose} className="mb-4 hidden text-lg font-bold hover:text-primary md:block">
        Tasks Harmony
      </Link>

      {displayName && (
        <p className="mb-3 hidden font-serif italic text-muted-foreground md:block">{displayName}</p>
      )}

      <div className="mb-4">
        <span data-testid="xp-badge" className="rounded-full bg-amber-100 dark:bg-amber-900 px-3 py-1 text-sm font-semibold text-amber-800 dark:text-amber-200">
          {totalXP.toLocaleString()} XP
        </span>
      </div>

      <NavLink to="/" end onClick={onClose} className={NAV_LINK_CLASS}>Dashboard</NavLink>

      <div className="mb-4 mt-4 flex-1">
        <div className="mb-1 flex items-center justify-between px-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Packs</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" title="Pack actions" aria-label="Pack actions">⋮</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { onNewPack(); onClose(); }}>+ New Pack</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowCDPDialog(true)}
                disabled={!isOnline}
                title={!isOnline ? 'Offline — CDP import unavailable' : undefined}
              >
                Import Pack
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {sortedPacks.map((pack) => {
          const packXP = calculatePackXP(pack.id, chores, completions);
          return (
            <NavLink key={pack.id} to={`/packs/${pack.id}`} onClick={onClose} className={NAV_LINK_CLASS}>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate">{pack.manifest.title}</span>
                {packXP > 0 && <span className="shrink-0 text-xs font-normal text-amber-600">{packXP.toLocaleString()} XP</span>}
              </span>
            </NavLink>
          );
        })}
      </div>

      <div className="mb-4">
        <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</p>
        <NavLink to="/profile" onClick={onClose} className={NAV_LINK_CLASS}>Profile</NavLink>
      </div>

      <div className="border-t pt-4 space-y-3">
        <SyncButton />
        <div className="flex items-center gap-2 px-1">
          <Switch checked={theme === 'dark'} onCheckedChange={toggle} />
          <Label className="text-sm font-normal cursor-pointer" onClick={toggle}>Dark mode</Label>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {updateVersion && (
          <button
            onClick={onUpdateClick}
            className="w-full rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors text-center"
          >
            Update to v{updateVersion}
          </button>
        )}
        <a
          href="https://github.com/a-ludi/tasks-harmony"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View on GitHub
        </a>
      </div>

      <footer className="mt-auto pt-4 text-xs text-muted-foreground select-none">
        v{import.meta.env.VITE_APP_VERSION} · {import.meta.env.VITE_BUILD_DATE}
      </footer>

      {showCDPDialog && <CDPImportDialog onClose={() => setShowCDPDialog(false)} />}
    </nav>
  );
}
