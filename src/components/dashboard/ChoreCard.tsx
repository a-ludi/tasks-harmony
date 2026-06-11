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
import DuplicateChoreDialog from '@/components/chores/DuplicateChoreDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
  const deactivateChore = useAppStore((s) => s.deactivateChore);
  const allChores = useAppStore((s) => s.chores);
  const [showEditModal, setShowEditModal] = useState(false);
  const quickAnswerSets = useAppStore(useShallow((s) => s.quickAnswerSets.filter((set) => set.choreKey === chore.key)));
  const questions = useAppStore(useShallow((s) => s.questions.filter((q) => q.choreKey === chore.key)));
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const [quickCompleting, setQuickCompleting] = useState<string | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [editAfterDuplicateKey, setEditAfterDuplicateKey] = useState<string | null>(null);

  async function handleQuickComplete(set: QuickAnswerSet) {
    if (quickCompleting) return;
    setQuickCompleting(set.id);
    try { await recordCompletion(chore.key, set.answers); } finally { setQuickCompleting(null); }
  }

  const now = new Date();
  const choreCompletions = completions.filter((c) => c.choreKey === chore.key);
  const status = getChoreStatus(chore, choreCompletions, now);
  const activeSettings = xpSettings.find((s) => s.id === profile?.activeXPSettingsId) ?? xpSettings[0];
  const nextStreak = activeSettings ? computeNewStreak(chore, choreCompletions, now) : 1;
  const nextTotalCompletions = choreCompletions.length;
  const effectiveXP = activeSettings ? calculateXP(chore.xpSize, nextStreak, nextTotalCompletions, activeSettings) : 0;
  const sortedCompletions = [...choreCompletions].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  const currentStreak = sortedCompletions[0]?.streak ?? 0;

  async function handleDeactivate() {
    if (window.confirm(`Archive "${chore.title}"? It will be removed from the dashboard.`)) {
      await deactivateChore(chore.key);
    }
  }

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
              {(status === 'due' || status === 'overdue') && <CompleteButton choreKey={chore.key} />}
              {status === 'completed' && chore.repeatable && <CompleteButton choreKey={chore.key} label="Complete again" />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Chore actions">⋮</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowEditModal(true)}>Edit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowDuplicateDialog(true)}>Duplicate</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={handleDeactivate}>Archive</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardAction>
        </CardHeader>

        <CardContent className="chore-card-content pt-0 pb-3">
          {chore.description && (
            <div className="chore-description mb-1 max-h-10 overflow-hidden">
              <MarkdownDisplay content={chore.description} className="text-sm text-muted-foreground" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="chore-xp"><span className="font-medium text-foreground">{effectiveXP}</span> XP</span>
            {currentStreak > 0 && (
              <span>Streak: <span className="font-medium text-foreground">{currentStreak}</span></span>
            )}
            <span className="chore-recurrence">{formatRecurrence(chore.recurrence)}</span>
          </div>

          {quickAnswerSets.length > 0 && (status === 'due' || status === 'overdue' || (status === 'completed' && chore.repeatable)) && (
            <div className="mt-2 flex flex-wrap gap-2 border-t pt-2">
              <TooltipProvider>
                {quickAnswerSets.map((set) => {
                  const tooltipRows = [...questions].sort((a, b) => a.order - b.order).map((q) => ({
                    prompt: q.prompt,
                    display: getAnswerDisplay(set.answers, q) || '—',
                  }));
                  return (
                    <Tooltip key={set.id}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleQuickComplete(set)}
                          disabled={!!quickCompleting}
                          className="rounded-full border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800/30"
                        >
                          {quickCompleting === set.id ? 'Saving…' : `⚡ ${set.label}`}
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
                })}
              </TooltipProvider>
            </div>
          )}
        </CardContent>
      </Card>

      {showEditModal && <ChoreFormModal chore={chore} packId={chore.packId} onClose={() => setShowEditModal(false)} />}
      {showDuplicateDialog && (
        <DuplicateChoreDialog
          chore={chore}
          onClose={() => setShowDuplicateDialog(false)}
          onDuplicateAndEdit={(newKey) => { setShowDuplicateDialog(false); setEditAfterDuplicateKey(newKey); }}
        />
      )}
      {editAfterDuplicateKey && (() => {
        const dupeChore = allChores.find((c) => c.key === editAfterDuplicateKey);
        return dupeChore ? <ChoreFormModal chore={dupeChore} packId={dupeChore.packId} onClose={() => setEditAfterDuplicateKey(null)} /> : null;
      })()}
    </>
  );
}
