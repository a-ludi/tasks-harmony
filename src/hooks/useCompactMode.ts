import { useState } from 'react';

export function resolveInitialCompact(stored: string | null): boolean {
  return stored === 'true';
}

export function useCompactMode() {
  const [compact, setCompact] = useState<boolean>(() =>
    resolveInitialCompact(localStorage.getItem('compact-mode')),
  );

  function toggle() {
    setCompact((c) => {
      const next = !c;
      localStorage.setItem('compact-mode', String(next));
      return next;
    });
  }

  return { compact, toggle };
}
