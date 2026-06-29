import { useState } from 'react';
import type { Question } from '@/types';
import QuestionFormFields, { type DraftQuestion } from './QuestionFormFields';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  choreKey: string;
  initialQuestions: Question[];
  onChange: (drafts: DraftQuestion[]) => void;
}

const TYPE_LABELS: Record<string, string> = {
  TEXT: 'Text', INTEGER: 'Integer', BOOLEAN: 'Yes / No',
  ENUM: 'Multiple Choice', MULTIPLIER: 'Score Multiplier',
};

export default function QuestionBuilder({ choreKey, initialQuestions, onChange }: Props) {
  const [drafts, setDrafts] = useState<DraftQuestion[]>(() =>
    initialQuestions.slice().sort((a, b) => a.order - b.order).map((q) => ({ ...q })),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function commit(next: DraftQuestion[]) { setDrafts(next); onChange(next); }

  function handleAdd() {
    const activeDrafts = drafts.filter((d) => !d._deleted);
    const maxOrder = activeDrafts.length > 0 ? Math.max(...activeDrafts.map((d) => d.order)) : -1;
    const newQuestion: DraftQuestion = { id: crypto.randomUUID(), choreKey, prompt: '', type: 'TEXT', required: true, order: maxOrder + 1, _isNew: true };
    const next = [...drafts, newQuestion];
    commit(next);
    setExpandedId(newQuestion.id);
  }

  function handleRemove(id: string) {
    const target = drafts.find((d) => d.id === id);
    if (!target) return;
    if (target._isNew) { commit(drafts.filter((d) => d.id !== id)); } else { commit(drafts.map((d) => (d.id === id ? { ...d, _deleted: true } : d))); }
    if (expandedId === id) setExpandedId(null);
  }

  function handleRestore(id: string) { commit(drafts.map((d) => (d.id === id ? { ...d, _deleted: false } : d))); }
  function handleUpdate(updated: DraftQuestion) { commit(drafts.map((d) => (d.id === updated.id ? updated : d))); }

  function handleMoveUp(id: string) {
    const active = drafts.filter((d) => !d._deleted).sort((a, b) => a.order - b.order);
    const idx = active.findIndex((d) => d.id === id);
    if (idx <= 0) return;
    const prevOrder = active[idx - 1].order; const currOrder = active[idx].order;
    commit(drafts.map((d) => { if (d.id === active[idx - 1].id) return { ...d, order: currOrder }; if (d.id === active[idx].id) return { ...d, order: prevOrder }; return d; }));
  }

  function handleMoveDown(id: string) {
    const active = drafts.filter((d) => !d._deleted).sort((a, b) => a.order - b.order);
    const idx = active.findIndex((d) => d.id === id);
    if (idx === -1 || idx === active.length - 1) return;
    const nextOrder = active[idx + 1].order; const currOrder = active[idx].order;
    commit(drafts.map((d) => { if (d.id === active[idx + 1].id) return { ...d, order: currOrder }; if (d.id === active[idx].id) return { ...d, order: nextOrder }; return d; }));
  }

  const activeQuestions = drafts.filter((d) => !d._deleted).sort((a, b) => a.order - b.order);
  const deletedQuestions = drafts.filter((d) => d._deleted);

  return (
    <div className="space-y-2">
      {activeQuestions.length === 0 && deletedQuestions.length === 0 && (
        <p className="text-sm text-muted-foreground italic py-2">No questions attached. Click "Add Question" to start.</p>
      )}

      {activeQuestions.map((draft, index) => (
        <div key={draft.id} className="rounded-lg border bg-card shadow-sm">
          <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setExpandedId(expandedId === draft.id ? null : draft.id)}>
            <div className="flex flex-col gap-0.5 shrink-0">
              <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); handleMoveUp(draft.id); }} disabled={index === 0} title="Move up">▲</Button>
              <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); handleMoveDown(draft.id); }} disabled={index === activeQuestions.length - 1} title="Move down">▼</Button>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{draft.prompt || <span className="text-muted-foreground italic">Untitled question</span>}</p>
              <div className="flex gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">{TYPE_LABELS[draft.type] ?? draft.type}</span>
                {draft.required && <Badge variant="secondary" className="text-xs px-1.5 py-0 h-auto">Required</Badge>}
                {draft._isNew && <Badge variant="outline" className="text-xs px-1.5 py-0 h-auto text-amber-700 border-amber-300">New</Badge>}
              </div>
            </div>
            <span className="text-muted-foreground text-xs shrink-0">{expandedId === draft.id ? '▾' : '▸'}</span>
            <Button type="button" variant="ghost" size="sm" className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); handleRemove(draft.id); }} title="Remove question">Remove</Button>
          </div>
          {expandedId === draft.id && (
            <div className="border-t p-3">
              <QuestionFormFields question={draft} onChange={handleUpdate} />
            </div>
          )}
        </div>
      ))}

      {deletedQuestions.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending removal</p>
          {deletedQuestions.map((draft) => (
            <div key={draft.id} className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-3 opacity-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground truncate line-through">{draft.prompt || 'Untitled question'}</p>
                <span className="text-xs text-muted-foreground">{TYPE_LABELS[draft.type] ?? draft.type}</span>
              </div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 text-green-600 hover:text-green-800 hover:bg-green-50" onClick={() => handleRestore(draft.id)}>Restore</Button>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" onClick={handleAdd} className="mt-2 w-full border-dashed text-muted-foreground hover:text-foreground">
        + Add Question
      </Button>
    </div>
  );
}
