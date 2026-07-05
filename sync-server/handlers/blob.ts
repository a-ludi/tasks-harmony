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
      const { quotaBytes, maxCount } = readCaps();

      // Enumerate current blobs and compute post-write projections
      let blobs: Array<{ name: string; size: number; mtimeMs: number }> = [];
      try {
        const entries = await readdir(BLOB_DIR);
        for (const name of entries) {
          const path = join(BLOB_DIR, name);
          const stats = await stat(path);
          if (stats.isFile()) {
            blobs.push({ name, size: stats.size, mtimeMs: stats.mtimeMs });
          }
        }
      } catch {
        // Directory may not exist yet; blobs will be empty
      }

      // Project post-write totals: existing blob overwrite vs. new blob
      const isOverwrite = blobs.some(b => b.name === `${token}.enc`);
      let projectedCount = blobs.length;
      let projectedBytes = blobs.reduce((sum, b) => sum + b.size, 0);

      if (isOverwrite) {
        // Overwrite: replace existing blob's size
        const existing = blobs.find(b => b.name === `${token}.enc`)!;
        projectedBytes = projectedBytes - existing.size + data.byteLength;
      } else {
        // New blob: add count and bytes
        projectedCount += 1;
        projectedBytes += data.byteLength;
      }

      // Evict oldest blobs (by mtime) if projections exceed caps, skipping caller's own token
      if (projectedCount > maxCount || projectedBytes > quotaBytes) {
        // Sort by mtime ascending (oldest first)
        const sortedByMtime = [...blobs].sort((a, b) => a.mtimeMs - b.mtimeMs);

        for (const blob of sortedByMtime) {
          // Never evict the caller's own blob
          if (blob.name === `${token}.enc`) continue;

          // Unlink the blob file
          await unlink(join(BLOB_DIR, blob.name));

          // Update projections (the overwrite adjustment was already applied before the loop)
          projectedBytes -= blob.size;
          projectedCount -= 1;

          // Stop evicting if we're now under both caps
          if (projectedCount <= maxCount && projectedBytes <= quotaBytes) {
            break;
          }
        }
      }

      // Final check: if we still exceed caps (only caller's own blob remains), reject
      if (projectedCount > maxCount || projectedBytes > quotaBytes) {
        return new Response('Insufficient Storage', { status: 507 });
      }

      await writeFile(blobPath, Buffer.from(data));
      return new Response(null, { status: 204 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch {
    return new Response('Internal Server Error', { status: 500 });
  }
}
