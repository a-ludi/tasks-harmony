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

  it('PUT evicts the oldest blob when SYNC_BLOB_MAX_COUNT is reached', async () => {
    process.env.SYNC_BLOB_MAX_COUNT = '3';
    const tokenA = 'a'.repeat(64);
    const tokenB = 'b'.repeat(64);
    const tokenC = 'c'.repeat(64);
    const tokenD = 'd'.repeat(64);
    const dataA = new Uint8Array([1]);
    const dataB = new Uint8Array([2]);
    const dataC = new Uint8Array([3]);
    const dataD = new Uint8Array([4]);

    // Seed blobs A, B, C with staggered mtimes (A oldest)
    const pathA = join(TEST_BLOB_DIR, `${tokenA}.enc`);
    const pathB = join(TEST_BLOB_DIR, `${tokenB}.enc`);
    const pathC = join(TEST_BLOB_DIR, `${tokenC}.enc`);
    const pathD = join(TEST_BLOB_DIR, `${tokenD}.enc`);

    await writeFile(pathA, dataA);
    const now = Date.now();
    await utimes(pathA, now / 1000 - 3, now / 1000 - 3);  // 3 seconds ago

    await writeFile(pathB, dataB);
    await utimes(pathB, now / 1000 - 2, now / 1000 - 2);  // 2 seconds ago

    await writeFile(pathC, dataC);
    await utimes(pathC, now / 1000 - 1, now / 1000 - 1);  // 1 second ago

    // Mock tokenA session (needed for auth)
    mockGet.mockImplementationOnce(async (key: string) =>
      key === `session:${SESSION_TOKEN}` ? tokenA : null
    );
    const resA = await handleBlob(makeReq('GET', tokenA), tokenA);
    expect(resA.status).toBe(200);

    // Put new token D; should evict A (oldest)
    mockGet.mockImplementationOnce(async (key: string) =>
      key === `session:${SESSION_TOKEN}` ? tokenD : null
    );
    const resD = await handleBlob(makeReq('PUT', tokenD, dataD), tokenD);
    expect(resD.status).toBe(204);

    // Check A is gone, B, C, D exist
    expect(existsSync(pathA)).toBe(false);
    expect(existsSync(pathB)).toBe(true);
    expect(existsSync(pathC)).toBe(true);
    expect(existsSync(pathD)).toBe(true);
  });

  it('PUT evicts the oldest blob when SYNC_BLOB_QUOTA_BYTES would be exceeded', async () => {
    process.env.SYNC_BLOB_QUOTA_BYTES = String(1024);  // 1 KB total
    const tokenA = 'a'.repeat(64);
    const tokenB = 'b'.repeat(64);
    const tokenC = 'c'.repeat(64);
    const dataA = new Uint8Array(512);  // 512 bytes
    const dataB = new Uint8Array(512);  // 512 bytes
    const dataC = new Uint8Array(512);  // 512 bytes

    const pathA = join(TEST_BLOB_DIR, `${tokenA}.enc`);
    const pathB = join(TEST_BLOB_DIR, `${tokenB}.enc`);
    const pathC = join(TEST_BLOB_DIR, `${tokenC}.enc`);

    // Seed A (older) and B
    await writeFile(pathA, dataA);
    const now = Date.now();
    await utimes(pathA, now / 1000 - 2, now / 1000 - 2);

    await writeFile(pathB, dataB);
    await utimes(pathB, now / 1000 - 1, now / 1000 - 1);

    // Put C (512 bytes); would exceed 1 KB quota, should evict A
    mockGet.mockImplementationOnce(async (key: string) =>
      key === `session:${SESSION_TOKEN}` ? tokenC : null
    );
    const resC = await handleBlob(makeReq('PUT', tokenC, dataC), tokenC);
    expect(resC.status).toBe(204);

    // Check A is gone, B and C exist
    expect(existsSync(pathA)).toBe(false);
    expect(existsSync(pathB)).toBe(true);
    expect(existsSync(pathC)).toBe(true);
  });

  it('PUT returns 507 when only the caller\'s own blob remains and the write still exceeds the cap', async () => {
    process.env.SYNC_BLOB_QUOTA_BYTES = String(100);  // 100 bytes total (way below 1 MB)
    const tokenX = 'x'.repeat(64);
    const data = new Uint8Array(200);  // 200 bytes, exceeds 100-byte quota

    // Try to write 200-byte blob to a 100-byte quota; nothing can be evicted
    mockGet.mockImplementationOnce(async (key: string) =>
      key === `session:${SESSION_TOKEN}` ? tokenX : null
    );
    const res = await handleBlob(makeReq('PUT', tokenX, data), tokenX);
    expect(res.status).toBe(507);
  });

  it('PUT isOverwrite + quota-exceeded + eviction needed: evicts oldest, updates caller blob, returns 204', async () => {
    process.env.SYNC_BLOB_QUOTA_BYTES = String(800);  // 800 bytes total
    const tokenA = 'a'.repeat(64);
    const tokenX = 'x'.repeat(64);
    const dataA = new Uint8Array(300);  // 300 bytes, older
    const dataX_v1 = new Uint8Array(300);  // 300 bytes, initial version
    const dataX_v2 = new Uint8Array(600);  // 600 bytes, larger update (overwrite)

    const pathA = join(TEST_BLOB_DIR, `${tokenA}.enc`);
    const pathX = join(TEST_BLOB_DIR, `${tokenX}.enc`);

    // Seed blob A (older, 300 bytes)
    await writeFile(pathA, dataA);
    const now = Date.now();
    await utimes(pathA, now / 1000 - 2, now / 1000 - 2);

    // Seed blob X (300 bytes)
    await writeFile(pathX, dataX_v1);
    await utimes(pathX, now / 1000 - 1, now / 1000 - 1);

    // Total: 600 bytes. Now PUT a larger body to X (600 bytes).
    // Before eviction: blobs = [A(300), X(300)], total 600 bytes
    // isOverwrite = true
    // projectedBytes before adjust = 600
    // projectedBytes after adjust (line 73) = 600 - 300 + 600 = 900 bytes
    // 900 > 800 quota, so eviction is triggered
    // Oldest non-caller is A (300 bytes), evict it
    // After eviction: projectedBytes = 900 - 300 = 600, which fits 800 quota
    // Expected: 204, A gone, X updated to 600 bytes
    mockGet.mockImplementationOnce(async (key: string) =>
      key === `session:${SESSION_TOKEN}` ? tokenX : null
    );
    const res = await handleBlob(makeReq('PUT', tokenX, dataX_v2), tokenX);
    expect(res.status).toBe(204);

    // Check A is evicted, X is updated
    expect(existsSync(pathA)).toBe(false);
    expect(existsSync(pathX)).toBe(true);

    // Verify X has the new content
    const { readFile } = await import('fs/promises');
    const xContent = await readFile(pathX);
    expect(xContent.length).toBe(600);
  });
});
