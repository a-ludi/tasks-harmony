import { useState } from 'react';
import { useAppStore } from '@/store';
import type { Chore } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import ChoreFormModal from './ChoreFormModal';
import DuplicateChoreDialog from './DuplicateChoreDialog';

interface Props {
  chore: Chore;
}

export default function ChoreActionsDropdown({ chore }: Props) {
  const deactivateChore = useAppStore((s) => s.deactivateChore);
  const deleteChore = useAppStore((s) => s.deleteChore);
  const allChores = useAppStore((s) => s.chores);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [editAfterDuplicateKey, setEditAfterDuplicateKey] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isArchived = !chore.active;

  async function handleDeactivate() {
    if (window.confirm(`Archive "${chore.title}"? It will be removed from the dashboard.`)) {
      await deactivateChore(chore.key);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteChore(chore.key);
      setShowDeleteDialog(false);
    } catch (err) {
      console.error('Failed to delete chore:', err);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Chore actions">⋮</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isArchived && (
            <>
              <DropdownMenuItem onClick={() => setShowEditModal(true)}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowDuplicateDialog(true)}>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={handleDeactivate}>Archive</DropdownMenuItem>
            </>
          )}
          {isArchived && (
            <DropdownMenuItem variant="destructive" onClick={() => setShowDeleteDialog(true)}>Delete</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {showEditModal && <ChoreFormModal chore={chore} packId={chore.packId} onClose={() => setShowEditModal(false)} />}
      {showDuplicateDialog && (
        <DuplicateChoreDialog
          chore={chore}
          onClose={() => setShowDuplicateDialog(false)}
          onDuplicateAndEdit={(newKey) => { setShowDuplicateDialog(false); setEditAfterDuplicateKey(newKey); }}
        />
      )}
      {editAfterDuplicateKey && (() => {
        const dupeChore = allChores.find((c) => c.key === editAfterDuplicateKey);
        return dupeChore ? <ChoreFormModal chore={dupeChore} packId={dupeChore.packId} onClose={() => setEditAfterDuplicateKey(null)} /> : null;
      })()}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => { if (!deleting) setShowDeleteDialog(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete chore?</DialogTitle>
            <DialogDescription>
              All completion history for <strong>{chore.title}</strong> will be permanently deleted.
              Your total XP earned is preserved. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
