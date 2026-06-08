import { useState, useEffect } from 'react';

export function resolveInitialTheme(stored: string | null, prefersDark: boolean): 'dark' | 'light' {
  if (stored === 'dark' || stored === 'light') return stored;
  return prefersDark ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    resolveInitialTheme(
      localStorage.getItem('theme'),
      window.matchMedia('(prefers-color-scheme: dark)').matches,
    ),
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') { root.classList.add('dark'); } else { root.classList.remove('dark'); }
    localStorage.setItem('theme', theme);
  }, [theme]);

  function toggle() { setTheme((t) => (t === 'dark' ? 'light' : 'dark')); }

  return { theme, toggle };
}
