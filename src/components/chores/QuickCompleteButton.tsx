import { useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { useAppStore } from '@/store';
import type { Chore, QuickAnswerSet } from '@/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getAnswerDisplay } from '@/questions/display';

interface Props {
  set: QuickAnswerSet;
  chore: Chore;
  disabled?: boolean;
}

export default function QuickCompleteButton({ set, chore, disabled }: Props) {
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const questions = useAppStore(useShallow((s) => s.questions.filter((q) => q.choreKey === chore.key)));
  const [processing, setProcessing] = useState(false);

  async function handleClick() {
    if (processing || disabled) return;
    setProcessing(true);
    try { await recordCompletion(chore.key, set.answers); } finally { setProcessing(false); }
  }

  const tooltipRows = [...questions].sort((a, b) => a.order - b.order).map((q) => ({
    prompt: q.prompt,
    display: getAnswerDisplay(set.answers, q) || '—',
  }));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClick}
          disabled={disabled || processing}
          className="rounded-full border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800/30"
        >
          {processing ? 'Saving…' : `⚡ ${set.label}`}
        </Button>
      </TooltipTrigger>
      {tooltipRows.length > 0 && (
        <TooltipContent>
          <p className="mb-1 text-xs font-semibold">{set.label}</p>
          {tooltipRows.map((row) => (
            <div key={row.prompt} className="flex justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{row.prompt}</span>
              <span className="font-medium">{row.display}</span>
            </div>
          ))}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
