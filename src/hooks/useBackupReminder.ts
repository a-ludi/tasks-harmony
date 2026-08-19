import { useState } from 'react';

export type BackupReminderFrequency = 'never' | 'daily' | 'weekly' | 'monthly';

const KEYS = {
  frequency: 'backup-reminder-frequency',
  dismissedAt: 'backup-reminder-dismissed-at',
  lastBackedUpAt: 'last-backed-up-at',
  exportFormat: 'backup-export-format',
} as const;

const PERIOD_DAYS: Record<Exclude<BackupReminderFrequency, 'never'>, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export function computeIsDue(
  frequency: BackupReminderFrequency,
  lastBackedUpAt: string | null,
  dismissedAt: string | null,
  now: Date = new Date(),
): boolean {
  if (frequency === 'never') return false;

  const epoch = new Date(0).toISOString();
  const a = lastBackedUpAt ?? epoch;
  const b = dismissedAt ?? epoch;
  const lastActionStr = a > b ? a : b;

  const d = new Date(lastActionStr);
  const lastMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nextDue = new Date(lastMidnight.getTime() + PERIOD_DAYS[frequency] * 24 * 60 * 60 * 1000);

  return now >= nextDue;
}

export interface UseBackupReminderReturn {
  isDue: boolean;
  frequency: BackupReminderFrequency;
  exportFormat: 'encrypted' | 'plain';
  setFrequency: (f: BackupReminderFrequency) => void;
  setExportFormat: (f: 'encrypted' | 'plain') => void;
  dismiss: () => void;
  recordExport: () => void;
}

export function useBackupReminder(): UseBackupReminderReturn {
  const [frequency, setFrequencyState] = useState<BackupReminderFrequency>(
    () => (localStorage.getItem(KEYS.frequency) as BackupReminderFrequency | null) ?? 'daily',
  );
  const [exportFormat, setExportFormatState] = useState<'encrypted' | 'plain'>(
    () => (localStorage.getItem(KEYS.exportFormat) as 'encrypted' | 'plain' | null) ?? 'encrypted',
  );
  const [isDue, setIsDue] = useState(() =>
    computeIsDue(
      (localStorage.getItem(KEYS.frequency) as BackupReminderFrequency | null) ?? 'daily',
      localStorage.getItem(KEYS.lastBackedUpAt),
      localStorage.getItem(KEYS.dismissedAt),
    ),
  );

  function setFrequency(f: BackupReminderFrequency) {
    localStorage.setItem(KEYS.frequency, f);
    setFrequencyState(f);
    setIsDue(computeIsDue(f, localStorage.getItem(KEYS.lastBackedUpAt), localStorage.getItem(KEYS.dismissedAt)));
  }

  function setExportFormat(f: 'encrypted' | 'plain') {
    localStorage.setItem(KEYS.exportFormat, f);
    setExportFormatState(f);
  }

  function dismiss() {
    const now = new Date().toISOString();
    localStorage.setItem(KEYS.dismissedAt, now);
    setIsDue(computeIsDue(frequency, localStorage.getItem(KEYS.lastBackedUpAt), now));
  }

  function recordExport() {
    const now = new Date().toISOString();
    localStorage.setItem(KEYS.lastBackedUpAt, now);
    setIsDue(computeIsDue(frequency, now, localStorage.getItem(KEYS.dismissedAt)));
  }

  return { isDue, frequency, exportFormat, setFrequency, setExportFormat, dismiss, recordExport };
}
