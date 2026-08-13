import { couchFind, couchPut, couchDel, couchChanges, ensureDb, ensureIndex } from './couch';
import { computeNextNotificationAt, type Recurrence, type DuePeriod } from './scheduler';
import { deliverToSubscriptions, type Subscription, type Payload } from './deliver';

const DB_SCHEDULES = 'push-schedules';
const DB_SUBS = 'push-subscriptions';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60_000);

type ScheduleDoc = {
  _id: string;
  syncId: string;
  choreKey: string;
  title: string;
  recurrence: Recurrence;
  duePeriod?: DuePeriod;
  trigger: 'at-due-time' | 'test';
  lastDeliveredAt: string | null;
  nextNotificationAt: string;
};

let pollRunning = false;

async function poll() {
  if (pollRunning) return;
  pollRunning = true;
  try {
    const now = new Date().toISOString();
    let due: ScheduleDoc[];
    try {
      due = await couchFind<ScheduleDoc>(DB_SCHEDULES, {
        nextNotificationAt: { $lte: now },
        trigger: { $ne: 'test' },
      });
    } catch (err) {
      console.error('[poll] CouchDB unavailable:', err);
      return;
    }

    for (const schedule of due) {
      try {
        const subs = await couchFind<Subscription>(DB_SUBS, {
          syncId: schedule.syncId,
          blockedUntil: { $lte: now },
        });

        if (subs.length === 0) continue;

        const payload: Payload = {
          title: schedule.title,
          body: `${schedule.title} is due`,
          choreKey: schedule.choreKey,
        };

        const anySuccess = await deliverToSubscriptions(subs, payload);

        if (anySuccess) {
          const lastDeliveredAt = now;
          const nextNotificationAt = computeNextNotificationAt(
            schedule.recurrence,
            schedule.duePeriod,
            'at-due-time',
            lastDeliveredAt,
          );
          await couchPut(DB_SCHEDULES, schedule._id, { ...schedule, lastDeliveredAt, nextNotificationAt });
        }
      } catch (err) {
        console.error(`[poll] error processing schedule ${schedule._id}:`, err);
      }
    }
  } finally {
    pollRunning = false;
  }
}

async function handleTestDoc(docId: string) {
  if (!docId.includes('/~test')) return;
  const syncId = docId.slice(0, docId.indexOf('/~test'));
  const now = new Date().toISOString();
  try {
    const subs = await couchFind<Subscription>(DB_SUBS, {
      syncId,
      blockedUntil: { $lte: now },
    });
    const payload: Payload = {
      title: 'Tasks Harmony',
      body: 'Notifications are working correctly!',
      choreKey: '',
    };
    await deliverToSubscriptions(subs, payload);
    await couchDel(DB_SCHEDULES, docId);
  } catch (err) {
    console.error('[handleTestDoc] error:', err);
  }
}

async function watchChanges(signal: AbortSignal) {
  let since = 'now';
  while (!signal.aborted) {
    try {
      const result = await couchChanges(DB_SCHEDULES, since, signal);
      since = result.last_seq;
      for (const change of result.results) {
        if (change.id.includes('/~test')) {
          await handleTestDoc(change.id);
        } else {
          await poll();
        }
      }
    } catch {
      if (!signal.aborted) await Bun.sleep(5_000);
    }
  }
}

// Startup
try {
  await ensureDb(DB_SUBS);
  await ensureDb(DB_SCHEDULES);
  await ensureIndex(DB_SUBS, ['syncId', 'blockedUntil']);
  await ensureIndex(DB_SCHEDULES, ['nextNotificationAt']);
  await ensureIndex(DB_SCHEDULES, ['syncId']);
} catch (err) {
  console.error('[startup] Failed to initialize CouchDB:', err);
  process.exit(1);
}

console.log('[vapid-observer] started');

const ac = new AbortController();
process.on('SIGTERM', () => ac.abort());

// Start _changes watcher and poll loop concurrently
void watchChanges(ac.signal);

while (!ac.signal.aborted) {
  await poll();
  await Bun.sleep(POLL_INTERVAL_MS);
}
