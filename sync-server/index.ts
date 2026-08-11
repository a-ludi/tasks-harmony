import { chmod, unlink } from 'fs/promises';
import { handleChallenge } from './handlers/challenge';
import { handleSession } from './handlers/session';
import { handleBlob } from './handlers/blob';
import { handlePush } from './handlers/push';
import { ensureDb, ensureIndex } from './couch';

const SYNC_SOCKET = process.env.SYNC_SOCKET ?? '';
const SYNC_PORT = Number(process.env.SYNC_PORT ?? 3001);
const MAX_BODY_SIZE = 1024 * 1024 + 1024; // 1MB + small header overhead
const TOKEN_RE = /^\/sync\/([a-f0-9]{64})$/;

function errorHandler(err: Error): Response {
  console.error(err);
  return new Response('Internal Server Error', { status: 500 });
}

async function handler(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname === '/sync/challenge' && req.method === 'POST') return handleChallenge(req);
  if (pathname === '/sync/session' && req.method === 'POST') return handleSession(req);
  const m = TOKEN_RE.exec(pathname);
  if (m && (req.method === 'GET' || req.method === 'PUT' || req.method === 'DELETE')) return handleBlob(req, m[1]!);
  if (pathname === '/push/vapid-public-key' && req.method === 'GET') return handlePush(req, null);
  if (pathname === '/push/subscriptions' && (req.method === 'PUT' || req.method === 'DELETE')) return handlePush(req, null);
  if (pathname === '/push/schedules' && req.method === 'GET') return handlePush(req, null);
  if (pathname === '/push/test' && req.method === 'POST') return handlePush(req, null);
  if (/^\/push\/schedules\/[^/]+\/.+$/.test(pathname) && (req.method === 'PUT' || req.method === 'DELETE')) return handlePush(req, null);
  return new Response('Not Found', { status: 404 });
}

if (SYNC_SOCKET) {
  await unlink(SYNC_SOCKET).catch(() => {});
  Bun.serve({ unix: SYNC_SOCKET, fetch: handler, error: errorHandler, maxRequestBodySize: MAX_BODY_SIZE });
  await chmod(SYNC_SOCKET, 0o666);
  console.log(`Listening on unix:${SYNC_SOCKET}`);
} else {
  Bun.serve({ port: SYNC_PORT, fetch: handler, error: errorHandler, maxRequestBodySize: MAX_BODY_SIZE });
  console.log(`Listening on http://localhost:${SYNC_PORT}`);
}

// CouchDB startup initialization
await ensureDb('push-subscriptions');
await ensureDb('push-schedules');
await ensureIndex('push-subscriptions', ['syncId', 'blockedUntil']);
await ensureIndex('push-schedules', ['nextNotificationAt']);
await ensureIndex('push-schedules', ['syncId']);
