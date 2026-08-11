import webpush from 'web-push';
import { couchPut, couchDel } from './couch';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

const BACKOFF_BASE_S = 2;
const BLOCKED_UNTIL_RESET = '0001-01-01T00:00:00Z';
const DB_SUBS = 'push-subscriptions';

export type DeliveryResult = 'ok' | 'gone' | 'error';

export type Subscription = {
  _id: string;
  syncId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  failedAttempts: number;
  blockedUntil: string;
};

export type Payload = { title: string; body: string; choreKey: string };

export function buildBackoff(failedAttempts: number): { failedAttempts: number; blockedUntil: string } {
  if (failedAttempts === 0) {
    return { failedAttempts: 0, blockedUntil: BLOCKED_UNTIL_RESET };
  }
  const blockedUntil = new Date(
    Date.now() + (BACKOFF_BASE_S ** failedAttempts) * 1000,
  ).toISOString();
  return { failedAttempts, blockedUntil };
}

export async function sendToSubscription(
  sub: Pick<Subscription, 'endpoint' | 'keys'>,
  payload: Payload,
): Promise<DeliveryResult> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
    );
    return 'ok';
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410 || status === 404) return 'gone';
    return 'error';
  }
}

export async function deliverToSubscriptions(
  subscriptions: Subscription[],
  payload: Payload,
): Promise<boolean> {
  let anySuccess = false;
  for (const sub of subscriptions) {
    const result = await sendToSubscription(sub, payload);
    if (result === 'gone') {
      await couchDel(DB_SUBS, sub._id);
    } else if (result === 'error') {
      const backoff = buildBackoff(sub.failedAttempts + 1);
      await couchPut(DB_SUBS, sub._id, { ...sub, ...backoff });
    } else {
      anySuccess = true;
      if (sub.failedAttempts > 0) {
        await couchPut(DB_SUBS, sub._id, { ...sub, ...buildBackoff(0) });
      }
    }
  }
  return anySuccess;
}
