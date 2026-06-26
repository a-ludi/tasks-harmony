import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { rm, mkdir } from 'fs/promises';

const TEST_BLOB_DIR = '/tmp/test-sync-blobs-' + Date.now();
process.env.SYNC_BLOB_DIR = TEST_BLOB_DIR;

const SYNC_TOKEN = 'a'.repeat(64);
const SESSION_TOKEN = 'sess01';

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
});
