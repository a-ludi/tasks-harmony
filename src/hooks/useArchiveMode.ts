import { useState } from 'react';

export function resolveInitialArchiveMode(stored: string | null): boolean {
  return stored === 'true';
}

export function useArchiveMode() {
  const [archiveMode, setArchiveMode] = useState<boolean>(() =>
    resolveInitialArchiveMode(localStorage.getItem('archive-mode')),
  );

  function toggle() {
    setArchiveMode((a) => {
      const next = !a;
      localStorage.setItem('archive-mode', String(next));
      return next;
    });
  }

  return { archiveMode, toggle };
}
