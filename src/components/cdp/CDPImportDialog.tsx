import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { fetchCDPManifestOnly } from '@/cdp/cdp-import';
import { normalizePackUrl } from '@/cdp/normalizePackUrl';

interface CDPImportDialogProps { onClose: () => void; }

export function CDPImportDialog({ onClose }: CDPImportDialogProps) {
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const packs = useAppStore((s) => s.packs);
  const importCDP = useAppStore((s) => s.importCDP);
  const updateCDP = useAppStore((s) => s.updateCDP);

  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [updatingPackId, setUpdatingPackId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [step, setStep] = useState<'url' | 'date-shift'>('url');
  const [pendingUrl, setPendingUrl] = useState('');
  const [shiftStartDate, setShiftStartDate] = useState('');
  const [shiftTargetDate, setShiftTargetDate] = useState('');
  const [shiftDurationDays, setShiftDurationDays] = useState(0);
  const [shiftHasTargetDate, setShiftHasTargetDate] = useState(false);

  function todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dateDiffDays(a: string, b: string): number {
    return Math.round(
      (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime())
      / 86_400_000
    );
  }

  async function handleImport() {
    const trimmed = normalizePackUrl(url.trim());
    if (!trimmed) return;
    setImporting(true); setMessage(null);
    try {
      const meta = await fetchCDPManifestOnly(trimmed);
      if (meta.allowShiftOnImport) {
        const today = todayStr();
        setShiftStartDate(today);
        setPendingUrl(trimmed);
        if (meta.targetDate) {
          const duration = dateDiffDays(today, meta.targetDate);
          setShiftDurationDays(duration);
          setShiftTargetDate(meta.targetDate);
          setShiftHasTargetDate(true);
        } else {
          setShiftHasTargetDate(false);
        }
        setStep('date-shift');
        return;
      }
      const packId = await importCDP(trimmed);
      onClose();
      navigate(`/packs/${packId}`);
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Import failed.' });
    } finally {
      setImporting(false);
    }
  }

  async function handleConfirmShift() {
    setImporting(true); setMessage(null);
    try {
      const today = todayStr();
      const offsetDays = dateDiffDays(today, shiftStartDate);
      const packId = await importCDP(pendingUrl, offsetDays);
      onClose();
      navigate(`/packs/${packId}`);
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Import failed.' });
    } finally {
      setImporting(false);
    }
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

        {step === 'url' && (
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
        )}

        {step === 'date-shift' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This pack supports date shifting. Set when you want to start, and the target date will adjust automatically.
            </p>
            <div className={`grid gap-3 ${shiftHasTargetDate ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="space-y-1">
                <Label htmlFor="shift-start">Start date</Label>
                <Input
                  id="shift-start"
                  type="date"
                  value={shiftStartDate}
                  onChange={(e) => {
                    setShiftStartDate(e.target.value);
                    if (e.target.value && shiftHasTargetDate) {
                      const d = new Date(e.target.value + 'T00:00:00');
                      d.setDate(d.getDate() + shiftDurationDays);
                      setShiftTargetDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                    }
                  }}
                />
              </div>
              {shiftHasTargetDate && (
                <div className="space-y-1">
                  <Label htmlFor="shift-target">Target date</Label>
                  <Input
                    id="shift-target"
                    type="date"
                    value={shiftTargetDate}
                    onChange={(e) => {
                      setShiftTargetDate(e.target.value);
                      if (e.target.value) {
                        const d = new Date(e.target.value + 'T00:00:00');
                        d.setDate(d.getDate() - shiftDurationDays);
                        setShiftStartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                      }
                    }}
                  />
                </div>
              )}
            </div>
            {shiftHasTargetDate && (
              <p className="text-center text-xs text-muted-foreground">
                Duration: {shiftDurationDays} days
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={handleConfirmShift} disabled={importing} className="flex-1">
                {importing ? 'Importing…' : 'Import with these dates'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStep('url');
                  setPendingUrl('');
                  setShiftStartDate('');
                  setShiftTargetDate('');
                  setShiftDurationDays(0);
                  setShiftHasTargetDate(false);
                }}
                disabled={importing}
              >
                Back
              </Button>
            </div>
          </div>
        )}

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
