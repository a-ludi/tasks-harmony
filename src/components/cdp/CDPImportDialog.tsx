import { useState } from 'react';
import { useAppStore } from '@/store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Import Chore Pack</DialogTitle>
        </DialogHeader>

        {!isOnline && (
          <div role="alert" className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
            You are offline. CDP import is unavailable until you reconnect.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="cdp-url">Pack base URL</Label>
          <Input
            id="cdp-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={!isOnline}
            placeholder="https://raw.githubusercontent.com/user/repo/main/pack-dir"
          />
          <Button onClick={handleImport} disabled={!isOnline || importing || !url.trim()} className="w-full">
            {importing ? 'Importing…' : 'Import pack'}
          </Button>
        </div>

        {message && (
          <div role="alert" className={`rounded-md border px-4 py-2 text-sm ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
            {message.text}
          </div>
        )}

        {updatablePacks.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Installed packs</h3>
            <ul className="divide-y rounded-md border">
              {updatablePacks.map((pack) => (
                <li key={pack.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{pack.manifest.title}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate max-w-[220px]">{pack.sourceUrl}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUpdate(pack.id)}
                    disabled={!isOnline || updatingPackId === pack.id}
                    className="ml-3 shrink-0"
                  >
                    {updatingPackId === pack.id ? 'Updating…' : 'Update'}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
