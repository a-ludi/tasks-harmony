import { useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TasksHarmonyDB } from '@/db/schema';
import { useBackupReminder } from '@/hooks/useBackupReminder';
import { doExport } from '@/backup/doExport';

interface Props {
  db: IDBPDatabase<TasksHarmonyDB>;
}

export function BackupReminderBanner({ db }: Props) {
  const { isDue, dismiss, recordExport } = useBackupReminder();
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      await doExport(db);
      recordExport();
    } catch {
      setError('Export failed. Try again or use the Profile page.');
    } finally {
      setLoading(false);
    }
  }

  if (!isDue || sessionDismissed) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-sm text-amber-800 dark:text-amber-300 mb-4"
    >
      <span role={error ? 'alert' : 'status'}>{error ?? 'Time to back up your data.'}</span>
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={handleExport}
          disabled={loading}
          className="font-medium underline hover:no-underline disabled:opacity-50"
        >
          {loading ? 'Exporting…' : 'Export now'}
        </button>
        <button
          onClick={() => setSessionDismissed(true)}
          className="underline hover:no-underline"
        >
          Remind me later
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss reminder"
          className="hover:opacity-70 text-base leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
