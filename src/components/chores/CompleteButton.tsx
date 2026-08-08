import { useState } from 'react';
import { useAppStore } from '@/store';
import { useShallow } from 'zustand/shallow';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { eligiblePastWindows } from '@/chores/eligiblePastWindows';
import CompletionModal from '@/components/completion/CompletionModal';
import LogPastCompletionModal from '@/components/completion/LogPastCompletionModal';

interface Props {
  choreKey: string;
  label?: string;
  disabled?: boolean;
}

export default function CompleteButton({ choreKey, label = 'Complete', disabled: disabledProp }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const chore = useAppStore((s) => s.chores.find((c) => c.key === choreKey));
  const choreCompletions = useAppStore(useShallow((s) => s.completions.filter((c) => c.choreKey === choreKey)));
  const questions = useAppStore(useShallow((s) => s.questions.filter((q) => q.choreKey === choreKey)));
  const [processing, setProcessing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showLogPastModal, setShowLogPastModal] = useState(false);

  const eligibleWindows = chore ? eligiblePastWindows(chore, choreCompletions, new Date()) : [];
  const canLogPast = eligibleWindows.length > 0;

  async function handleClick() {
    if (processing || disabledProp) return;
    if (questions.length > 0) { setShowModal(true); return; }
    setProcessing(true);
    try { await recordCompletion(choreKey); } finally { setProcessing(false); }
  }

  const btnClass = 'bg-green-600 hover:bg-green-700 text-white disabled:bg-green-600 disabled:opacity-50';

  return (
    <>
      <div className="flex">
        <Button
          onClick={handleClick}
          disabled={processing || !!disabledProp}
          size="sm"
          className={`${btnClass} rounded-r-none`}
        >
          {processing ? 'Saving…' : label}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              disabled={!!disabledProp}
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
        <CompletionModal choreKey={choreKey} questions={questions} onClose={() => setShowModal(false)} />
      )}
      {showLogPastModal && chore && (
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
