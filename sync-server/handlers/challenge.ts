import { randomBytes } from 'crypto';
import { redis } from '../redis';

export async function handleChallenge(req: Request): Promise<Response> {
  let body: { syncToken?: unknown };
  try {
    body = await req.json() as typeof body;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { syncToken } = body;
  if (typeof syncToken !== 'string') {
    return new Response('Bad Request', { status: 400 });
  }
  if (!/^[a-f0-9]{64}$/.test(syncToken)) {
    return new Response('Bad Request', { status: 400 });
  }

  const nonce = randomBytes(32).toString('hex');
  await redis.set(`nonce:${nonce}`, syncToken, 'EX', 60, 'NX');
  return Response.json({ nonce });
}
