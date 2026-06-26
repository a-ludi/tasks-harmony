import { useRef, useState } from 'react';
import { useAppStore } from '@/store';
import type { UserProfile, XPSettings } from '@/types';
import { exportAppState, encryptedExport } from '@/sync/export';
import { wrapStateInZip, buildBackupFilename, unwrapStateFromZip, isAppStatePristine } from '@/backup/backup';
import { importAppState, decryptedImport } from '@/sync/import';
import { validateAppState } from '@/schemas/validate';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getOrCreateSyncKey, exportKeyFile, importKeyFile } from '@/sync/credentials';
import { putCredentials } from '@/db';
import { pull } from '@/sync/server';
import { SyncPanel } from '@/components/sync/SyncPanel';

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
  const { theme, toggle } = useTheme();

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [activeXPSettingsId, setActiveXPSettingsId] = useState(profile?.activeXPSettingsId ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [savedAlert, setSavedAlert] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [exportFormat, setExportFormat] = useState<'encrypted' | 'plain'>('encrypted');
  const [keyExportError, setKeyExportError] = useState<string | null>(null);
  const [keyImportError, setKeyImportError] = useState<string | null>(null);
  const [keyImportSuccess, setKeyImportSuccess] = useState(false);
  const keyFileInputRef = useRef<HTMLInputElement>(null);

  if (!profile) return <div className="p-6 text-muted-foreground">Loading profile…</div>;

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
    if (exportFormat === 'encrypted') {
      const blob = await encryptedExport(db);
      const file = new Blob([blob.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tasks-harmony-backup-${new Date().toISOString().substring(0, 10)}.enc`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } else {
      const state = await exportAppState(db);
      const zipBytes = wrapStateInZip(state);
      const date = new Date().toISOString().substring(0, 10);
      const filename = buildBackupFilename(date);
      const file = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    }
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
      let state;
      if (file.name.endsWith('.enc')) {
        const blob = new Uint8Array(buffer);
        state = await decryptedImport(db, blob);
      } else {
        const zipBytes = new Uint8Array(buffer);
        state = unwrapStateFromZip(zipBytes);
      }
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

  async function handleKeyExport() {
    if (!db) return;
    setKeyExportError(null);
    try {
      const key = await getOrCreateSyncKey(db);
      const json = await exportKeyFile(key);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tasks-harmony-sync-key.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch {
      setKeyExportError('Failed to export sync key.');
    }
  }

  async function handleKeyImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !db) return;
    setKeyImportError(null);
    setKeyImportSuccess(false);
    const ok = window.confirm(
      'Importing a new key will make your existing server data inaccessible. Your local data is unaffected. Continue?'
    );
    if (!ok) {
      if (keyFileInputRef.current) keyFileInputRef.current.value = '';
      return;
    }
    try {
      const text = await file.text();
      const key = await importKeyFile(text);
      await putCredentials(db, { id: 'main', cryptoKey: key });
      const imported = await pull(db);
      if (imported) await reload();
      setKeyImportSuccess(true);
    } catch {
      setKeyImportError('Invalid key file.');
    } finally {
      if (keyFileInputRef.current) keyFileInputRef.current.value = '';
    }
  }

  return (
    <div className="mx-auto max-w-lg p-6 space-y-8">
      <h1 className="text-2xl font-bold text-foreground">Profile</h1>

      <section className="rounded-lg border border-border bg-background p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">XP Summary</h2>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-primary">{totalXP.toLocaleString()}</span>
          <span className="text-muted-foreground">total XP</span>
        </div>
        {activeSettings && <p className="mt-1 text-sm text-muted-foreground">Active formula: <span className="font-medium text-foreground">{activeSettings.name}</span></p>}
        {profile.email && <p className="mt-1 text-sm text-muted-foreground">Email: <span className="font-medium text-foreground">{profile.email}</span></p>}
      </section>

      <section className="rounded-lg border border-border bg-background p-4 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Account Details</h2>

        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-foreground mb-1">Display Name</label>
          <Input id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">Email</label>
          <Input id="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
            aria-invalid={!!emailError} />
          {emailError && <p className="mt-1 text-sm text-destructive">{emailError}</p>}
        </div>

        {xpSettings.length > 0 && (
          <div>
            <label htmlFor="xpSettings" className="block text-sm font-medium text-foreground mb-1">XP Formula</label>
            <Select value={activeXPSettingsId} onValueChange={(v) => setActiveXPSettingsId(v)}>
              <SelectTrigger id="xpSettings">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {xpSettings.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {savedAlert && (
          <div role="alert" className="flex items-center justify-between rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 px-4 py-2 text-sm text-green-800 dark:text-green-300">
            <span>Changes saved.</span>
            <button onClick={() => setSavedAlert(false)} className="ml-4 text-green-700 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 font-medium" aria-label="Dismiss">&times;</button>
          </div>
        )}

        <button onClick={handleSave} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          Save changes
        </button>
      </section>

      <section className="rounded-lg border border-border bg-background p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Backup</h2>
        <p className="text-sm text-muted-foreground">
          Export all your data as a ZIP file, or restore from a previously exported backup.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">Format</span>
          <label className="flex items-center gap-1 text-sm cursor-pointer">
            <input
              type="radio"
              name="exportFormat"
              value="encrypted"
              checked={exportFormat === 'encrypted'}
              onChange={() => setExportFormat('encrypted')}
            />
            Encrypted
          </label>
          <label className="flex items-center gap-1 text-sm cursor-pointer">
            <input
              type="radio"
              name="exportFormat"
              value="plain"
              checked={exportFormat === 'plain'}
              onChange={() => setExportFormat('plain')}
            />
            Plain
          </label>
        </div>
        <button
          onClick={handleExport}
          className="w-full rounded-md bg-muted px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Export Backup
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.enc"
          onChange={handleImport}
          className="hidden"
          aria-label="Import backup file"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Import Backup
        </button>
        {importError && (
          <p className="text-sm text-destructive" role="alert">{importError}</p>
        )}
        {importSuccess && (
          <p className="text-sm text-green-600 dark:text-green-400" role="status">Backup imported successfully.</p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-background p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sync Key</h2>
        <p className="text-sm text-muted-foreground">
          Export your sync key to set up another device, or import a key from another device.
        </p>
        <button
          onClick={handleKeyExport}
          className="w-full rounded-md bg-muted px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Export Sync Key
        </button>
        <input
          ref={keyFileInputRef}
          type="file"
          accept=".json"
          onChange={handleKeyImport}
          className="hidden"
          aria-label="Import sync key file"
        />
        <button
          onClick={() => keyFileInputRef.current?.click()}
          className="w-full rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Import Sync Key
        </button>
        {keyExportError && <p className="text-sm text-destructive" role="alert">{keyExportError}</p>}
        {keyImportError && <p className="text-sm text-destructive" role="alert">{keyImportError}</p>}
        {keyImportSuccess && <p className="text-sm text-green-600 dark:text-green-400" role="status">Sync key imported successfully.</p>}
      </section>

      <SyncPanel />

      <section className="rounded-lg border border-border bg-background p-4 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">App</h2>
        <div className="flex items-center gap-2">
          <Switch checked={theme === 'dark'} onCheckedChange={toggle} />
          <Label className="text-sm font-normal cursor-pointer" onClick={toggle}>Dark mode</Label>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-background p-4 shadow-sm space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">About</h2>
        <p className="text-sm font-semibold text-foreground">Tasks Harmony</p>
        <p className="text-sm text-muted-foreground">A personal chore tracker with streaks and XP rewards.</p>
        <p className="text-xs text-muted-foreground">
          v{import.meta.env.VITE_APP_VERSION} · {import.meta.env.VITE_BUILD_DATE}
        </p>
        <p className="text-xs text-muted-foreground">By Arne Ludwig</p>
        <a
          href="https://github.com/a-ludi/tasks-harmony"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          View on GitHub ↗
        </a>
      </section>
    </div>
  );
}
