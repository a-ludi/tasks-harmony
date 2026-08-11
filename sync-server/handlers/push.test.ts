import { describe, it, expect, mock, beforeEach } from 'bun:test';

process.env.COUCHDB_URL = 'http://couch:5984';
process.env.COUCHDB_USER = 'admin';
process.env.COUCHDB_PASSWORD = 'pw';
process.env.VAPID_PUBLIC_KEY = 'BN_test_public_key';

// Mock redis before importing handler
mock.module('../redis', () => ({ redis: { get: mock(() => Promise.resolve('syncid-abc')) } }));
mock.module('../couch', () => ({
  couchPut: mock(() => Promise.resolve()),
  couchDel: mock(() => Promise.resolve()),
  couchFind: mock(() => Promise.resolve([])),
  couchGet: mock(() => Promise.resolve(null)),
}));

const { handlePush } = await import('./push');

function makeRequest(method: string, path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + 'a'.repeat(64) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /push/vapid-public-key', () => {
  it('returns 200 with public key', async () => {
    const res = await handlePush(makeRequest('GET', '/push/vapid-public-key'), null);
    expect(res.status).toBe(200);
    const body = await res.json() as { publicKey: string };
    expect(body.publicKey).toBe('BN_test_public_key');
  });
});

describe('PUT /push/subscriptions', () => {
  it('returns 204 on valid body', async () => {
    const res = await handlePush(
      makeRequest('PUT', '/push/subscriptions', {
        endpoint: 'https://fcm.googleapis.com/send/abc',
        keys: { p256dh: 'key', auth: 'auth' },
      }),
      null,
    );
    expect(res.status).toBe(204);
  });

  it('returns 400 on invalid body', async () => {
    const res = await handlePush(
      makeRequest('PUT', '/push/subscriptions', { endpoint: 'not-a-url' }),
      null,
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const req = new Request('http://localhost/push/subscriptions', { method: 'PUT' });
    const res = await handlePush(req, null);
    expect(res.status).toBe(401);
  });
});
