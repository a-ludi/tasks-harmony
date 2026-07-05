import { useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { migrate } from '@/sync/migrate';
import { exportKeyFile } from '@/sync/credentials';
import { getCredentials } from '@/db';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Phase = 'migrating' | 'export-prompt' | 'done';

interface Props {
  open: boolean;
  onComplete: () => void;
}

export function MigrationModal({ open, onComplete }: Props) {
  const db = useAppStore((s) => s.db);
  const [phase, setPhase] = useState<Phase>('migrating');
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !db) return;
    setPhase('migrating');
    migrate(db).then(() => setPhase('export-prompt'));
  }, [open, db]);

  async function handleExport() {
    if (!db) return;
    try {
      const creds = await getCredentials(db);
      if (!creds) return;
      const json = await exportKeyFile(creds);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tasks-harmony-sync-key-v2.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Export failed. Please try again.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {phase === 'migrating' && (
          <>
            <DialogHeader>
              <DialogTitle>Upgrading sync encryption</DialogTitle>
              <DialogDescription>
                Your sync credentials are being upgraded to post-quantum encryption.
                This may take a moment…
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          </>
        )}

        {phase === 'export-prompt' && (
          <>
            <DialogHeader>
              <DialogTitle>Upgrade complete</DialogTitle>
              <DialogDescription>
                Your sync key has been upgraded. If you use multiple devices, export
                your new key and import it on your other devices — they will not be
                able to sync until you do.
              </DialogDescription>
            </DialogHeader>
            {exportError && (
              <p className="text-sm text-destructive">{exportError}</p>
            )}
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={onComplete}>
                Skip for now
              </Button>
              <Button onClick={handleExport}>
                Export new key
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
