import { timingSafeEqual, createHmac, randomBytes } from 'crypto';
import { redis } from '../redis';

const APP_SECRET = process.env.SYNC_APP_SECRET ?? '';

function verifyHmac(nonce: string, hmacHex: string): boolean {
  try {
    const secretBytes = Buffer.from(APP_SECRET, 'base64');
    const expected = createHmac('sha256', secretBytes).update(nonce).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(hmacHex.toLowerCase());
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function handleSession(req: Request): Promise<Response> {
  let body: { nonce?: unknown; hmac?: unknown; syncToken?: unknown };
  try {
    body = await req.json() as typeof body;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { nonce, hmac, syncToken } = body;
  if (typeof nonce !== 'string' || typeof hmac !== 'string' || typeof syncToken !== 'string') {
    return new Response('Bad Request', { status: 400 });
  }
  if (!/^[a-f0-9]{64}$/.test(syncToken)) {
    return new Response('Bad Request', { status: 400 });
  }
  if (!/^[a-f0-9]{64}$/.test(hmac)) {
    return new Response('Bad Request', { status: 400 });
  }

  if (!verifyHmac(nonce, hmac)) return new Response('Unauthorized', { status: 401 });

  const deleted = await redis.del(`nonce:${nonce}`);
  if (deleted === 0) return new Response('Unauthorized', { status: 401 });

  const sessionToken = randomBytes(32).toString('hex');
  await redis.set(`session:${sessionToken}`, syncToken, 'EX', 86400);
  return Response.json({ sessionToken });
}
