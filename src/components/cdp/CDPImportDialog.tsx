import { useState } from 'react';
import { useAppStore } from '@/store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface CDPImportDialogProps { onClose: () => void; }

export function CDPImportDialog({ onClose }: CDPImportDialogProps) {
  const isOnline = useOnlineStatus();
  const packs = useAppStore((s) => s.packs);
  const importCDP = useAppStore((s) => s.importCDP);
  const updateCDP = useAppStore((s) => s.updateCDP);

  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [updatingPackId, setUpdatingPackId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleImport() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setImporting(true); setMessage(null);
    try {
      await importCDP(trimmed);
      setMessage({ type: 'success', text: 'Pack imported successfully.' });
      setUrl('');
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Import failed.' });
    } finally { setImporting(false); }
  }

  async function handleUpdate(packId: string) {
    setUpdatingPackId(packId); setMessage(null);
    try {
      await updateCDP(packId);
      setMessage({ type: 'success', text: `Pack '${packId}' updated.` });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Update failed.' });
    } finally { setUpdatingPackId(null); }
  }

  const updatablePacks = packs.filter((p) => Boolean(p.sourceUrl));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="cdp-dialog-title">
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 id="cdp-dialog-title" className="text-lg font-bold text-gray-900">Import Chore Pack</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">&times;</button>
        </div>

        {!isOnline && (
          <div role="alert" className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
            You are offline. CDP import is unavailable until you reconnect.
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="cdp-url" className="block text-sm font-medium text-gray-700">Pack base URL</label>
          <input id="cdp-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={!isOnline}
            placeholder="https://raw.githubusercontent.com/user/repo/main/pack-dir"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400" />
          <button onClick={handleImport} disabled={!isOnline || importing || !url.trim()}
            title={!isOnline ? 'Offline — import unavailable' : undefined}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
            {importing ? 'Importing…' : 'Import pack'}
          </button>
        </div>

        {message && (
          <div role="alert" className={`rounded-md border px-4 py-2 text-sm ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {updatablePacks.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Installed packs</h3>
            <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
              {updatablePacks.map((pack) => (
                <li key={pack.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{pack.manifest.title}</p>
                    <p className="text-xs text-gray-500 font-mono truncate max-w-[220px]">{pack.sourceUrl}</p>
                  </div>
                  <button onClick={() => handleUpdate(pack.id)} disabled={!isOnline || updatingPackId === pack.id}
                    title={!isOnline ? 'Offline — update unavailable' : undefined}
                    className="ml-3 shrink-0 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    {updatingPackId === pack.id ? 'Updating…' : 'Update'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
