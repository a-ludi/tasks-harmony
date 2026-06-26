import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { redis } from '../redis';

const BLOB_DIR = process.env.SYNC_BLOB_DIR ?? '/data';
const MAX_BYTES = 1024 * 1024;

async function authenticate(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const sessionToken = auth.slice(7);
  return redis.get(`session:${sessionToken}`);
}

export async function handleBlob(req: Request, token: string): Promise<Response> {
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
    await writeFile(blobPath, Buffer.from(data));
    return new Response(null, { status: 204 });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
