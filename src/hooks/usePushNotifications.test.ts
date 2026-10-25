import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

// Save originals
let originalNotification: typeof globalThis.Notification;
let originalNavigator: Navigator;
let originalWindow: Window & typeof globalThis;

describe('isSupported', () => {
  beforeEach(() => {
    // Simulate a secure http://localhost environment
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'default' },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { serviceWorker: {} },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: {
        PushManager: {},
        isSecureContext: true,
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'location', {
      value: { protocol: 'http:' },  // localhost is http
      configurable: true,
      writable: true,
    });
  });

  it('returns true on http://localhost (isSecureContext=true, protocol=http:)', async () => {
    const { isSupported } = await import('./usePushNotifications');
    expect(isSupported()).toBe(true);
  });
});
