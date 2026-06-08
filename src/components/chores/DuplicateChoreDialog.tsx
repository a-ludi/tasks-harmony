import { useState } from 'react';
import { useAppStore } from '@/store';
import { titleToFilename } from '@/cdp/filename';
import type { Chore } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  chore: Chore;
  onClose: () => void;
  onDuplicateAndEdit: (newChoreKey: string) => void;
}

export default function DuplicateChoreDialog({ chore, onClose, onDuplicateAndEdit }: Props) {
  const packs = useAppStore((s) => s.packs);
  const chores = useAppStore((s) => s.chores);
  const duplicateChore = useAppStore((s) => s.duplicateChore);

  const [selectedPackId, setSelectedPackId] = useState(chore.packId);
  const [name, setName] = useState(`${chore.title} (copy)`);
  const [nameError, setNameError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  function checkCollision(packId: string, title: string): boolean {
    const choreId = titleToFilename(title.trim());
    const collision = chores.some((c) => c.packId === packId && c.choreId === choreId);
    if (collision) { setNameError(`A chore with ID "${choreId}" already exists in this pack.`); return true; }
    setNameError(undefined);
    return false;
  }

  function handlePackChange(newPackId: string) {
    const defaultName = newPackId === chore.packId ? `${chore.title} (copy)` : chore.title;
    setSelectedPackId(newPackId);
    setName(defaultName);
    checkCollision(newPackId, defaultName);
  }

  function handleNameChange(newName: string) {
    setName(newName);
    checkCollision(selectedPackId, newName);
  }

  async function submit(andEdit: boolean) {
    if (checkCollision(selectedPackId, name)) return;
    setSubmitting(true);
    try {
      const newKey = await duplicateChore(chore.key, name, selectedPackId);
      if (andEdit) onDuplicateAndEdit(newKey);
      onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Duplicate chore</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Pack</Label>
            <Select value={selectedPackId} onValueChange={handlePackChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {packs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.manifest.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dup-name">Name</Label>
            <Input
              id="dup-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={nameError ? 'border-destructive' : ''}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => submit(false)} disabled={submitting || !!nameError || !name.trim()}>
            Duplicate
          </Button>
          <Button onClick={() => submit(true)} disabled={submitting || !!nameError || !name.trim()}>
            Duplicate & Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
