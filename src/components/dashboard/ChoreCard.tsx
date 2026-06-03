import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/shallow';
import type { Chore, Completion, XPSettings, UserProfile, ChoreStatus, QuickAnswerSet } from '@/types';
import { useAppStore } from '@/store';
import { getChoreStatus, formatRecurrence } from '@/chores/recurrence';
import { computeNewStreak } from '@/chores/streak';
import { calculateXP } from '@/xp/calculator';
import { getAnswerDisplay } from '@/questions/display';
import StatusBadge from './StatusBadge';
import CompleteButton from '@/components/chores/CompleteButton';
import ChoreFormModal from '@/components/chores/ChoreFormModal';

interface Props {
  chore: Chore;
  completions: Completion[];
  xpSettings: XPSettings[];
  profile: UserProfile | null;
  packTitle?: string;
}

const BORDER_COLOR: Record<ChoreStatus, string> = {
  overdue: 'border-l-red-500',
  due: 'border-l-amber-400',
  completed: 'border-l-green-500',
  upcoming: 'border-l-slate-300',
};

export default function ChoreCard({ chore, completions, xpSettings, profile, packTitle }: Props) {
  const deactivateChore = useAppStore((s) => s.deactivateChore);
  const [showEditModal, setShowEditModal] = useState(false);
  const quickAnswerSets = useAppStore(
    useShallow((s) => s.quickAnswerSets.filter((set) => set.choreKey === chore.key)),
  );
  const questions = useAppStore(
    useShallow((s) => s.questions.filter((q) => q.choreKey === chore.key)),
  );
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const [quickCompleting, setQuickCompleting] = useState<string | null>(null);

  async function handleQuickComplete(set: QuickAnswerSet) {
    if (quickCompleting) return;
    setQuickCompleting(set.id);
    try {
      await recordCompletion(chore.key, set.answers);
    } finally {
      setQuickCompleting(null);
    }
  }

  const now = new Date();
  const choreCompletions = completions.filter((c) => c.choreKey === chore.key);
  const status = getChoreStatus(chore, choreCompletions, now);

  const activeSettings =
    xpSettings.find((s) => s.id === profile?.activeXPSettingsId) ?? xpSettings[0];

  const nextStreak = activeSettings ? computeNewStreak(chore, choreCompletions, now) : 1;
  const nextTotalCompletions = choreCompletions.length;
  const effectiveXP = activeSettings
    ? calculateXP(chore.xpSize, nextStreak, nextTotalCompletions, activeSettings)
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
      <div data-testid="chore-card" className={`rounded-xl border border-gray-200 border-l-4 ${BORDER_COLOR[status]} bg-white p-4 shadow-sm`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900 leading-tight">{chore.title}</h3>
              <StatusBadge status={status} />
            </div>

            {packTitle && (
              <p className="text-xs text-gray-400">{packTitle}</p>
            )}

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
            <div className="flex gap-1 items-center">
              <Link
                to={`/chores/${encodeURIComponent(chore.key)}/completions`}
                className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                title="View completions"
              >
                Completions
              </Link>
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

        {quickAnswerSets.length > 0 && (status === 'due' || status === 'overdue' || (status === 'completed' && chore.repeatable)) && (
          <div className="mt-2 flex flex-wrap gap-2 border-t border-gray-100 pt-2">
            {quickAnswerSets.map((set) => {
              const tooltipRows = [...questions]
                .sort((a, b) => a.order - b.order)
                .map((q) => ({
                  prompt: q.prompt,
                  display: getAnswerDisplay(set.answers, q) || '—',
                }));

              return (
                <div key={set.id} className="group relative">
                  <button
                    onClick={() => handleQuickComplete(set)}
                    disabled={!!quickCompleting}
                    className="rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
                  >
                    {quickCompleting === set.id ? 'Saving…' : `⚡ ${set.label}`}
                  </button>
                  {tooltipRows.length > 0 && (
                    <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden min-w-40 rounded-lg border border-gray-200 bg-white p-2 shadow-lg group-hover:block">
                      <p className="mb-1 text-xs font-semibold text-gray-500">{set.label}</p>
                      {tooltipRows.map((row) => (
                        <div key={row.prompt} className="flex justify-between gap-3 text-xs">
                          <span className="text-gray-500">{row.prompt}</span>
                          <span className="font-medium text-gray-700">{row.display}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
