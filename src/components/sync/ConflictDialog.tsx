import type { AppState } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>⚠️ Sync Conflict Detected</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">The remote file has changed since your last sync. Your local changes and the remote version cannot be merged automatically.</p>
        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="font-medium">Your version:</span>
            <span className="text-muted-foreground">{formatTimestamp(localState.exportedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Server ETag:</span>
            <span className="text-muted-foreground font-mono text-xs">{serverEtag}</span>
          </div>
          {serverTimestamp && (
            <div className="flex justify-between">
              <span className="font-medium">Server date:</span>
              <span className="text-muted-foreground">{formatTimestamp(serverTimestamp)}</span>
            </div>
          )}
        </div>
        <div className="space-y-2">
          {[
            { choice: 'local' as const, label: '(a) Use my local version', desc: 'Overwrite the server with your local data. Remote changes will be lost.' },
            { choice: 'remote' as const, label: '(b) Use the remote version', desc: 'Download and apply the server data. Your unsynchronised local changes will be discarded.' },
          ].map(({ choice, label, desc }) => (
            <button key={choice} className="w-full rounded-md border p-3 text-left hover:bg-accent" onClick={() => onResolve(choice)}>
              <p className="font-semibold text-sm">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </button>
          ))}
          <button className="w-full rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950 p-3 text-left hover:bg-amber-100" onClick={() => onResolve('manual')}>
            <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">(c) Resolve manually</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">Your local version will be saved to a conflict file next to state.json on the server. Inspect both files and re-import the desired one.</p>
          </button>
        </div>
        <Button variant="outline" onClick={onClose} className="w-full">Cancel</Button>
      </DialogContent>
    </Dialog>
  );
}
