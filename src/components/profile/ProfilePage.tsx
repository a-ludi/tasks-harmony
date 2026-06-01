import { useState } from 'react';
import { useAppStore } from '@/store';
import type { UserProfile, XPSettings } from '@/types';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function ProfilePage() {
  const profile = useAppStore((s) => s.profile);
  const xpSettings = useAppStore((s) => s.xpSettings);
  const completions = useAppStore((s) => s.completions);
  const updateProfile = useAppStore((s) => s.updateProfile);

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [activeXPSettingsId, setActiveXPSettingsId] = useState(profile?.activeXPSettingsId ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [savedAlert, setSavedAlert] = useState(false);

  if (!profile) return <div className="p-6 text-gray-500">Loading profile…</div>;

  const totalXP = completions.reduce((sum, c) => sum + (c.xpEarned ?? 0), 0);
  const activeSettings: XPSettings | undefined = xpSettings.find((s) => s.id === activeXPSettingsId);

  function handleSave() {
    if (!isValidEmail(email)) { setEmailError('Please enter a valid email address.'); return; }
    setEmailError(null);
    const updatedProfile: UserProfile = { ...profile!, displayName: displayName.trim(), email: email.trim(), activeXPSettingsId };
    updateProfile(updatedProfile);
    setSavedAlert(true);
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
    </div>
  );
}
