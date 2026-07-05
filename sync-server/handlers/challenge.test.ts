import { describe, it, expect, mock, beforeEach } from 'bun:test';

const mockSet = mock(async () => 'OK' as const);
mock.module('../redis', () => ({ redis: { set: mockSet } }));

const { handleChallenge } = await import('./challenge');

const SYNC_TOKEN = 'a'.repeat(64);

function makeReq(body: unknown): Request {
  return new Request('http://localhost/sync/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('handleChallenge', () => {
  beforeEach(() => mockSet.mockClear());

  it('returns a 64-char hex nonce', async () => {
    const res = await handleChallenge(makeReq({ syncToken: SYNC_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json() as { nonce: string };
    expect(body.nonce).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stores the syncToken in Redis with 60s TTL', async () => {
    const res = await handleChallenge(makeReq({ syncToken: SYNC_TOKEN }));
    const { nonce } = await res.json() as { nonce: string };
    expect(mockSet).toHaveBeenCalledWith(`nonce:${nonce}`, SYNC_TOKEN, 'EX', 60, 'NX');
  });

  it('returns 400 when syncToken is missing', async () => {
    const res = await handleChallenge(makeReq({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when syncToken is not a 64-char hex string', async () => {
    const res = await handleChallenge(makeReq({ syncToken: 'short' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on malformed JSON', async () => {
    const req = new Request('http://localhost/sync/challenge', {
      method: 'POST',
      body: 'not json',
    });
    const res = await handleChallenge(req);
    expect(res.status).toBe(400);
  });
});

const SYNC_ID = 'b'.repeat(64); // valid 64-char hex

describe('handleChallenge — PQ path (syncId)', () => {
  beforeEach(() => mockSet.mockClear());

  it('accepts { syncId } body and returns a 64-char hex nonce', async () => {
    const res = await handleChallenge(makeReq({ syncId: SYNC_ID }));
    expect(res.status).toBe(200);
    const body = await res.json() as { nonce: string };
    expect(body.nonce).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stores syncId in Redis under nonce key with 60s TTL', async () => {
    const res = await handleChallenge(makeReq({ syncId: SYNC_ID }));
    const { nonce } = await res.json() as { nonce: string };
    expect(mockSet).toHaveBeenCalledWith(`nonce:${nonce}`, SYNC_ID, 'EX', 60, 'NX');
  });

  it('returns 400 when syncId is not a 64-char hex string', async () => {
    const res = await handleChallenge(makeReq({ syncId: 'short' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when both syncId and syncToken are absent', async () => {
    const res = await handleChallenge(makeReq({}));
    expect(res.status).toBe(400);
  });
});
