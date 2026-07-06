import { mkdir, readFile, writeFile, readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { redis } from '../redis';

const BLOB_DIR = process.env.SYNC_BLOB_DIR ?? '/data';
const MAX_BYTES = 1024 * 1024;
const SESSION_TOKEN_RE = /^[a-f0-9]{64}$/;

function readCaps() {
  const quotaBytes = process.env.SYNC_BLOB_QUOTA_BYTES ? parseInt(process.env.SYNC_BLOB_QUOTA_BYTES, 10) : 10 * 1024 * 1024 * 1024;
  const maxCount = process.env.SYNC_BLOB_MAX_COUNT ? parseInt(process.env.SYNC_BLOB_MAX_COUNT, 10) : 10_000;
  return { quotaBytes, maxCount };
}

async function authenticate(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const sessionToken = auth.slice(7);
  if (!SESSION_TOKEN_RE.test(sessionToken)) return null;
  return redis.get(`session:${sessionToken}`);
}

export async function handleBlob(req: Request, token: string): Promise<Response> {
  try {
    const storedSyncToken = await authenticate(req);
    if (!storedSyncToken) return new Response('Unauthorized', { status: 401 });
    if (storedSyncToken !== token) return new Response('Forbidden', { status: 403 });

    const blobPath = join(BLOB_DIR, `${token}.enc`);

    if (req.method === 'GET') {
      try {
        const data = await readFile(blobPath);
        return new Response(data, { headers: { 'Content-Type': 'application/octet-stream' } });
      } catch {
        return new Response('Not Found', { status: 404 });
      }
    }

    if (req.method === 'PUT') {
      const contentLength = Number(req.headers.get('Content-Length') ?? 0);
      if (contentLength > MAX_BYTES) return new Response('Payload Too Large', { status: 413 });
      const data = await req.arrayBuffer();
      if (data.byteLength > MAX_BYTES) return new Response('Payload Too Large', { status: 413 });
      await mkdir(BLOB_DIR, { recursive: true });

      // Read capacity limits (per-request to allow test mutations of process.env)
      const { maxCount } = readCaps();

      // Check if this is a new blob (not an overwrite of existing blob)
      let blobExists = false;
      try {
        const entries = await readdir(BLOB_DIR);
        blobExists = entries.includes(`${token}.enc`);
      } catch {
        // Directory may not exist yet
      }

      // For new blobs, enforce the global count cap as a safety valve for new identity admission
      if (!blobExists) {
        let blobCount = 0;
        try {
          const entries = await readdir(BLOB_DIR);
          for (const name of entries) {
            const path = join(BLOB_DIR, name);
            const stats = await stat(path);
            if (stats.isFile()) {
              blobCount += 1;
            }
          }
        } catch {
          // Directory may not exist yet
        }

        // If adding a new blob would exceed the count cap, reject with 507
        if (blobCount >= maxCount) {
          return new Response('Insufficient Storage', { status: 507 });
        }
      }

      // Per-user byte cap: enforce via existing MAX_BYTES guard (lines 42-44)
      // This already enforces the per-user limit since each user has exactly one blob
      // and MAX_BYTES = 1 MiB is the per-request payload limit

      await writeFile(blobPath, Buffer.from(data));
      return new Response(null, { status: 204 });
    }

    if (req.method === 'DELETE') {
      await unlink(blobPath).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      });
      return new Response(null, { status: 204 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch {
    return new Response('Internal Server Error', { status: 500 });
  }
}
