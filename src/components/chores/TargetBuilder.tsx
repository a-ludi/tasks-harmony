import { useState } from 'react';
import type { Question, Completion, XPSize, Answer } from '@/types';
import type { DraftTarget } from '@/store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TargetFormModal from './TargetFormModal';
import { getAnswerDisplay } from '@/questions/display';

const XP_SIZES: XPSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

interface Props {
  questions: Question[];
  existingCompletions: Completion[];
  drafts: DraftTarget[];
  bonusEnabled: boolean;
  bonusXPSize: XPSize;
  choreXPSize: XPSize | number;
  onChange: (drafts: DraftTarget[]) => void;
  onBonusEnabledChange: (enabled: boolean) => void;
  onBonusXPSizeChange: (size: XPSize) => void;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  return String(a).localeCompare(String(b));
}

export function isDuplicateOfAnyDraft(
  completionAnswers: Answer[],
  drafts: DraftTarget[],
  questions: Question[],
): boolean {
  return drafts.some((draft) =>
    questions.every((q) => {
      const completionVal = completionAnswers.find((a) => a.questionId === q.id)?.value ?? null;
      const draftVal = draft.answers.find((a) => a.questionId === q.id)?.value ?? null;
      return completionVal === draftVal;
    }),
  );
}

export default function TargetBuilder({
  questions, existingCompletions, drafts, bonusEnabled, bonusXPSize, choreXPSize,
  onChange, onBonusEnabledChange, onBonusXPSizeChange,
}: Props) {
  const [editingDraft, setEditingDraft] = useState<DraftTarget | 'new' | null>(null);

  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
  const activeDrafts = drafts.filter((d) => !d._deleted);
  const deletedDrafts = drafts.filter((d) => d._deleted);

  const linkedCompletionIds = new Set(activeDrafts.map((d) => d.linkedCompletionId).filter(Boolean));
  const unlinkedCompletions = existingCompletions.filter((c) => {
    if (c.targetId) return false;
    if (linkedCompletionIds.has(c.id)) return false;
    return !isDuplicateOfAnyDraft(c.answers, activeDrafts, sortedQuestions);
  });

  const sortedDrafts = [...activeDrafts].sort((a, b) => {
    for (const q of sortedQuestions) {
      const av = a.answers.find((ans) => ans.questionId === q.id)?.value ?? null;
      const bv = b.answers.find((ans) => ans.questionId === q.id)?.value ?? null;
      const r = compareValues(av, bv);
      if (r !== 0) return r;
    }
    return 0;
  });

  function handleSave(saved: DraftTarget) {
    if (editingDraft === 'new') {
      onChange([...drafts, { ...saved, order: activeDrafts.length }]);
    } else {
      onChange(drafts.map((d) => d.id === saved.id ? { ...d, ...saved } : d));
    }
    setEditingDraft(null);
  }

  function handleDelete(id: string) {
    onChange(drafts.map((d) => d.id === id ? { ...d, _deleted: true } : d));
  }

  function handleRestore(id: string) {
    onChange(drafts.map((d) => d.id === id ? { ...d, _deleted: false } : d));
  }

  function summarise(draft: DraftTarget): string {
    return sortedQuestions
      .map((q) => {
        const ans = draft.answers.find((a) => a.questionId === q.id);
        if (!ans) return null;
        return getAnswerDisplay([ans], q);
      })
      .filter(Boolean)
      .join(', ') || '(empty)';
  }

  const defaultBonusSize: XPSize = typeof choreXPSize === 'string' ? choreXPSize as XPSize : 'M';

  return (
    <div className="space-y-3">
      {/* Set completion bonus */}
      <div className="flex items-center gap-3">
        <input
          id="bonus-enabled"
          type="checkbox"
          checked={bonusEnabled}
          onChange={(e) => {
            onBonusEnabledChange(e.target.checked);
            if (e.target.checked) onBonusXPSizeChange(defaultBonusSize);
          }}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <Label htmlFor="bonus-enabled" className="font-normal">Set completion bonus</Label>
      </div>
      {bonusEnabled && (
        <div className="ml-7">
          <Select value={bonusXPSize} onValueChange={(v) => onBonusXPSizeChange(v as XPSize)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {XP_SIZES.map((size) => (
                <SelectItem key={size} value={size}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Target list */}
      <Button type="button" variant="outline" size="sm" onClick={() => setEditingDraft('new')}>
        + Add target
      </Button>

      <div className="space-y-1">
        {sortedDrafts.map((draft) => (
          <div key={draft.id} className="flex items-center gap-2 rounded border border-border px-2 py-1 text-sm">
            <span className="flex-1 text-foreground truncate">{summarise(draft)}</span>
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline" onClick={() => setEditingDraft(draft)}>Edit</button>
            <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => handleDelete(draft.id)} aria-label="Remove target">×</button>
          </div>
        ))}
        {deletedDrafts.map((draft) => (
          <div key={draft.id} className="flex items-center gap-2 rounded border border-border px-2 py-1 text-sm opacity-40">
            <span className="flex-1 truncate line-through">{summarise(draft)}</span>
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline" onClick={() => handleRestore(draft.id)}>Restore</button>
          </div>
        ))}
      </div>

      {editingDraft !== null && (
        <TargetFormModal
          questions={sortedQuestions}
          unlinkedCompletions={editingDraft === 'new' ? unlinkedCompletions : []}
          initialDraft={editingDraft === 'new' ? undefined : editingDraft}
          onSave={handleSave}
          onClose={() => setEditingDraft(null)}
        />
      )}
    </div>
  );
}
