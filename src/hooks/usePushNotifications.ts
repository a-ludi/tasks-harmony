import { useState, useEffect } from 'react';
import {
  fetchVapidPublicKey,
  registerSubscription,
  unregisterSubscription,
  sendTestNotification,
} from '@/sync/pushApi';

const VAPID_KEY_STORAGE = 'push-vapid-key';

export type PushPermissionState = NotificationPermission | 'unsupported';

export interface PushNotificationState {
  supported: boolean;
  permission: PushPermissionState;
  loading: boolean;
  requestPermission: () => Promise<void>;
  sendTest: () => Promise<void>;
}

function isSupported(): boolean {
  return (
    typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    location.protocol === 'https:'
  );
}

function base64urlToUint8Array(base64url: string): Uint8Array {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
  const binaryString = atob(padded);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function subscriptionToKeys(sub: PushSubscription): { p256dh: string; auth: string } {
  const p256dh = btoa(
    String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')!)),
  ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const auth = btoa(
    String.fromCharCode(...new Uint8Array(sub.getKey('auth')!)),
  ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return { p256dh, auth };
}

async function subscribe(publicKey: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64urlToUint8Array(publicKey) as BufferSource,
  });
  localStorage.setItem(VAPID_KEY_STORAGE, publicKey);
  await registerSubscription(sub.endpoint, subscriptionToKeys(sub));
}

export function usePushNotifications(): PushNotificationState {
  const supported = isSupported();
  const [permission, setPermission] = useState<PushPermissionState>(
    supported ? Notification.permission : 'unsupported',
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supported || Notification.permission !== 'granted') return;
    void (async () => {
      const serverKey = await fetchVapidPublicKey();
      if (!serverKey) return;
      const storedKey = localStorage.getItem(VAPID_KEY_STORAGE);
      if (storedKey && storedKey !== serverKey) {
        // Key rotated — unsubscribe old
        const reg = await navigator.serviceWorker.ready;
        const oldSub = await reg.pushManager.getSubscription();
        if (oldSub) {
          await unregisterSubscription(oldSub.endpoint);
          await oldSub.unsubscribe();
        }
      }
      await subscribe(serverKey);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function requestPermission() {
    if (!supported) return;
    setLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        const serverKey = await fetchVapidPublicKey();
        if (serverKey) {
          await subscribe(serverKey);
          await sendTestNotification();
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return {
    supported,
    permission,
    loading,
    requestPermission,
    sendTest: sendTestNotification,
  };
}
