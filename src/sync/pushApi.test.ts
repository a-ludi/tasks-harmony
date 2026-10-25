import { describe, it, expect, beforeEach, mock } from 'bun:test';

process.env.VITE_SYNC_URL = 'http://test.local';

// mock localStorage before importing pushApi (which uses it at call time, not module load time)
const mockLocalStorage = {
  getItem: (_key: string) => null,
  setItem: (_key: string, _value: string) => {},
  removeItem: (_key: string) => {},
};
Object.defineProperty(global, 'localStorage', { value: mockLocalStorage, writable: true, configurable: true });

const { fetchSchedules } = await import('./pushApi');

describe('fetchSchedules', () => {
  beforeEach(() => {
    // reset fetch mock before each test
    (globalThis as unknown as Record<string, unknown>).fetch = undefined;
  });

  it('returns [] when server returns HTML with status 200', async () => {
    globalThis.fetch = mock(async () =>
      new Response('<html><body>Not JSON</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    ) as unknown as typeof fetch;

    const result = await fetchSchedules();
    expect(result).toEqual([]);
  });

  it('returns [] when server returns non-ok status', async () => {
    globalThis.fetch = mock(async () =>
      new Response('', { status: 404 })
    ) as unknown as typeof fetch;

    const result = await fetchSchedules();
    expect(result).toEqual([]);
  });

  it('returns schedule array on valid JSON', async () => {
    const schedules = [
      { choreKey: 'pack1/chore1', nextNotificationAt: '2026-10-01T08:00:00.000Z' },
      { choreKey: 'pack2/chore2', nextNotificationAt: '2026-10-02T09:00:00.000Z' },
    ];
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify(schedules), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as unknown as typeof fetch;

    const result = await fetchSchedules();
    expect(result).toEqual(schedules);
  });
});
