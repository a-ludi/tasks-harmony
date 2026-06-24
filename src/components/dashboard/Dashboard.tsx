import { useState } from 'react';
import { useAppStore } from '@/store';
import { getChoreStatus, getCurrentWindowIndex, getWindowEnd } from '@/chores/recurrence';
import type { ChoreStatus, Chore } from '@/types';
import ChoreCard from './ChoreCard';
import ChoreFormModal from '@/components/chores/ChoreFormModal';
import { Button } from '@/components/ui/button';
import { useCompactMode } from '@/hooks/useCompactMode';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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

export function compactMenuLabel(compact: boolean): string {
  return compact ? 'Normal view' : 'Compact view';
}

export function archiveMenuLabel(archiveMode: boolean): string {
  return archiveMode ? 'Exit archive' : 'View archived';
}

export default function Dashboard({ chores: choresProp, currentPackId }: DashboardProps = {}) {
  const storeChores = useAppStore((s) => s.chores);
  const chores = choresProp ?? storeChores;
  const completions = useAppStore((s) => s.completions);
  const xpSettings = useAppStore((s) => s.xpSettings);
  const profile = useAppStore((s) => s.profile);
  const packs = useAppStore((s) => s.packs);
  const [showNewChoreModal, setShowNewChoreModal] = useState(false);
  const { compact, toggle: toggleCompact } = useCompactMode();

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
        } catch { return 0; }
      });
    } else if (status === 'completed') {
      group.sort((a, b) => {
        const lastA = completions.filter((c) => c.choreKey === a.key).reduce((max, c) => Math.max(max, new Date(c.completedAt).getTime()), 0);
        const lastB = completions.filter((c) => c.choreKey === b.key).reduce((max, c) => Math.max(max, new Date(c.completedAt).getTime()), 0);
        return lastA - lastB;
      });
    } else if (status === 'upcoming') {
      group.sort((a, b) => a.title.localeCompare(b.title));
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between pt-4">
        {!currentPackId && <h1 className="text-2xl font-bold">Dashboard</h1>}
        <div className={`flex items-center ${currentPackId ? 'ml-auto' : ''}`}>
          <div data-slot="button-group" className="flex">
            <Button onClick={() => setShowNewChoreModal(true)} className="rounded-r-none">
              + New Chore
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  aria-label={compact ? 'Exit compact view' : 'Toggle compact view'}
                  className="rounded-l-none border-l border-primary-foreground/20 px-2"
                >
                  ⌄
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={toggleCompact} className="flex items-center gap-2">
                  <span>{compact ? '⊞' : '⊟'}</span>
                  <span>{compactMenuLabel(compact)}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {activeChores.length === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No chores yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Add your first chore to get started.</p>
        </div>
      )}

      {SECTION_ORDER.map((status) => {
        const sectionChores = grouped.get(status);
        if (!sectionChores || sectionChores.length === 0) return null;
        return (
          <section key={status}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {SECTION_LABELS[status]}
            </h2>
            <div data-compact-list={compact || undefined} className="space-y-3">
              {sectionChores.map((chore) => (
                <ChoreCard
                  key={chore.key}
                  chore={chore}
                  completions={completions.filter((c) => c.choreKey === chore.key)}
                  xpSettings={xpSettings}
                  profile={profile}
                  packTitle={packs.find((p) => p.id === chore.packId)?.manifest.title}
                  compact={compact}
                />
              ))}
            </div>
          </section>
        );
      })}

      {showNewChoreModal && (
        <ChoreFormModal packId={currentPackId ?? 'personal'} onClose={() => setShowNewChoreModal(false)} />
      )}
    </div>
  );
}
