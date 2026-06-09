import { useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import Dashboard from '@/components/dashboard/Dashboard';
import { buildCDPZip } from '@/cdp/cdp-export';
import { calculatePackXP } from '@/xp/packXP';
import PackDeletionDialog from './PackDeletionDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function PackDashboard() {
  const { packId } = useParams<{ packId: string }>();
  const packs = useAppStore((s) => s.packs);
  const chores = useAppStore((s) => s.chores);
  const questions = useAppStore((s) => s.questions);
  const renamePack = useAppStore((s) => s.renamePack);
  const deletePack = useAppStore((s) => s.deletePack);
  const profile = useAppStore((s) => s.profile);
  const navigate = useNavigate();

  const completions = useAppStore((s) => s.completions);

  const pack = packs.find((p) => p.id === packId);
  const packChores = chores.filter((c) => c.packId === packId);
  const packXP = calculatePackXP(packId ?? '', chores, completions);
  const packChoreKeys = new Set(packChores.map((c) => c.key));
  const packQuestions = questions.filter((q) => packChoreKeys.has(q.choreKey));

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);

  if (!pack) return <Navigate to="/" replace />;

  async function handleRename() {
    if (!renameValue.trim() || !pack) return;
    await renamePack(pack.id, renameValue.trim());
    setIsRenaming(false);
  }

  function handleExport() {
    if (!pack || !profile) return;
    const zipBytes = buildCDPZip(pack, packChores, packQuestions, profile);
    const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pack.id}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  async function handleDelete() {
    if (!pack) return;
    if (packChores.length === 0) {
      const confirmed = window.confirm(`Delete "${pack.manifest.title}"? This cannot be undone.`);
      if (!confirmed) return;
      await deletePack(pack.id);
      navigate('/');
    } else {
      setShowDeletionDialog(true);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 pb-2 pt-4">
        {isRenaming ? (
          <>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              autoFocus
              className="text-xl font-bold"
            />
            <Button
              onClick={handleRename}
              size="sm"
            >
              Save
            </Button>
            <Button
              onClick={() => setIsRenaming(false)}
              variant="outline"
              size="sm"
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-foreground">{pack.manifest.title}</h1>
            <Button
              onClick={() => { setRenameValue(pack.manifest.title); setIsRenaming(true); }}
              title="Rename pack"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              ✏️
            </Button>
            <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-sm font-semibold text-amber-800 dark:text-amber-300">
              {packXP.toLocaleString()} XP
            </span>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            onClick={handleExport}
            variant="outline"
            size="sm"
          >
            Download as CDP
          </Button>
          {!pack.isPersonal && (
            <Button
              onClick={handleDelete}
              variant="outline"
              size="sm"
              className="border-destructive text-destructive hover:bg-destructive/10 dark:border-destructive/60 dark:hover:bg-destructive/20"
            >
              Delete Pack
            </Button>
          )}
        </div>
      </div>

      <Dashboard chores={packChores} currentPackId={pack.id} />
      {showDeletionDialog && pack && (
        <PackDeletionDialog
          pack={pack}
          chores={packChores}
          onClose={() => setShowDeletionDialog(false)}
        />
      )}
    </div>
  );
}
