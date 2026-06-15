import { useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import Dashboard from '@/components/dashboard/Dashboard';
import { buildCDPZip } from '@/cdp/cdp-export';
import { calculatePackXP } from '@/xp/packXP';
import PackDeletionDialog from './PackDeletionDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/MarkdownEditor';
import { MarkdownDisplay } from '@/components/ui/MarkdownDisplay';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

  const earliestStartDate: Date | null = packChores.length > 0
    ? packChores.reduce<Date | null>((earliest, c) => {
        const d = new Date(c.recurrence.startDate);
        return earliest === null || d < earliest ? d : earliest;
      }, null)
    : null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const xpProgress = pack?.manifest.xpTarget != null
    ? Math.min(1, packXP / pack.manifest.xpTarget)
    : null;
  const xpCompleted = pack?.manifest.xpTarget != null && packXP >= pack.manifest.xpTarget;

  const targetDate = pack?.manifest.targetDate ? (() => {
    const [y, m, d] = pack.manifest.targetDate!.split('-').map(Number);
    return new Date(y, m - 1, d);
  })() : null;

  const timeProgress = targetDate && earliestStartDate
    ? (() => {
        const total = targetDate.getTime() - earliestStartDate.getTime();
        if (total <= 0) return 1;
        return Math.min(1, (today.getTime() - earliestStartDate.getTime()) / total);
      })()
    : null;
  const timeLapsed = targetDate !== null
    && today > targetDate
    && (pack?.manifest.xpTarget == null || packXP < pack.manifest.xpTarget);

  const updatePackDescription = useAppStore((s) => s.updatePackDescription);
  const updatePackManifest = useAppStore((s) => s.updatePackManifest);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');
  const [showXpTargetDialog, setShowXpTargetDialog] = useState(false);
  const [xpTargetInput, setXpTargetInput] = useState('');
  const [showTargetDateDialog, setShowTargetDateDialog] = useState(false);
  const [targetDateInput, setTargetDateInput] = useState('');

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
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Pack options">
                ⋮
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuCheckboxItem
                checked={pack.manifest.streak ?? true}
                onCheckedChange={(checked) => updatePackManifest(pack.id, { streak: checked })}
              >
                Streaks enabled
              </DropdownMenuCheckboxItem>

              <DropdownMenuCheckboxItem
                checked={pack.manifest.allowShiftOnImport ?? false}
                onCheckedChange={(checked) => updatePackManifest(pack.id, { allowShiftOnImport: checked })}
              >
                Allow shift on import
              </DropdownMenuCheckboxItem>

              <DropdownMenuItem
                onSelect={() => {
                  setXpTargetInput(pack.manifest.xpTarget != null ? String(pack.manifest.xpTarget) : '');
                  setShowXpTargetDialog(true);
                }}
              >
                {pack.manifest.xpTarget != null ? `XP target: ${pack.manifest.xpTarget.toLocaleString()}` : 'Set XP target…'}
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => {
                  setTargetDateInput(pack.manifest.targetDate ?? '');
                  setShowTargetDateDialog(true);
                }}
              >
                {pack.manifest.targetDate ? `Target date: ${pack.manifest.targetDate}` : 'Set target date…'}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={handleExport}>
                Download as CDP
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {!pack.isPersonal && (
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  Delete Pack
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {(xpProgress !== null || timeProgress !== null) && (
        <div className="mt-3 space-y-2">
          {xpProgress !== null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>XP progress</span>
                {xpCompleted
                  ? <span className="rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-green-800 dark:text-green-300 font-medium">Completed</span>
                  : <span>{packXP.toLocaleString()} / {pack.manifest.xpTarget!.toLocaleString()} XP</span>
                }
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${Math.round(xpProgress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {timeProgress !== null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Time progress</span>
                {timeLapsed
                  ? <span className="rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-red-800 dark:text-red-300 font-medium">Lapsed</span>
                  : <span>Target: {pack.manifest.targetDate}</span>
                }
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-400 transition-all"
                  style={{ width: `${Math.round(Math.max(0, timeProgress) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pack description */}
      {isEditingDescription ? (
        <div className="mt-3 space-y-2">
          <MarkdownEditor
            value={descriptionValue}
            onChange={setDescriptionValue}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                await updatePackDescription(pack.id, descriptionValue);
                setIsEditingDescription(false);
              }}
            >
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingDescription(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 group flex items-start gap-2">
          {pack.manifest.description ? (
            <MarkdownDisplay key={pack.manifest.description} content={pack.manifest.description} className="flex-1 text-sm text-muted-foreground" />
          ) : (
            <p className="flex-1 text-sm italic text-muted-foreground">No description</p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => {
              setDescriptionValue(pack.manifest.description ?? '');
              setIsEditingDescription(true);
            }}
          >
            Edit
          </Button>
        </div>
      )}

      <Dashboard chores={packChores} currentPackId={pack.id} />
      {showDeletionDialog && pack && (
        <PackDeletionDialog
          pack={pack}
          chores={packChores}
          onClose={() => setShowDeletionDialog(false)}
        />
      )}

      <Dialog open={showXpTargetDialog} onOpenChange={setShowXpTargetDialog}>
        <DialogContent className="sm:max-w-xs" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>XP target</DialogTitle></DialogHeader>
          <Input
            type="number"
            min="0"
            placeholder="e.g. 1000"
            value={xpTargetInput}
            onChange={(e) => setXpTargetInput(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2 mt-1">
            <Button
              size="sm"
              onClick={async () => {
                const val = xpTargetInput.trim() ? Number(xpTargetInput) : undefined;
                await updatePackManifest(pack.id, { xpTarget: val });
                setShowXpTargetDialog(false);
              }}
            >
              Save
            </Button>
            {pack.manifest.xpTarget != null && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await updatePackManifest(pack.id, { xpTarget: undefined });
                  setShowXpTargetDialog(false);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTargetDateDialog} onOpenChange={setShowTargetDateDialog}>
        <DialogContent className="sm:max-w-xs" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Target date</DialogTitle></DialogHeader>
          <Input
            type="date"
            value={targetDateInput}
            onChange={(e) => setTargetDateInput(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2 mt-1">
            <Button
              size="sm"
              onClick={async () => {
                await updatePackManifest(pack.id, { targetDate: targetDateInput || undefined });
                setShowTargetDateDialog(false);
              }}
            >
              Save
            </Button>
            {pack.manifest.targetDate && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await updatePackManifest(pack.id, { targetDate: undefined });
                  setShowTargetDateDialog(false);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
