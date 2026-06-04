import { useRef, useState } from 'react';
import { useAppStore } from '@/store';
import type { UserProfile, XPSettings } from '@/types';
import { exportAppState } from '@/sync/export';
import { wrapStateInZip, buildBackupFilename, unwrapStateFromZip, isAppStatePristine } from '@/backup/backup';
import { importAppState } from '@/sync/import';
import { validateAppState } from '@/schemas/validate';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function ProfilePage() {
  const profile = useAppStore((s) => s.profile);
  const xpSettings = useAppStore((s) => s.xpSettings);
  const completions = useAppStore((s) => s.completions);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const db = useAppStore((s) => s.db);
  const packs = useAppStore((s) => s.packs);
  const reload = useAppStore((s) => s.reload);

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [activeXPSettingsId, setActiveXPSettingsId] = useState(profile?.activeXPSettingsId ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [savedAlert, setSavedAlert] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  if (!profile) return <div className="p-6 text-gray-500">Loading profile…</div>;

  const totalXP = completions.reduce((sum, c) => sum + (c.xpEarned ?? 0), 0);
  const activeSettings: XPSettings | undefined = xpSettings.find((s) => s.id === activeXPSettingsId);

  function handleSave() {
    if (!isValidEmail(email)) { setEmailError('Please enter a valid email address.'); setEmail(profile?.email ?? ''); return; }
    setEmailError(null);
    const updatedProfile: UserProfile = { ...profile!, displayName: displayName.trim(), email: email.trim(), activeXPSettingsId };
    updateProfile(updatedProfile);
    setSavedAlert(true);
  }

  async function handleExport() {
    if (!db) return;
    const state = await exportAppState(db);
    const zipBytes = wrapStateInZip(state);
    const date = new Date().toISOString().substring(0, 10);
    const filename = buildBackupFilename(date);
    const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !db) return;
    setImportError(null);
    setImportSuccess(false);

    if (!isAppStatePristine(packs, completions)) {
      const ok = window.confirm(
        'This will replace all your current data with the backup. This cannot be undone. Continue?'
      );
      if (!ok) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    try {
      const buffer = await file.arrayBuffer();
      const zipBytes = new Uint8Array(buffer);
      const state = unwrapStateFromZip(zipBytes);
      const validation = validateAppState(state);
      if (!validation.valid) {
        setImportError(`Invalid backup file: ${validation.errors.join('; ')}`);
        return;
      }
      await importAppState(db, state);
      await reload();
      setImportSuccess(true);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import backup');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="mx-auto max-w-lg p-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">XP Summary</h2>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-indigo-600">{totalXP.toLocaleString()}</span>
          <span className="text-gray-500">total XP</span>
        </div>
        {activeSettings && <p className="mt-1 text-sm text-gray-600">Active formula: <span className="font-medium">{activeSettings.name}</span></p>}
        {profile.email && <p className="mt-1 text-sm text-gray-600">Email: <span className="font-medium">{profile.email}</span></p>}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Account Details</h2>

        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
          <input id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
            className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ${emailError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'}`} />
          {emailError && <p className="mt-1 text-sm text-red-600">{emailError}</p>}
        </div>

        {xpSettings.length > 0 && (
          <div>
            <label htmlFor="xpSettings" className="block text-sm font-medium text-gray-700 mb-1">XP Formula</label>
            <select id="xpSettings" value={activeXPSettingsId} onChange={(e) => setActiveXPSettingsId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              {xpSettings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {savedAlert && (
          <div role="alert" className="flex items-center justify-between rounded-md bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">
            <span>Changes saved.</span>
            <button onClick={() => setSavedAlert(false)} className="ml-4 text-green-700 hover:text-green-900 font-medium" aria-label="Dismiss">&times;</button>
          </div>
        )}

        <button onClick={handleSave} className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
          Save changes
        </button>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Backup</h2>
        <p className="text-sm text-gray-600">
          Export all your data as a ZIP file, or restore from a previously exported backup.
        </p>
        <button
          onClick={handleExport}
          className="w-full rounded-md bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          Export Backup
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleImport}
          className="hidden"
          aria-label="Import backup file"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          Import Backup
        </button>
        {importError && (
          <p className="text-sm text-red-600" role="alert">{importError}</p>
        )}
        {importSuccess && (
          <p className="text-sm text-green-600" role="status">Backup imported successfully.</p>
        )}
      </section>
    </div>
  );
}
