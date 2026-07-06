import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { rm, mkdir, writeFile, utimes } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const TEST_BLOB_DIR = '/tmp/test-sync-blobs-' + Date.now();
process.env.SYNC_BLOB_DIR = TEST_BLOB_DIR;

const SYNC_TOKEN = 'a'.repeat(64);
const SESSION_TOKEN = 'b'.repeat(64);

const mockGet = mock(async (key: string) =>
  key === `session:${SESSION_TOKEN}` ? SYNC_TOKEN : null
);
mock.module('../redis', () => ({ redis: { get: mockGet } }));

const { handleBlob } = await import('./blob');

function makeReq(method: string, token: string, body?: Uint8Array, auth = SESSION_TOKEN): Request {
  return new Request(`http://localhost/sync/${token}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      ...(body ? { 'Content-Type': 'application/octet-stream', 'Content-Length': String(body.length) } : {}),
    },
    body: body ? Buffer.from(body) : undefined,
  });
}

describe('handleBlob', () => {
  beforeEach(async () => {
    mockGet.mockClear();
    await rm(TEST_BLOB_DIR, { recursive: true, force: true });
    await mkdir(TEST_BLOB_DIR, { recursive: true });
  });

  it('GET returns 404 when no blob exists', async () => {
    const res = await handleBlob(makeReq('GET', SYNC_TOKEN), SYNC_TOKEN);
    expect(res.status).toBe(404);
  });

  it('PUT stores blob; GET retrieves it', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const put = await handleBlob(makeReq('PUT', SYNC_TOKEN, data), SYNC_TOKEN);
    expect(put.status).toBe(204);

    const get = await handleBlob(makeReq('GET', SYNC_TOKEN), SYNC_TOKEN);
    expect(get.status).toBe(200);
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(data);
  });

  it('GET returns 401 when auth header is missing', async () => {
    const req = new Request(`http://localhost/sync/${SYNC_TOKEN}`, { method: 'GET' });
    const res = await handleBlob(req, SYNC_TOKEN);
    expect(res.status).toBe(401);
  });

  it('GET returns 401 when session token is unknown', async () => {
    const res = await handleBlob(makeReq('GET', SYNC_TOKEN, undefined, 'unknown'), SYNC_TOKEN);
    expect(res.status).toBe(401);
  });

  it('PUT returns 403 when session belongs to a different sync token', async () => {
    const other = 'b'.repeat(64);
    const res = await handleBlob(makeReq('PUT', other, new Uint8Array([1])), other);
    expect(res.status).toBe(403);
  });

  it('PUT returns 413 when payload exceeds 1 MB', async () => {
    const big = new Uint8Array(1024 * 1024 + 1);
    const res = await handleBlob(makeReq('PUT', SYNC_TOKEN, big), SYNC_TOKEN);
    expect(res.status).toBe(413);
  });

  it('PUT succeeds even when BLOB_DIR does not exist yet', async () => {
    await rm(TEST_BLOB_DIR, { recursive: true, force: true });
    const data = new Uint8Array([9, 8, 7]);
    const res = await handleBlob(makeReq('PUT', SYNC_TOKEN, data), SYNC_TOKEN);
    expect(res.status).toBe(204);
  });

  it('GET returns 401 when session token is too short (not 64 hex chars)', async () => {
    const callsBefore = mockGet.mock.calls.length;
    const res = await handleBlob(makeReq('GET', SYNC_TOKEN, undefined, 'short'), SYNC_TOKEN);
    expect(res.status).toBe(401);
    expect(mockGet.mock.calls.length).toBe(callsBefore); // Redis must NOT be queried
  });

  it('GET returns 401 when session token is too long (> 64 chars)', async () => {
    const callsBefore = mockGet.mock.calls.length;
    const longToken = 'a'.repeat(65);
    const res = await handleBlob(makeReq('GET', SYNC_TOKEN, undefined, longToken), SYNC_TOKEN);
    expect(res.status).toBe(401);
    expect(mockGet.mock.calls.length).toBe(callsBefore);
  });

  it('GET returns 401 when session token contains non-hex chars', async () => {
    const callsBefore = mockGet.mock.calls.length;
    const nonHexToken = 'z'.repeat(64);
    const res = await handleBlob(makeReq('GET', SYNC_TOKEN, undefined, nonHexToken), SYNC_TOKEN);
    expect(res.status).toBe(401);
    expect(mockGet.mock.calls.length).toBe(callsBefore);
  });

  it('returns 500 with no internal details when redis throws', async () => {
    mockGet.mockImplementationOnce(() => {
      throw new Error('connect ECONNREFUSED redis://secret:password@redis-host:6379');
    });
    const res = await handleBlob(makeReq('GET', SYNC_TOKEN), SYNC_TOKEN);
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('ECONNREFUSED');
    expect(body).not.toContain('redis://');
    expect(body).not.toContain('password');
    expect(body).not.toContain(' at ');       // no stack trace frames
  });

  it('PUT never evicts another user\'s blob even when SYNC_BLOB_MAX_COUNT would be exceeded', async () => {
    process.env.SYNC_BLOB_MAX_COUNT = '2';
    const tokenA = 'a'.repeat(64);
    const tokenB = 'b'.repeat(64);
    const tokenC = 'c'.repeat(64);
    const dataA = new Uint8Array([1, 2, 3]);
    const dataB = new Uint8Array([4, 5, 6]);
    const dataC = new Uint8Array([7, 8, 9]);

    // Pre-seed two blobs on disk: tokenA (older) and tokenB (newer)
    const pathA = join(TEST_BLOB_DIR, `${tokenA}.enc`);
    const pathB = join(TEST_BLOB_DIR, `${tokenB}.enc`);
    const pathC = join(TEST_BLOB_DIR, `${tokenC}.enc`);

    await writeFile(pathA, dataA);
    const now = Date.now();
    await utimes(pathA, now / 1000 - 2, now / 1000 - 2);  // 2 seconds ago (older)

    await writeFile(pathB, dataB);
    await utimes(pathB, now / 1000 - 1, now / 1000 - 1);  // 1 second ago (newer)

    // Mock tokenC session (fresh third identity)
    mockGet.mockImplementationOnce(async (key: string) =>
      key === `session:${SESSION_TOKEN}` ? tokenC : null
    );
    // Try to write tokenC blob; count cap is 2, so this should be rejected with 507
    const res = await handleBlob(makeReq('PUT', tokenC, dataC), tokenC);

    // Assertions:
    // 1. Write is rejected with 507 (Insufficient Storage)
    expect(res.status).toBe(507);
    // 2. Victim A's blob is intact
    expect(existsSync(pathA)).toBe(true);
    // 3. Victim B's blob is intact
    expect(existsSync(pathB)).toBe(true);
    // 4. Attacker's blob was not created
    expect(existsSync(pathC)).toBe(false);
  });

  it('PUT rejects new blob with 507 when SYNC_BLOB_MAX_COUNT is reached', async () => {
    process.env.SYNC_BLOB_MAX_COUNT = '3';
    const tokenA = 'a'.repeat(64);
    const tokenB = 'b'.repeat(64);
    const tokenC = 'c'.repeat(64);
    const tokenD = 'd'.repeat(64);
    const dataA = new Uint8Array([1]);
    const dataB = new Uint8Array([2]);
    const dataC = new Uint8Array([3]);
    const dataD = new Uint8Array([4]);

    // Seed blobs A, B, C
    const pathA = join(TEST_BLOB_DIR, `${tokenA}.enc`);
    const pathB = join(TEST_BLOB_DIR, `${tokenB}.enc`);
    const pathC = join(TEST_BLOB_DIR, `${tokenC}.enc`);
    const pathD = join(TEST_BLOB_DIR, `${tokenD}.enc`);

    await writeFile(pathA, dataA);
    await writeFile(pathB, dataB);
    await writeFile(pathC, dataC);

    // Try to PUT new token D; should be rejected with 507 since count cap is reached
    mockGet.mockImplementationOnce(async (key: string) =>
      key === `session:${SESSION_TOKEN}` ? tokenD : null
    );
    const resD = await handleBlob(makeReq('PUT', tokenD, dataD), tokenD);
    expect(resD.status).toBe(507);

    // Check all original blobs still exist, D was not created
    expect(existsSync(pathA)).toBe(true);
    expect(existsSync(pathB)).toBe(true);
    expect(existsSync(pathC)).toBe(true);
    expect(existsSync(pathD)).toBe(false);
  });

  it('PUT enforces per-user byte cap via MAX_BYTES guard (1 MB)', async () => {
    // The per-user byte cap is enforced by the MAX_BYTES guard in the handler
    // Each user can store up to MAX_BYTES (1 MB) in their single blob
    const tokenA = 'a'.repeat(64);
    const oversizedData = new Uint8Array(1024 * 1024 + 1);  // 1 MB + 1 byte

    mockGet.mockImplementationOnce(async (key: string) =>
      key === `session:${SESSION_TOKEN}` ? tokenA : null
    );
    const res = await handleBlob(makeReq('PUT', tokenA, oversizedData), tokenA);

    // Should be rejected with 413 (Payload Too Large)
    expect(res.status).toBe(413);

    // Verify blob was not created
    const pathA = join(TEST_BLOB_DIR, `${tokenA}.enc`);
    expect(existsSync(pathA)).toBe(false);
  });

  it('PUT allows overwrite of existing blob when within per-user cap', async () => {
    // Test that a user can overwrite their own blob as long as it's within MAX_BYTES
    const tokenX = 'x'.repeat(64);
    const dataX_v1 = new Uint8Array(100);  // 100 bytes initial
    const dataX_v2 = new Uint8Array(500);  // 500 bytes overwrite (still under 1 MB)

    const pathX = join(TEST_BLOB_DIR, `${tokenX}.enc`);

    // Seed blob X (100 bytes)
    mockGet.mockImplementationOnce(async (key: string) =>
      key === `session:${SESSION_TOKEN}` ? tokenX : null
    );
    const res1 = await handleBlob(makeReq('PUT', tokenX, dataX_v1), tokenX);
    expect(res1.status).toBe(204);
    expect(existsSync(pathX)).toBe(true);

    // Overwrite with larger data (500 bytes)
    mockGet.mockImplementationOnce(async (key: string) =>
      key === `session:${SESSION_TOKEN}` ? tokenX : null
    );
    const res2 = await handleBlob(makeReq('PUT', tokenX, dataX_v2), tokenX);
    expect(res2.status).toBe(204);

    // Verify X was updated
    const { readFile } = await import('fs/promises');
    const xContent = await readFile(pathX);
    expect(xContent.length).toBe(500);
  });

  it('DELETE removes the blob and returns 204; subsequent GET returns 404', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const putRes = await handleBlob(makeReq('PUT', SYNC_TOKEN, data), SYNC_TOKEN);
    expect(putRes.status).toBe(204);

    const delRes = await handleBlob(makeReq('DELETE', SYNC_TOKEN), SYNC_TOKEN);
    expect(delRes.status).toBe(204);

    expect(existsSync(join(TEST_BLOB_DIR, `${SYNC_TOKEN}.enc`))).toBe(false);

    const getRes = await handleBlob(makeReq('GET', SYNC_TOKEN), SYNC_TOKEN);
    expect(getRes.status).toBe(404);
  });

  it('DELETE returns 204 when the blob does not exist (idempotent)', async () => {
    const res = await handleBlob(makeReq('DELETE', SYNC_TOKEN), SYNC_TOKEN);
    expect(res.status).toBe(204);
  });

  it('DELETE returns 403 when session belongs to a different sync token', async () => {
    const other = 'b'.repeat(64);
    const res = await handleBlob(makeReq('DELETE', other), other);
    expect(res.status).toBe(403);
  });
});
