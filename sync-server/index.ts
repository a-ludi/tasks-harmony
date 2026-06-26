import { chmod, unlink } from 'fs/promises';
import { handleChallenge } from './handlers/challenge';
import { handleSession } from './handlers/session';
import { handleBlob } from './handlers/blob';

const appSecret = process.env.SYNC_APP_SECRET ?? '';
if (!appSecret || Buffer.from(appSecret, 'base64').length < 32) {
  console.error('SYNC_APP_SECRET must be set to a base64-encoded value of at least 32 bytes.');
  process.exit(1);
}

const SYNC_SOCKET = process.env.SYNC_SOCKET ?? '';
const SYNC_PORT = Number(process.env.SYNC_PORT ?? 3001);
const MAX_BODY_SIZE = 1024 * 1024 + 1024; // 1MB + small header overhead
const TOKEN_RE = /^\/sync\/([a-f0-9]{64})$/;

async function handler(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname === '/sync/challenge' && req.method === 'GET') return handleChallenge(req);
  if (pathname === '/sync/session' && req.method === 'POST') return handleSession(req);
  const m = TOKEN_RE.exec(pathname);
  if (m && (req.method === 'GET' || req.method === 'PUT')) return handleBlob(req, m[1]!);
  return new Response('Not Found', { status: 404 });
}

if (SYNC_SOCKET) {
  await unlink(SYNC_SOCKET).catch(() => {});
  Bun.serve({ unix: SYNC_SOCKET, fetch: handler, maxRequestBodySize: MAX_BODY_SIZE });
  await chmod(SYNC_SOCKET, 0o666);
  console.log(`Listening on unix:${SYNC_SOCKET}`);
} else {
  Bun.serve({ port: SYNC_PORT, fetch: handler, maxRequestBodySize: MAX_BODY_SIZE });
  console.log(`Listening on http://localhost:${SYNC_PORT}`);
}
