import { useAppStore } from '@/store';
import { resolveNotificationsEnabled } from '@/lib/notifications';
import { fetchSchedules, upsertSchedule, deleteSchedule } from '@/sync/pushApi';

export function useScheduleSync() {
  const chores = useAppStore((s) => s.chores);
  const packs = useAppStore((s) => s.packs);
  const profile = useAppStore((s) => s.profile);

  async function reconcile() {
    if (!profile) return;

    const serverSchedules = await fetchSchedules();
    const serverKeys = new Set(serverSchedules.map((s) => s.choreKey));

    const localEnabled = chores.filter((chore) => {
      const pack = packs.find((p) => p.id === chore.packId);
      if (!pack) return false;
      return resolveNotificationsEnabled(chore, pack, profile);
    });

    const localKeys = new Set(localEnabled.map((c) => c.key));

    // Upsert missing schedules
    for (const chore of localEnabled) {
      if (!serverKeys.has(chore.key)) {
        await upsertSchedule(chore.packId, chore.choreId, {
          title: chore.title,
          recurrence: chore.recurrence,
          ...(chore.duePeriod ? { duePeriod: chore.duePeriod } : {}),
          trigger: 'at-due-time',
        });
      }
    }

    // Delete orphaned server schedules
    for (const { choreKey } of serverSchedules) {
      if (!localKeys.has(choreKey)) {
        const slashIdx = choreKey.indexOf('/');
        const packId = choreKey.slice(0, slashIdx);
        const choreId = choreKey.slice(slashIdx + 1);
        await deleteSchedule(packId, choreId);
      }
    }
  }

  return { reconcile };
}
