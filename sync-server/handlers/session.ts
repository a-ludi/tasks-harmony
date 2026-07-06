import { randomBytes, createHash } from 'node:crypto';
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { redis } from '../redis';

// Parse the flavour-tagged nonce value and return { flavour, identity } or null
async function getAndDeleteNonce(nonce: string): Promise<{ flavour: 'pq' | 'legacy', identity: string } | null> {
  const value = await redis.getDel(`nonce:${nonce}`);
  if (value === null) return null;

  const colonIdx = value.indexOf(':');
  if (colonIdx === -1) return null; // No flavour tag present (old format)

  const flavour = value.substring(0, colonIdx);
  const identity = value.substring(colonIdx + 1);

  if (flavour === 'pq' || flavour === 'legacy') {
    return { flavour, identity };
  }

  return null; // Invalid flavour tag
}

export async function handleSession(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { nonce } = body;
  if (typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce)) {
    return new Response('Bad Request', { status: 400 });
  }

  // PQ path: detected by presence of mldsaPublicKey
  if ('mldsaPublicKey' in body) {
    return handleSessionPQ(nonce, body);
  }

  // Legacy path
  return handleSessionLegacy(nonce, body);
}

async function handleSessionPQ(
  nonce: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const { mldsaPublicKey, mlkemPublicKey, signature } = body;

  if (
    typeof mldsaPublicKey !== 'string' ||
    typeof mlkemPublicKey !== 'string' ||
    typeof signature !== 'string'
  ) {
    return new Response('Bad Request', { status: 400 });
  }

  const mldsaPkBytes = Buffer.from(mldsaPublicKey, 'base64url');
  const mlkemPkBytes = Buffer.from(mlkemPublicKey, 'base64url');
  const sigBytes = Buffer.from(signature, 'base64url');

  if (mldsaPkBytes.length !== 2592 || mlkemPkBytes.length !== 1568 || sigBytes.length !== 4627) {
    return new Response('Bad Request', { status: 400 });
  }

  const nonceData = await getAndDeleteNonce(nonce);
  if (nonceData === null) return new Response('Unauthorized', { status: 401 });
  if (nonceData.flavour !== 'pq') return new Response('Unauthorized', { status: 401 });

  const storedSyncId = nonceData.identity;
  const combined = Buffer.concat([mlkemPkBytes, mldsaPkBytes]);
  const derivedSyncId = createHash('sha256').update(combined).digest('hex');
  if (derivedSyncId !== storedSyncId) return new Response('Unauthorized', { status: 401 });

  const signPayload = Buffer.from(nonce + storedSyncId);
  let valid: boolean;
  try {
    valid = ml_dsa87.verify(sigBytes, signPayload, mldsaPkBytes);
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!valid) return new Response('Unauthorized', { status: 401 });

  const sessionToken = randomBytes(32).toString('hex');
  await redis.set(`session:${sessionToken}`, storedSyncId, 'EX', 86400);
  return Response.json({ sessionToken });
}

async function handleSessionLegacy(
  nonce: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const { syncToken } = body;

  if (typeof syncToken !== 'string') {
    return new Response('Bad Request', { status: 400 });
  }
  if (!/^[a-f0-9]{64}$/.test(syncToken)) {
    return new Response('Bad Request', { status: 400 });
  }

  const nonceData = await getAndDeleteNonce(nonce);
  if (nonceData === null) return new Response('Unauthorized', { status: 401 });
  if (nonceData.flavour !== 'legacy') return new Response('Unauthorized', { status: 401 });

  const storedSyncToken = nonceData.identity;
  if (storedSyncToken !== syncToken) return new Response('Unauthorized', { status: 401 });

  const sessionToken = randomBytes(32).toString('hex');
  await redis.set(`session:${sessionToken}`, syncToken, 'EX', 86400);
  return Response.json({ sessionToken });
}
