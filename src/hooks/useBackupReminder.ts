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

function validateFrequency(raw: string | null): BackupReminderFrequency {
  const valid: BackupReminderFrequency[] = ['never', 'daily', 'weekly', 'monthly'];
  return valid.includes(raw as BackupReminderFrequency) ? (raw as BackupReminderFrequency) : 'daily';
}

function validateExportFormat(raw: string | null): 'encrypted' | 'plain' {
  return raw === 'plain' ? 'plain' : 'encrypted';
}

export function useBackupReminder(): UseBackupReminderReturn {
  interface State {
    frequency: BackupReminderFrequency;
    exportFormat: 'encrypted' | 'plain';
    isDue: boolean;
  }

  const [state, setState] = useState<State>(() => {
    const frequency = validateFrequency(localStorage.getItem(KEYS.frequency));
    const exportFormat = validateExportFormat(localStorage.getItem(KEYS.exportFormat));
    const isDue = computeIsDue(
      frequency,
      localStorage.getItem(KEYS.lastBackedUpAt),
      localStorage.getItem(KEYS.dismissedAt),
    );
    return { frequency, exportFormat, isDue };
  });

  function setFrequency(f: BackupReminderFrequency) {
    localStorage.setItem(KEYS.frequency, f);
    setState((prev) => ({
      ...prev,
      frequency: f,
      isDue: computeIsDue(f, localStorage.getItem(KEYS.lastBackedUpAt), localStorage.getItem(KEYS.dismissedAt)),
    }));
  }

  function setExportFormat(f: 'encrypted' | 'plain') {
    localStorage.setItem(KEYS.exportFormat, f);
    setState((prev) => ({ ...prev, exportFormat: f }));
  }

  function dismiss() {
    const now = new Date().toISOString();
    localStorage.setItem(KEYS.dismissedAt, now);
    setState((prev) => ({
      ...prev,
      isDue: computeIsDue(prev.frequency, localStorage.getItem(KEYS.lastBackedUpAt), now),
    }));
  }

  function recordExport() {
    const now = new Date().toISOString();
    localStorage.setItem(KEYS.lastBackedUpAt, now);
    setState((prev) => ({
      ...prev,
      isDue: computeIsDue(prev.frequency, now, localStorage.getItem(KEYS.dismissedAt)),
    }));
  }

  return {
    isDue: state.isDue,
    frequency: state.frequency,
    exportFormat: state.exportFormat,
    setFrequency,
    setExportFormat,
    dismiss,
    recordExport,
  };
}
