// src/components/packs/PackDashboard.tsx
import { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import Dashboard from '@/components/dashboard/Dashboard';
import { buildCDPZip } from '@/cdp/cdp-export';

export default function PackDashboard() {
  const { packId } = useParams<{ packId: string }>();
  const packs = useAppStore((s) => s.packs);
  const chores = useAppStore((s) => s.chores);
  const renamePack = useAppStore((s) => s.renamePack);

  const pack = packs.find((p) => p.id === packId);
  const packChores = chores.filter((c) => c.packId === packId);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  if (!pack) return <Navigate to="/" replace />;

  async function handleRename() {
    if (!renameValue.trim() || !pack) return;
    await renamePack(pack.id, renameValue.trim());
    setIsRenaming(false);
  }

  function handleExport() {
    if (!pack) return;
    const zipBytes = buildCDPZip(pack, packChores);
    const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pack.id}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 pb-2 pt-4">
        {isRenaming ? (
          <>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              autoFocus
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              onClick={handleRename}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Save
            </button>
            <button
              onClick={() => setIsRenaming(false)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{pack.manifest.title}</h1>
            <button
              onClick={() => { setRenameValue(pack.manifest.title); setIsRenaming(true); }}
              title="Rename pack"
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              ✏️
            </button>
          </>
        )}
        <button
          onClick={handleExport}
          className="ml-auto rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Download as CDP
        </button>
      </div>

      <Dashboard chores={packChores} currentPackId={pack.id} />
    </div>
  );
}
