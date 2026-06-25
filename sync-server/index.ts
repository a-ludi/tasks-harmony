import { chmod } from 'fs/promises';
import { handleChallenge } from './handlers/challenge';
import { handleSession } from './handlers/session';
import { handleBlob } from './handlers/blob';

const SYNC_SOCKET = process.env.SYNC_SOCKET ?? '';
const SYNC_PORT = Number(process.env.SYNC_PORT ?? 3001);
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
  Bun.serve({ unix: SYNC_SOCKET, fetch: handler });
  await chmod(SYNC_SOCKET, 0o666);
  console.log(`Listening on unix:${SYNC_SOCKET}`);
} else {
  Bun.serve({ port: SYNC_PORT, fetch: handler });
  console.log(`Listening on http://localhost:${SYNC_PORT}`);
}
