const PUSH_URL = import.meta.env.VITE_PUSH_URL ?? import.meta.env.VITE_SYNC_URL;
const SESSION_KEY = 'sync-session-token';

function sessionHeaders(): Record<string, string> {
  const token = localStorage.getItem(SESSION_KEY);
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function pushFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${PUSH_URL}${path}`, {
    ...init,
    headers: { ...sessionHeaders(), ...init?.headers },
  });
  if (res.status === 401) localStorage.removeItem(SESSION_KEY);
  return res;
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${PUSH_URL}/push/vapid-public-key`);
    if (!res.ok) return null;
    const { publicKey } = await res.json() as { publicKey: string };
    return publicKey;
  } catch { return null; }
}

export async function registerSubscription(
  endpoint: string,
  keys: { p256dh: string; auth: string },
): Promise<boolean> {
  try {
    const res = await pushFetch('/push/subscriptions', {
      method: 'PUT',
      body: JSON.stringify({ endpoint, keys }),
    });
    return res.ok;
  } catch { return false; }
}

export async function unregisterSubscription(endpoint: string): Promise<void> {
  try {
    await pushFetch('/push/subscriptions', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    });
  } catch { /* best-effort */ }
}

export async function sendTestNotification(): Promise<void> {
  try {
    await pushFetch('/push/test', { method: 'POST' });
  } catch { /* best-effort */ }
}

export interface ServerSchedule {
  choreKey: string;
  nextNotificationAt: string;
}

export async function fetchSchedules(): Promise<ServerSchedule[]> {
  try {
    const res = await pushFetch('/push/schedules');
    if (!res.ok) return [];
    return res.json() as Promise<ServerSchedule[]>;
  } catch { return []; }
}

export async function upsertSchedule(
  packId: string,
  choreId: string,
  body: {
    title: string;
    recurrence: { frequency: string; interval: number; startDate: string; windowStartTime: string };
    duePeriod?: { value: number; unit: string };
    trigger: 'at-due-time';
  },
): Promise<void> {
  try {
    await pushFetch(`/push/schedules/${packId}/${choreId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  } catch { /* best-effort */ }
}

export async function deleteSchedule(packId: string, choreId: string): Promise<void> {
  try {
    await pushFetch(`/push/schedules/${packId}/${choreId}`, { method: 'DELETE' });
  } catch { /* best-effort */ }
}
