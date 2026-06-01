import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAppStore } from '@/store';
import NavBar from '@/components/layout/NavBar';
import Dashboard from '@/components/dashboard/Dashboard';

export default function App() {
  const init = useAppStore((s) => s.init);
  const loaded = useAppStore((s) => s.loaded);

  useEffect(() => {
    init();
  }, [init]);

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="mx-auto max-w-2xl px-4">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/profile"
            element={
              <div className="pt-8 text-center text-gray-500">
                Profile page — coming in Plan 3.
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
