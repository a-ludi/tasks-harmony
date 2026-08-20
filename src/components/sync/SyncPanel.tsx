import { useSync } from '@/hooks/useSync';
import { Button } from '@/components/ui/button';

export function SyncPanel() {
  const { lastSyncedAt, error, syncing, retryNow } = useSync();

  return (
    <section className="rounded-lg border border-border bg-background p-4 shadow-sm space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sync</h2>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Last synced:{' '}
          <span className="font-medium text-foreground">
            {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Never'}
          </span>
        </p>
        <Button variant="outline" size="sm" onClick={retryNow} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive"
        >
          <span>Sync failed after 3 attempts.</span>
          <button
            onClick={retryNow}
            className="ml-4 font-medium underline hover:no-underline"
          >
            Retry now
          </button>
        </div>
      )}
    </section>
  );
}
