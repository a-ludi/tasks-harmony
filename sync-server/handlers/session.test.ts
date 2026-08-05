import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { randomBytes } from 'crypto';
import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { createHash } from 'node:crypto';

function makePQPair() {
  const kem = ml_kem1024.keygen();
  const dsa = ml_dsa87.keygen();
  const combined = Buffer.concat([kem.publicKey, dsa.publicKey]);
  const syncId = createHash('sha256').update(combined).digest('hex');
  return { kem, dsa, syncId };
}

function toBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

const mockGetDel = mock(async (_key: string) => 'a'.repeat(64));
const mockSet = mock(async () => 'OK' as const);
mock.module('../redis', () => ({ redis: { getdel: mockGetDel, set: mockSet } }));

const { handleSession } = await import('./session');

const SYNC_TOKEN = 'a'.repeat(64);

function makeReq(body: unknown): Request {
  return new Request('http://localhost/sync/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('handleSession', () => {
  beforeEach(() => { mockGetDel.mockClear(); mockSet.mockClear(); });

  it('returns 400 when syncToken is not 64 hex chars', async () => {
    const nonce = randomBytes(32).toString('hex');
    const res = await handleSession(makeReq({ nonce, syncToken: 'short' }));
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

  it('returns 400 when nonce is not a 64-char hex string', async () => {
    const res = await handleSession(makeReq({
      nonce: 'not-a-hex-nonce',
      syncToken: SYNC_TOKEN,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when nonce is too long (> 64 chars)', async () => {
    const longNonce = 'a'.repeat(65);
    const res = await handleSession(makeReq({
      nonce: longNonce,
      syncToken: SYNC_TOKEN,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 200 with sessionToken using only nonce and syncToken (no hmac required)', async () => {
    const nonce = randomBytes(32).toString('hex');
    mockGetDel.mockImplementationOnce(async () => 'legacy:' + SYNC_TOKEN);
    const res = await handleSession(makeReq({ nonce, syncToken: SYNC_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json() as { sessionToken: string };
    expect(body.sessionToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns 401 when nonce was not issued by server (getDel returns null)', async () => {
    mockGetDel.mockImplementationOnce(async () => null);
    const nonce = randomBytes(32).toString('hex');
    const res = await handleSession(makeReq({ nonce, syncToken: SYNC_TOKEN }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when submitted syncToken does not match the syncToken bound to the nonce', async () => {
    const legitimateToken = 'a'.repeat(64);
    const attackerToken = 'f'.repeat(64);
    mockGetDel.mockImplementationOnce(async () => 'legacy:' + legitimateToken);

    const nonce = randomBytes(32).toString('hex');
    const res = await handleSession(makeReq({ nonce, syncToken: attackerToken }));
    expect(res.status).toBe(401);
  });
});

describe('handleSession — cross-flavour attack refusal', () => {
  beforeEach(() => { mockGetDel.mockClear(); mockSet.mockClear(); });

  it('rejects legacy session request when the nonce was issued for a PQ syncId', async () => {
    // Simulate attacker observing a PQ user's syncId (public knowledge)
    // and replaying it through the legacy request path.
    // The mock returns untagged syncId (what today's code writes).
    mockGetDel.mockImplementationOnce(async () => 'b'.repeat(64));

    const res = await handleSession(makeReq({
      nonce: 'c'.repeat(64),
      syncToken: 'b'.repeat(64), // Attacker replays the syncId as syncToken
    }));

    // Before the fix, this returns 200 (bug — strings match).
    // After the fix, this returns 401 (protected — flavour tag mismatch).
    expect(res.status).toBe(401);
  });
});

describe('handleSession — PQ path', () => {
  beforeEach(() => { mockGetDel.mockClear(); mockSet.mockClear(); });

  it('returns 200 with sessionToken for a valid ML-DSA signature', async () => {
    const { kem, dsa, syncId } = makePQPair();
    const nonce = 'c'.repeat(64);
    mockGetDel.mockImplementationOnce(async () => 'pq:' + syncId);

    const signPayload = Buffer.from(nonce + syncId);
    const signature = ml_dsa87.sign(signPayload, dsa.secretKey);

    const res = await handleSession(makeReq({
      nonce,
      mldsaPublicKey: toBase64url(dsa.publicKey),
      mlkemPublicKey: toBase64url(kem.publicKey),
      signature: toBase64url(signature),
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { sessionToken: string };
    expect(body.sessionToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns 400 when mldsaPublicKey decodes to wrong byte length', async () => {
    const { kem, syncId } = makePQPair();
    const nonce = 'c'.repeat(64);
    mockGetDel.mockImplementationOnce(async () => 'pq:' + syncId);
    const res = await handleSession(makeReq({
      nonce,
      mldsaPublicKey: toBase64url(new Uint8Array(10)), // wrong size
      mlkemPublicKey: toBase64url(kem.publicKey),
      signature: toBase64url(new Uint8Array(4627)),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when SHA-256(mlkemPk || mldsaPk) does not match stored syncId', async () => {
    const { dsa, syncId } = makePQPair();
    const wrongKem = ml_kem1024.keygen(); // different KEM key
    const nonce = 'c'.repeat(64);
    mockGetDel.mockImplementationOnce(async () => 'pq:' + syncId);

    const signPayload = Buffer.from(nonce + syncId);
    const signature = ml_dsa87.sign(signPayload, dsa.secretKey);

    const res = await handleSession(makeReq({
      nonce,
      mldsaPublicKey: toBase64url(dsa.publicKey),
      mlkemPublicKey: toBase64url(wrongKem.publicKey),
      signature: toBase64url(signature),
    }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered signature', async () => {
    const { kem, dsa, syncId } = makePQPair();
    const nonce = 'c'.repeat(64);
    mockGetDel.mockImplementationOnce(async () => 'pq:' + syncId);

    const signPayload = Buffer.from(nonce + syncId);
    const signature = ml_dsa87.sign(signPayload, dsa.secretKey);
    signature[0] ^= 0xff; // tamper

    const res = await handleSession(makeReq({
      nonce,
      mldsaPublicKey: toBase64url(dsa.publicKey),
      mlkemPublicKey: toBase64url(kem.publicKey),
      signature: toBase64url(signature),
    }));
    expect(res.status).toBe(401);
  });

  it('rejects PQ session request when the nonce was issued for a legacy syncToken', async () => {
    const { kem, dsa } = makePQPair();
    const nonce = 'c'.repeat(64);
    // Simulate attacker trying to use a legacy-issued nonce with PQ path
    mockGetDel.mockImplementationOnce(async () => 'legacy:' + 'a'.repeat(64));

    const syncId = 'b'.repeat(64); // Different from stored legacy token
    const signPayload = Buffer.from(nonce + syncId);
    const signature = ml_dsa87.sign(signPayload, dsa.secretKey);

    const res = await handleSession(makeReq({
      nonce,
      mldsaPublicKey: toBase64url(dsa.publicKey),
      mlkemPublicKey: toBase64url(kem.publicKey),
      signature: toBase64url(signature),
    }));
    expect(res.status).toBe(401);
  });
});
