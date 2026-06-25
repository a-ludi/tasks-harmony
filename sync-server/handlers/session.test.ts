import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { createHmac, randomBytes } from 'crypto';

const APP_SECRET = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; // 32 null bytes base64
process.env.SYNC_APP_SECRET = APP_SECRET;

const mockDel = mock(async (_key: string) => 1);
const mockSet = mock(async () => 'OK' as const);
mock.module('../redis', () => ({ redis: { del: mockDel, set: mockSet } }));

const { handleSession } = await import('./session');

const SYNC_TOKEN = 'a'.repeat(64);

function makeHmac(nonce: string): string {
  const secretBytes = Buffer.from(APP_SECRET, 'base64');
  return createHmac('sha256', secretBytes).update(nonce).digest('hex');
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/sync/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('handleSession', () => {
  beforeEach(() => { mockDel.mockClear(); mockSet.mockClear(); });

  it('returns sessionToken when HMAC is valid', async () => {
    const nonce = randomBytes(32).toString('hex');
    const res = await handleSession(makeReq({ nonce, hmac: makeHmac(nonce), syncToken: SYNC_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json() as { sessionToken: string };
    expect(body.sessionToken).toMatch(/^[a-f0-9]{64}$/);
    expect(mockDel).toHaveBeenCalledWith(`nonce:${nonce}`);
    expect(mockSet).toHaveBeenCalledWith(`session:${body.sessionToken}`, SYNC_TOKEN, 'EX', 86400);
  });

  it('returns 401 when HMAC is wrong', async () => {
    const nonce = randomBytes(32).toString('hex');
    const res = await handleSession(makeReq({ nonce, hmac: 'deadbeef'.repeat(8), syncToken: SYNC_TOKEN }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when nonce was already used (del returns 0)', async () => {
    mockDel.mockImplementationOnce(async () => 0);
    const nonce = randomBytes(32).toString('hex');
    const res = await handleSession(makeReq({ nonce, hmac: makeHmac(nonce), syncToken: SYNC_TOKEN }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when syncToken is not 64 hex chars', async () => {
    const nonce = randomBytes(32).toString('hex');
    const res = await handleSession(makeReq({ nonce, hmac: makeHmac(nonce), syncToken: 'short' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on malformed JSON', async () => {
    const req = new Request('http://localhost/sync/session', {
      method: 'POST',
      body: 'not json',
    });
    const res = await handleSession(req);
    expect(res.status).toBe(400);
  });
});
