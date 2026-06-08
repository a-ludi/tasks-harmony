import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import { resolveChoreIdCollision } from '@/chores/resolveCollision';
import type { Pack, Chore, ChoreDisposition } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  pack: Pack;
  chores: Chore[];
  onClose: () => void;
}

export default function PackDeletionDialog({ pack, chores, onClose }: Props) {
  const allChores = useAppStore((s) => s.chores);
  const packs = useAppStore((s) => s.packs);
  const deletePack = useAppStore((s) => s.deletePack);
  const navigate = useNavigate();

  const otherPacks = packs.filter((p) => p.id !== pack.id);
  const [targetPackId, setTargetPackId] = useState(otherPacks[0]?.id ?? '');
  const [actions, setActions] = useState<Record<string, 'delete' | 'move'>>(
    Object.fromEntries(chores.map((c) => [c.key, 'move'])),
  );
  const [submitting, setSubmitting] = useState(false);

  const resolvedNames = useMemo(() => {
    const targetChores = allChores.filter((c) => c.packId === targetPackId);
    const existingIds = new Set(targetChores.map((c) => c.choreId));
    const result = new Map<string, { choreId: string; title: string }>();
    for (const chore of chores) {
      if (actions[chore.key] !== 'move') continue;
      const resolved = resolveChoreIdCollision(chore.choreId, chore.title, existingIds);
      result.set(chore.key, resolved);
      existingIds.add(resolved.choreId);
    }
    return result;
  }, [chores, actions, targetPackId, allChores]);

  function applyAll(action: 'delete' | 'move') {
    setActions(Object.fromEntries(chores.map((c) => [c.key, action])));
  }

  async function handleConfirm() {
    setSubmitting(true);
    const dispositions: ChoreDisposition[] = chores.map((chore) => {
      const action = actions[chore.key];
      if (action === 'move') {
        const resolved = resolvedNames.get(chore.key) ?? { choreId: chore.choreId, title: chore.title };
        return { choreKey: chore.key, action, targetPackId, resolvedChoreId: resolved.choreId, resolvedTitle: resolved.title };
      }
      return { choreKey: chore.key, action };
    });
    await deletePack(pack.id, dispositions);
    navigate('/');
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Delete "{pack.manifest.title}"</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Choose what to do with each chore. Completions are always preserved.</p>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Move chores to:</span>
          <Select value={targetPackId} onValueChange={setTargetPackId}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {otherPacks.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.manifest.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => applyAll('move')}>Move all</Button>
          <Button variant="outline" size="sm" className="text-destructive border-destructive/50 hover:bg-destructive/10" onClick={() => applyAll('delete')}>Delete all</Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {chores.map((chore) => {
            const action = actions[chore.key];
            const resolved = resolvedNames.get(chore.key);
            return (
              <div key={chore.key} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{chore.title}</p>
                  {action === 'move' && resolved && resolved.title !== chore.title && (
                    <p className="text-xs text-amber-600">Will be renamed to "{resolved.title}"</p>
                  )}
                </div>
                <div className="flex gap-1 ml-2 shrink-0">
                  <Button
                    variant={action === 'move' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActions((prev) => ({ ...prev, [chore.key]: 'move' }))}
                  >Move</Button>
                  <Button
                    variant={action === 'delete' ? 'destructive' : 'ghost'}
                    size="sm"
                    onClick={() => setActions((prev) => ({ ...prev, [chore.key]: 'delete' }))}
                  >Delete</Button>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Deleting…' : 'Delete Pack'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
