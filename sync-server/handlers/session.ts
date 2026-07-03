import { randomBytes } from 'crypto';
import { redis } from '../redis';

export async function handleSession(req: Request): Promise<Response> {
  let body: { nonce?: unknown; syncToken?: unknown };
  try {
    body = await req.json() as typeof body;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { nonce, syncToken } = body;
  if (typeof nonce !== 'string' || typeof syncToken !== 'string') {
    return new Response('Bad Request', { status: 400 });
  }
  if (!/^[a-f0-9]{64}$/.test(nonce)) {
    return new Response('Bad Request', { status: 400 });
  }
  if (!/^[a-f0-9]{64}$/.test(syncToken)) {
    return new Response('Bad Request', { status: 400 });
  }

  const storedSyncToken = await redis.getDel(`nonce:${nonce}`);
  if (storedSyncToken === null) return new Response('Unauthorized', { status: 401 });
  if (storedSyncToken !== syncToken) return new Response('Unauthorized', { status: 401 });

  const sessionToken = randomBytes(32).toString('hex');
  await redis.set(`session:${sessionToken}`, syncToken, 'EX', 86400);
  return Response.json({ sessionToken });
}
