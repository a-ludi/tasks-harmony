import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { isNewer, buildFullChangelog, type ChangelogEntry } from '@/changelog/format';

const IGNORED_KEY = 'tasks-harmony-update-ignored-version';
const REMIND_KEY = 'tasks-harmony-update-remind-date';

function todayISO(): string {
  return new Date().toISOString().substring(0, 10);
}

export interface UpdateState {
  available: boolean;
  version: string | null;
  highlights: string[];
  fullChangelog: Array<{ version: string; sections: Record<string, string[]> }>;
  updateNow: () => void;
  remindLater: () => void;
  ignoreUpdate: () => void;
}

export function useUpdateNotification(): UpdateState {
  const currentVersion = import.meta.env.VITE_APP_VERSION;
  const [available, setAvailable] = useState(false);
  const [latestEntry, setLatestEntry] = useState<ChangelogEntry | null>(null);
  const [fullChangelog, setFullChangelog] = useState<Array<{ version: string; sections: Record<string, string[]> }>>([]);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;

    fetch('/changelog.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((entries: ChangelogEntry[]) => {
        const latest = entries[0];
        if (!latest || !isNewer(latest.version, currentVersion)) return;

        if (localStorage.getItem(IGNORED_KEY) === latest.version) return;

        const remindDate = localStorage.getItem(REMIND_KEY);
        if (remindDate === todayISO()) return;

        setLatestEntry(latest);
        setFullChangelog(buildFullChangelog(entries, currentVersion));
        setAvailable(true);
      })
      .catch(() => {
        // Non-critical — silently ignore fetch failures
      });
  }, [needRefresh, currentVersion]);

  function updateNow() {
    updateServiceWorker(true);
  }

  function remindLater() {
    localStorage.setItem(REMIND_KEY, todayISO());
    setAvailable(false);
  }

  function ignoreUpdate() {
    if (latestEntry) localStorage.setItem(IGNORED_KEY, latestEntry.version);
    setAvailable(false);
  }

  return {
    available,
    version: latestEntry?.version ?? null,
    highlights: latestEntry?.highlights ?? [],
    fullChangelog,
    updateNow,
    remindLater,
    ignoreUpdate,
  };
}
