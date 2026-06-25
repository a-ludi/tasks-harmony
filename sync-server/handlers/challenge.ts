import { randomBytes } from 'crypto';
import { redis } from '../redis';

export async function handleChallenge(_req: Request): Promise<Response> {
  const nonce = randomBytes(32).toString('hex');
  await redis.set(`nonce:${nonce}`, '1', 'EX', 60, 'NX');
  return Response.json({ nonce });
}
