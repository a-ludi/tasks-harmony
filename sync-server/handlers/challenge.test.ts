import { describe, it, expect, mock, beforeEach } from 'bun:test';

const mockSet = mock(async () => 'OK' as const);
mock.module('../redis', () => ({ redis: { set: mockSet } }));

const { handleChallenge } = await import('./challenge');

describe('handleChallenge', () => {
  beforeEach(() => mockSet.mockClear());

  it('returns a 64-char hex nonce', async () => {
    const res = await handleChallenge(new Request('http://localhost/sync/challenge'));
    expect(res.status).toBe(200);
    const body = await res.json() as { nonce: string };
    expect(body.nonce).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stores the nonce in Redis with 60s TTL', async () => {
    const res = await handleChallenge(new Request('http://localhost/sync/challenge'));
    const { nonce } = await res.json() as { nonce: string };
    expect(mockSet).toHaveBeenCalledWith(`nonce:${nonce}`, '1', 'EX', 60, 'NX');
  });
});
