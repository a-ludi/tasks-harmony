import { useState } from 'react';
import type { Chore, Completion, XPSettings, UserProfile, ChoreStatus } from '@/types';
import { useAppStore } from '@/store';
import { getChoreStatus, formatRecurrence } from '@/chores/recurrence';
import { computeNewStreak } from '@/chores/streak';
import { calculateXP } from '@/xp/calculator';
import StatusBadge from './StatusBadge';
import CompleteButton from '@/components/chores/CompleteButton';
import ChoreFormModal from '@/components/chores/ChoreFormModal';

interface Props {
  chore: Chore;
  completions: Completion[];
  xpSettings: XPSettings[];
  profile: UserProfile | null;
}

const BORDER_COLOR: Record<ChoreStatus, string> = {
  overdue: 'border-l-red-500',
  due: 'border-l-amber-400',
  completed: 'border-l-green-500',
  upcoming: 'border-l-slate-300',
};

export default function ChoreCard({ chore, completions, xpSettings, profile }: Props) {
  const deactivateChore = useAppStore((s) => s.deactivateChore);
  const [showEditModal, setShowEditModal] = useState(false);

  const now = new Date();
  const choreCompletions = completions.filter((c) => c.choreKey === chore.key);
  const status = getChoreStatus(chore, choreCompletions, now);

  const activeSettings =
    xpSettings.find((s) => s.id === profile?.activeXPSettingsId) ?? xpSettings[0];

  const nextStreak = activeSettings ? computeNewStreak(chore, choreCompletions, now) : 1;
  const effectiveXP = activeSettings
    ? calculateXP(chore.xpSize, nextStreak, activeSettings)
    : 0;

  const sortedCompletions = [...choreCompletions].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  );
  const currentStreak = sortedCompletions[0]?.streak ?? 0;

  async function handleDeactivate() {
    if (window.confirm(`Archive "${chore.title}"? It will be removed from the dashboard.`)) {
      await deactivateChore(chore.key);
    }
  }

  return (
    <>
      <div className={`rounded-xl border border-gray-200 border-l-4 ${BORDER_COLOR[status]} bg-white p-4 shadow-sm`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900 leading-tight">{chore.title}</h3>
              <StatusBadge status={status} />
            </div>

            {chore.description && (
              <p className="mb-2 text-sm text-gray-500 line-clamp-2">{chore.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <span><span className="font-medium text-gray-700">{effectiveXP}</span> XP</span>
              {currentStreak > 0 && (
                <span>Streak: <span className="font-medium text-gray-700">{currentStreak}</span></span>
              )}
              <span>{formatRecurrence(chore.recurrence)}</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {(status === 'due' || status === 'overdue') && (
              <CompleteButton choreKey={chore.key} />
            )}
            {status === 'completed' && chore.repeatable && (
              <CompleteButton choreKey={chore.key} label="Complete again" />
            )}
            <div className="flex gap-1">
              <button
                onClick={() => setShowEditModal(true)}
                title="Edit chore"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                ✎
              </button>
              <button
                onClick={handleDeactivate}
                title="Archive chore"
                className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      </div>

      {showEditModal && (
        <ChoreFormModal
          chore={chore}
          packId={chore.packId}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  );
}
