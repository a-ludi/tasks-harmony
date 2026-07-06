import { randomBytes } from 'crypto';
import { redis } from '../redis';

const HEX64 = /^[a-f0-9]{64}$/;

export async function handleChallenge(req: Request): Promise<Response> {
  let body: { syncToken?: unknown; syncId?: unknown };
  try {
    body = await req.json() as typeof body;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Determine identity and flavour: PQ path uses syncId, legacy path uses syncToken
  let flavour: 'pq' | 'legacy';
  let identity: string;
  if (typeof body.syncId === 'string') {
    if (!HEX64.test(body.syncId)) return new Response('Bad Request', { status: 400 });
    flavour = 'pq';
    identity = body.syncId;
  } else if (typeof body.syncToken === 'string') {
    if (!HEX64.test(body.syncToken)) return new Response('Bad Request', { status: 400 });
    flavour = 'legacy';
    identity = body.syncToken;
  } else {
    return new Response('Bad Request', { status: 400 });
  }

  const nonce = randomBytes(32).toString('hex');
  await redis.set(`nonce:${nonce}`, `${flavour}:${identity}`, 'EX', 60, 'NX');
  return Response.json({ nonce });
}
