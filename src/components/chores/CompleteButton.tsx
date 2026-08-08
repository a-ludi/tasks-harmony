import { useState, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/shallow';
import { useAppStore } from '@/store';
import type { Chore } from '@/types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getChoreStatus } from '@/chores/recurrence';
import { eligiblePastWindows } from '@/chores/eligiblePastWindows';
import CompletionModal from '@/components/completion/CompletionModal';
import LogPastCompletionModal from '@/components/completion/LogPastCompletionModal';

interface Props {
  chore: Chore;
  disabled?: boolean;
}

export default function CompleteButton({ chore, disabled }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const questions = useAppStore(useShallow((s) => s.questions.filter((q) => q.choreKey === chore.key)));
  const completions = useAppStore(useShallow((s) => s.completions.filter((c) => c.choreKey === chore.key)));
  const [processing, setProcessing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showLogPastModal, setShowLogPastModal] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const status = getChoreStatus(chore, completions, new Date());
  const showComplete = status === 'due' || status === 'overdue';
  const showCompleteAgain = status === 'completed' && chore.repeatable;

  if (!showComplete && !showCompleteAgain) return null;

  const label = showCompleteAgain ? 'Complete again' : 'Complete';

  const eligibleWindows = eligiblePastWindows(chore, completions, new Date());
  const canLogPast = eligibleWindows.length > 0;

  async function handleClick() {
    if (processing || disabled) return;
    if (questions.length > 0) { setShowModal(true); return; }
    setProcessing(true);
    try { await recordCompletion(chore.key); } finally { if (mountedRef.current) setProcessing(false); }
  }

  const btnClass = 'bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50';

  return (
    <>
      <div className="flex">
        <Button
          onClick={handleClick}
          disabled={disabled || processing}
          size="sm"
          className={`${btnClass} rounded-r-none`}
        >
          {processing ? 'Saving…' : label}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              disabled={!!disabled}
              className={`${btnClass} rounded-l-none border-l border-green-500/40 px-1.5`}
              aria-label="More completion options"
            >
              ▾
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!canLogPast}
              onClick={() => { if (canLogPast) setShowLogPastModal(true); }}
            >
              Log past completion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showModal && (
        <CompletionModal choreKey={chore.key} questions={questions} onClose={() => setShowModal(false)} />
      )}
      {showLogPastModal && (
        <LogPastCompletionModal
          chore={chore}
          eligibleWindows={eligibleWindows}
          questions={questions}
          onClose={() => setShowLogPastModal(false)}
        />
      )}
    </>
  );
}
