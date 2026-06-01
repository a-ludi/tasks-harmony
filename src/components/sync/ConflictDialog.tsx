import type { AppState } from '@/types';

export type ConflictChoice = 'local' | 'remote' | 'manual';

interface ConflictDialogProps {
  localState: AppState;
  serverEtag: string;
  serverTimestamp?: string;
  onResolve: (choice: ConflictChoice) => void;
  onClose: () => void;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function ConflictDialog({ localState, serverEtag, serverTimestamp, onResolve, onClose }: ConflictDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="conflict-dialog-title">
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl" aria-hidden="true">⚠️</span>
          <h2 id="conflict-dialog-title" className="text-lg font-bold text-gray-900">Sync Conflict Detected</h2>
        </div>

        <p className="text-sm text-gray-600 mb-4">The remote file has changed since your last sync. Your local changes and the remote version cannot be merged automatically.</p>

        <div className="rounded-md bg-gray-50 border border-gray-200 p-3 mb-6 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">Your version:</span>
            <span className="text-gray-600">{formatTimestamp(localState.exportedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">Server ETag:</span>
            <span className="text-gray-600 font-mono text-xs">{serverEtag}</span>
          </div>
          {serverTimestamp && (
            <div className="flex justify-between">
              <span className="font-medium text-gray-700">Server date:</span>
              <span className="text-gray-600">{formatTimestamp(serverTimestamp)}</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-md border border-gray-200 p-3">
            <button className="w-full text-left" onClick={() => onResolve('local')}>
              <p className="font-semibold text-gray-900 text-sm">(a) Use my local version</p>
              <p className="text-xs text-gray-500 mt-0.5">Overwrite the server with your local data. Remote changes will be lost.</p>
            </button>
          </div>
          <div className="rounded-md border border-gray-200 p-3">
            <button className="w-full text-left" onClick={() => onResolve('remote')}>
              <p className="font-semibold text-gray-900 text-sm">(b) Use the remote version</p>
              <p className="text-xs text-gray-500 mt-0.5">Download and apply the server data. Your unsynchronised local changes will be discarded.</p>
            </button>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <button className="w-full text-left" onClick={() => onResolve('manual')}>
              <p className="font-semibold text-amber-900 text-sm">(c) Resolve manually</p>
              <p className="text-xs text-amber-700 mt-0.5">Your local version will be saved to a conflict file next to state.json on the server (e.g. <code className="font-mono">state_conflict_2026-05-31.json</code>). You can then inspect both files and re-import the desired one.</p>
            </button>
          </div>
        </div>

        <button onClick={onClose} className="mt-4 w-full rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">Cancel</button>
      </div>
    </div>
  );
}
