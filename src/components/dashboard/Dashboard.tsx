import { useState } from 'react';
import { useAppStore } from '@/store';
import { getChoreStatus, getCurrentWindowIndex, getWindowEnd } from '@/chores/recurrence';
import type { ChoreStatus, Chore } from '@/types';
import ChoreCard from './ChoreCard';
import ChoreFormModal from '@/components/chores/ChoreFormModal';

const SECTION_LABELS: Record<ChoreStatus, string> = {
  overdue: 'Overdue',
  due: 'Due',
  completed: 'Completed',
  upcoming: 'Upcoming',
};

const SECTION_ORDER: ChoreStatus[] = ['overdue', 'due', 'completed', 'upcoming'];

interface DashboardProps {
  chores?: Chore[];
  currentPackId?: string;
}

export default function Dashboard({ chores: choresProp, currentPackId }: DashboardProps = {}) {
  const storeChores = useAppStore((s) => s.chores);
  const chores = choresProp ?? storeChores;
  const completions = useAppStore((s) => s.completions);
  const xpSettings = useAppStore((s) => s.xpSettings);
  const profile = useAppStore((s) => s.profile);

  const [showNewChoreModal, setShowNewChoreModal] = useState(false);

  const now = new Date();

  const activeChores = chores.filter((c) => c.active);

  const withStatus: Array<{ chore: Chore; status: ChoreStatus }> = activeChores.map((chore) => {
    const choreCompletions = completions.filter((c) => c.choreKey === chore.key);
    const status = getChoreStatus(chore, choreCompletions, now);
    return { chore, status };
  });

  const grouped = new Map<ChoreStatus, Chore[]>();
  for (const { chore, status } of withStatus) {
    const existing = grouped.get(status) ?? [];
    existing.push(chore);
    grouped.set(status, existing);
  }

  for (const [status, group] of grouped) {
    if (status === 'overdue' || status === 'due') {
      group.sort((a, b) => {
        try {
          const idxA = getCurrentWindowIndex(a.recurrence, now) ?? 0;
          const idxB = getCurrentWindowIndex(b.recurrence, now) ?? 0;
          const endA = getWindowEnd(a.recurrence, idxA).getTime();
          const endB = getWindowEnd(b.recurrence, idxB).getTime();
          return endA - endB;
        } catch {
          return 0;
        }
      });
    } else if (status === 'completed') {
      group.sort((a, b) => {
        const lastA = completions
          .filter((c) => c.choreKey === a.key)
          .reduce((max, c) => Math.max(max, new Date(c.completedAt).getTime()), 0);
        const lastB = completions
          .filter((c) => c.choreKey === b.key)
          .reduce((max, c) => Math.max(max, new Date(c.completedAt).getTime()), 0);
        return lastA - lastB;
      });
    } else if (status === 'upcoming') {
      group.sort((a, b) => a.title.localeCompare(b.title));
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between pt-4">
        {!currentPackId && (
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        )}
        <button
          onClick={() => setShowNewChoreModal(true)}
          className={`rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 transition-colors ${currentPackId ? 'ml-auto' : ''}`}
        >
          + New Chore
        </button>
      </div>

      {activeChores.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No chores yet.</p>
          <p className="mt-1 text-sm text-gray-400">Add your first chore to get started.</p>
        </div>
      )}

      {SECTION_ORDER.map((status) => {
        const sectionChores = grouped.get(status);
        if (!sectionChores || sectionChores.length === 0) return null;

        return (
          <section key={status}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {SECTION_LABELS[status]}
            </h2>
            <div className="space-y-3">
              {sectionChores.map((chore) => (
                <ChoreCard
                  key={chore.key}
                  chore={chore}
                  completions={completions.filter((c) => c.choreKey === chore.key)}
                  xpSettings={xpSettings}
                  profile={profile}
                />
              ))}
            </div>
          </section>
        );
      })}

      {showNewChoreModal && (
        <ChoreFormModal
          packId={currentPackId ?? 'personal'}
          onClose={() => setShowNewChoreModal(false)}
        />
      )}
    </div>
  );
}
