import { useState } from 'react';
import { useAppStore } from '@/store';
import { titleToFilename } from '@/cdp/filename';
import type { Chore } from '@/types';

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
    if (collision) {
      setNameError(`A chore with ID "${choreId}" already exists in this pack.`);
      return true;
    }
    setNameError(undefined);
    return false;
  }

  function handlePackChange(newPackId: string) {
    const defaultName = newPackId === chore.packId
      ? `${chore.title} (copy)`
      : chore.title;
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
      if (andEdit) {
        onDuplicateAndEdit(newKey);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Duplicate chore</h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="dup-pack">
              Pack
            </label>
            <select
              id="dup-pack"
              value={selectedPackId}
              onChange={(e) => handlePackChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {packs.map((p) => (
                <option key={p.id} value={p.id}>{p.manifest.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="dup-name">
              Name
            </label>
            <input
              id="dup-name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                nameError ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'
              }`}
            />
            {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => submit(false)}
            disabled={submitting || !!nameError || !name.trim()}
            className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            Duplicate
          </button>
          <button
            onClick={() => submit(true)}
            disabled={submitting || !!nameError || !name.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Duplicate & Edit
          </button>
        </div>
      </div>
    </div>
  );
}
