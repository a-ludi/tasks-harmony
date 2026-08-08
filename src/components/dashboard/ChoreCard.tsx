import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/shallow';
import type { Chore, Completion, XPSettings, UserProfile, ChoreStatus } from '@/types';
import { useAppStore } from '@/store';
import { getChoreStatus, formatRecurrence } from '@/chores/recurrence';
import { computeNewStreak } from '@/chores/streak';
import { calculateXP } from '@/xp/calculator';
import StatusBadge from './StatusBadge';
import CompleteButton from '@/components/chores/CompleteButton';
import ChoreActionsDropdown from '@/components/chores/ChoreActionsDropdown';
import QuickCompleteButtonList from '@/components/chores/QuickCompleteButtonList';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card';
import { MarkdownDisplay } from '@/components/ui/MarkdownDisplay';

interface Props {
  chore: Chore;
  completions: Completion[];
  xpSettings: XPSettings[];
  profile: UserProfile | null;
  packTitle?: string;
  compact?: boolean;
}

const BORDER_COLOR: Record<ChoreStatus, string> = {
  overdue: 'border-l-red-500',
  due: 'border-l-amber-400',
  completed: 'border-l-green-500',
  upcoming: 'border-l-slate-300',
};

export default function ChoreCard({ chore, completions, xpSettings, profile, packTitle, compact }: Props) {
  const chorePack = useAppStore((s) => s.packs.find((p) => p.id === chore.packId));
  const packStreak = chorePack?.manifest.streak ?? true;

  const now = new Date();
  const choreCompletions = completions.filter((c) => c.choreKey === chore.key);
  const status = getChoreStatus(chore, choreCompletions, now);
  const activeSettings = xpSettings.find((s) => s.id === profile?.activeXPSettingsId) ?? xpSettings[0];
  const nextStreak = activeSettings && packStreak ? computeNewStreak(chore, choreCompletions, now) : 0;
  const nextTotalCompletions = choreCompletions.length;
  const effectiveXP = activeSettings ? calculateXP(chore.xpSize, nextStreak, nextTotalCompletions, activeSettings) : 0;
  const sortedCompletions = [...choreCompletions].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  const currentStreak = sortedCompletions[0]?.streak ?? 0;

  const isArchived = !chore.active;

  return (
    <>
      <Card
        data-testid="chore-card"
        data-compact={compact || undefined}
        className={`border-l-4 ${BORDER_COLOR[status]}`}
      >
        <CardHeader>
          <CardTitle className="text-sm leading-snug">
            <Link to={`/chores/${encodeURIComponent(chore.key)}`} className="hover:underline">
              {chore.title}
              {packTitle && <span className="ml-2 text-xs font-normal text-muted-foreground">{packTitle}</span>}
            </Link>
          </CardTitle>
          <CardDescription className="flex items-center gap-2">
            <StatusBadge status={status} />
          </CardDescription>
          <CardAction>
            <div className="flex items-center gap-1">
              {(status === 'due' || status === 'overdue') && <CompleteButton choreKey={chore.key} disabled={isArchived} />}
              {status === 'completed' && chore.repeatable && <CompleteButton choreKey={chore.key} label="Complete again" disabled={isArchived} />}
              <ChoreActionsDropdown chore={chore} />
            </div>
          </CardAction>
        </CardHeader>

        <CardContent className="chore-card-content pt-0 pb-3">
          {chore.description && (
            <div className="chore-description mb-1 max-h-10 overflow-hidden">
              <MarkdownDisplay key={chore.description} content={chore.description} className="text-sm text-muted-foreground" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="chore-xp"><span className="font-medium text-foreground">{effectiveXP}</span> XP</span>
            {packStreak && currentStreak > 0 && (
              <span>Streak: <span className="font-medium text-foreground">{currentStreak}</span></span>
            )}
            <span className="chore-recurrence">{formatRecurrence(chore.recurrence)}</span>
          </div>

          <QuickCompleteButtonList chore={chore} disabled={isArchived} />
        </CardContent>
      </Card>

    </>
  );
}
