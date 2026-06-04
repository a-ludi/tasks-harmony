import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import { resolveChoreIdCollision } from '@/chores/resolveCollision';
import type { Pack, Chore, ChoreDisposition } from '@/types';

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] flex flex-col">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">
          Delete "{pack.manifest.title}"
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Choose what to do with each chore. Completions are always preserved.
        </p>

        <div className="mb-3 flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Move chores to:</label>
          <select
            value={targetPackId}
            onChange={(e) => setTargetPackId(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {otherPacks.map((p) => (
              <option key={p.id} value={p.id}>{p.manifest.title}</option>
            ))}
          </select>
        </div>

        <div className="mb-3 flex gap-2">
          <button
            onClick={() => applyAll('move')}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            Move all
          </button>
          <button
            onClick={() => applyAll('delete')}
            className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            Delete all
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {chores.map((chore) => {
            const action = actions[chore.key];
            const resolved = resolvedNames.get(chore.key);
            return (
              <div key={chore.key} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{chore.title}</p>
                  {action === 'move' && resolved && resolved.title !== chore.title && (
                    <p className="text-xs text-amber-600">Will be renamed to "{resolved.title}"</p>
                  )}
                </div>
                <div className="flex gap-1 ml-2 shrink-0">
                  <button
                    onClick={() => setActions((prev) => ({ ...prev, [chore.key]: 'move' }))}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      action === 'move'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    Move
                  </button>
                  <button
                    onClick={() => setActions((prev) => ({ ...prev, [chore.key]: 'delete' }))}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      action === 'delete'
                        ? 'bg-red-100 text-red-700'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Deleting…' : 'Delete Pack'}
          </button>
        </div>
      </div>
    </div>
  );
}
