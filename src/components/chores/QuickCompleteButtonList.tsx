import { useShallow } from 'zustand/shallow';
import { useAppStore } from '@/store';
import type { Chore } from '@/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getChoreStatus } from '@/chores/recurrence';
import QuickCompleteButton from './QuickCompleteButton';

interface Props {
  chore: Chore;
  disabled?: boolean;
}

export default function QuickCompleteButtonList({ chore, disabled }: Props) {
  const quickAnswerSets = useAppStore(useShallow((s) => s.quickAnswerSets.filter((qs) => qs.choreKey === chore.key)));
  const completions = useAppStore(useShallow((s) => s.completions.filter((c) => c.choreKey === chore.key)));

  if (quickAnswerSets.length === 0) return null;

  const status = getChoreStatus(chore, completions, new Date());
  const actionable = status === 'due' || status === 'overdue' || (status === 'completed' && chore.repeatable);
  if (!actionable) return null;

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-2">
        {quickAnswerSets.map((set) => (
          <QuickCompleteButton key={set.id} set={set} chore={chore} disabled={disabled} />
        ))}
      </div>
    </TooltipProvider>
  );
}
