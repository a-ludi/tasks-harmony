import { createHash } from 'node:crypto';
import { redis } from '../redis';
import { couchPut, couchDel, couchFind, couchGet } from '../couch';
import {
  PushSubscriptionBody,
  DeleteSubscriptionBody,
  PushScheduleBody,
} from '../schemas/push';

const TOKEN_RE = /^[a-f0-9]{64}$/;
const BLOCKED_UNTIL_RESET = '0001-01-01T00:00:00Z';
const SCHEDULE_CAP = 500;

const DB_SUBS = 'push-subscriptions';
const DB_SCHEDULES = 'push-schedules';

async function authenticate(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  if (!TOKEN_RE.test(token)) return null;
  return redis.get(`session:${token}`);
}

function subId(endpoint: string): string {
  return `sub-${createHash('sha256').update(endpoint).digest('hex')}`;
}

export async function handlePush(req: Request, _token: string | null): Promise<Response> {
  const { pathname } = new URL(req.url);

  // Unauthenticated
  if (pathname === '/push/vapid-public-key' && req.method === 'GET') {
    return Response.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? '' });
  }

  // All other routes require auth
  const syncId = await authenticate(req);
  if (!syncId) return new Response('Unauthorized', { status: 401 });

  // Subscriptions
  if (pathname === '/push/subscriptions') {
    if (req.method === 'PUT') {
      let body: unknown;
      try { body = await req.json(); } catch { return new Response('Bad Request', { status: 400 }); }
      const parsed = PushSubscriptionBody.safeParse(body);
      if (!parsed.success) return new Response('Bad Request', { status: 400 });
      const { endpoint, keys } = parsed.data;
      await couchPut(DB_SUBS, subId(endpoint), {
        syncId, endpoint, keys,
        createdAt: new Date().toISOString(),
        failedAttempts: 0,
        blockedUntil: BLOCKED_UNTIL_RESET,
      });
      return new Response(null, { status: 204 });
    }
    if (req.method === 'DELETE') {
      let body: unknown;
      try { body = await req.json(); } catch { return new Response('Bad Request', { status: 400 }); }
      const parsed = DeleteSubscriptionBody.safeParse(body);
      if (!parsed.success) return new Response('Bad Request', { status: 400 });
      await couchDel(DB_SUBS, subId(parsed.data.endpoint));
      return new Response(null, { status: 204 });
    }
  }

  // Schedules list
  if (pathname === '/push/schedules' && req.method === 'GET') {
    const docs = await couchFind<{ _id: string; nextNotificationAt: string }>(
      DB_SCHEDULES,
      { syncId },
    );
    const result = docs
      .filter((d) => !d._id.endsWith('/~test'))
      .map((d) => ({
        choreKey: d._id.slice(syncId.length + 1),
        nextNotificationAt: d.nextNotificationAt,
      }));
    return Response.json(result);
  }

  // Test notification
  if (pathname === '/push/test' && req.method === 'POST') {
    await couchPut(DB_SCHEDULES, `${syncId}/~test`, {
      syncId,
      trigger: 'test',
      nextNotificationAt: new Date().toISOString(),
    });
    return new Response(null, { status: 204 });
  }

  // Schedule PUT/DELETE: /push/schedules/<packId>/<choreId>
  const scheduleMatch = pathname.match(/^\/push\/schedules\/([^/]+\/.+)$/);
  if (scheduleMatch) {
    const choreKey = scheduleMatch[1]!;
    const docId = `${syncId}/${choreKey}`;

    if (req.method === 'DELETE') {
      await couchDel(DB_SCHEDULES, docId);
      return new Response(null, { status: 204 });
    }

    if (req.method === 'PUT') {
      let body: unknown;
      try { body = await req.json(); } catch { return new Response('Bad Request', { status: 400 }); }
      const parsed = PushScheduleBody.safeParse(body);
      if (!parsed.success) return new Response('Bad Request', { status: 400 });

      // Cap check
      const existing = await couchFind<{ _id: string }>(DB_SCHEDULES, { syncId });
      const isNew = !existing.some((d) => d._id === docId);
      if (isNew && existing.filter((d) => !d._id.endsWith('/~test')).length >= SCHEDULE_CAP) {
        return new Response('Insufficient Storage', { status: 507 });
      }

      const existingDoc = await couchGet<{ lastDeliveredAt?: string }>(DB_SCHEDULES, docId);
      const lastDeliveredAt = existingDoc?.lastDeliveredAt ?? null;
      const nextNotificationAt = computeNextNotificationAt(
        parsed.data.recurrence,
        parsed.data.duePeriod,
        parsed.data.trigger,
        lastDeliveredAt,
      );

      await couchPut(DB_SCHEDULES, docId, {
        syncId,
        choreKey,
        title: parsed.data.title,
        recurrence: parsed.data.recurrence,
        ...(parsed.data.duePeriod ? { duePeriod: parsed.data.duePeriod } : {}),
        trigger: parsed.data.trigger,
        lastDeliveredAt,
        nextNotificationAt,
        updatedAt: new Date().toISOString(),
      });
      return new Response(null, { status: 204 });
    }
  }

  return new Response('Not Found', { status: 404 });
}

// Shared computation (also in vapid-observer/scheduler.ts — kept in sync)
function computeNextNotificationAt(
  recurrence: { frequency: 'daily' | 'weekly' | 'monthly'; interval: number; startDate: string; windowStartTime: string },
  duePeriod: { value: number; unit: string } | undefined,
  _trigger: 'at-due-time',
  lastDeliveredAt: string | null,
): string {
  const reference = lastDeliveredAt ? new Date(lastDeliveredAt) : new Date(0);
  const now = new Date();
  const refTime = reference > now ? reference : now;

  let windowStart = new Date(`${recurrence.startDate}T${recurrence.windowStartTime}:00Z`);
  while (windowStart <= refTime) {
    windowStart = advancePeriod(windowStart, recurrence.frequency, recurrence.interval);
  }

  if (duePeriod) {
    const windowEnd = advancePeriod(windowStart, recurrence.frequency, recurrence.interval);
    const offsetMs = duePeriodToMs(duePeriod.value, duePeriod.unit);
    return new Date(windowEnd.getTime() - offsetMs).toISOString();
  }
  return windowStart.toISOString();
}

function advancePeriod(date: Date, frequency: string, interval: number): Date {
  if (frequency === 'daily') return new Date(date.getTime() + interval * 86_400_000);
  if (frequency === 'weekly') return new Date(date.getTime() + interval * 7 * 86_400_000);
  const d = new Date(date);
  d.setMonth(d.getMonth() + interval);
  return d;
}

function duePeriodToMs(value: number, unit: string): number {
  const ms: Record<string, number> = {
    minutes: 60_000, hours: 3_600_000, days: 86_400_000,
    weeks: 604_800_000, months: 2_592_000_000,
  };
  return value * (ms[unit] ?? 0);
}
